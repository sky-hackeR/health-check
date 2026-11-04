import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentStatus, QuestionType } from '@prisma/client';
import * as crypto from 'crypto';
import { StartAssessmentDto } from './dto/start-assessment.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { CalculatorConfigResponseDto } from './dto/calculator-config.dto';
import {
  StartAssessmentResponseDto,
  AssessmentStateResponseDto,
  SaveAnswersResponseDto,
  CompleteAssessmentResponseDto,
  AssessmentProgressDto,
  AssessmentQuestionDto,
  SavedAnswerDto,
} from './dto/assessment-response.dto';
import { ConditionEvaluator, AnswerSnapshot } from './condition-evaluator';
import { ScoringService } from '../scoring/scoring.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import {
  AssessmentResultResponseDto,
  AssessmentRecommendationItemDto,
  AssessmentFullResultResponseDto,
} from './dto/assessment-result-response.dto';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  // Standard session expiration window (30 days)
  private readonly SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly recommendationService: RecommendationService,
  ) {}

  /**
   * Generates a cryptographically secure 64-character hex session token.
   */
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Retrieves active published configuration for a calculator by slug.
   * Internal scoring formulas and proprietary weights are withheld.
   */
  async getCalculatorConfig(slug: string): Promise<CalculatorConfigResponseDto> {
    const calculator = await this.prisma.calculator.findUnique({
      where: { slug },
      include: {
        versions: {
          where: { isPublished: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            scoreCategories: {
              orderBy: { code: 'asc' },
            },
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                scoreCategory: true,
                options: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!calculator || !calculator.isActive || calculator.deletedAt) {
      throw new NotFoundException(`Calculator "${slug}" was not found or is currently inactive.`);
    }

    const publishedVersion = calculator.versions[0];
    if (!publishedVersion) {
      throw new NotFoundException(`Calculator "${slug}" has no active published versions.`);
    }

    return {
      id: calculator.id,
      slug: calculator.slug,
      name: calculator.name,
      description: calculator.description,
      versionNumber: publishedVersion.versionNumber,
      publishedAt: publishedVersion.publishedAt,
      categories: publishedVersion.scoreCategories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
      questions: publishedVersion.questions.map((q) => ({
        id: q.id,
        code: q.code,
        title: q.title,
        helpText: q.helpText,
        type: q.type,
        orderIndex: q.orderIndex,
        isRequired: q.isRequired,
        categoryCode: q.scoreCategory?.code || null,
        categoryName: q.scoreCategory?.name || null,
        displayConditions: q.displayConditions,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          orderIndex: o.orderIndex,
          metadata: o.metadata,
        })),
      })),
      totalQuestions: publishedVersion.questions.length,
    };
  }

  /**
   * Starts an anonymous assessment session with a cryptographically secure token.
   */
  async startAssessment(
    dto: StartAssessmentDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<StartAssessmentResponseDto> {
    const calculator = await this.prisma.calculator.findUnique({
      where: { slug: dto.calculatorSlug },
      include: {
        versions: {
          where: { isPublished: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            questions: true,
          },
        },
      },
    });

    if (!calculator || !calculator.isActive || calculator.deletedAt) {
      throw new NotFoundException(`Calculator "${dto.calculatorSlug}" is invalid or inactive.`);
    }

    const publishedVersion = calculator.versions[0];
    if (!publishedVersion) {
      throw new NotFoundException(`Calculator "${dto.calculatorSlug}" has no published versions.`);
    }

    // Verify campaign if provided
    if (dto.campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: dto.campaignId },
      });
      if (!campaign) {
        this.logger.warn(`Invalid campaignId provided: ${dto.campaignId}`);
      }
    }

    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + this.SESSION_TTL_MS);

    const assessment = await this.prisma.assessment.create({
      data: {
        sessionToken,
        calculatorVersionId: publishedVersion.id,
        status: AssessmentStatus.IN_PROGRESS,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        campaignId: dto.campaignId || null,
      },
    });

    // Optional tracking event logging
    if (dto.utmSource || dto.utmMedium || dto.utmCampaign) {
      try {
        await this.prisma.trackingEvent.create({
          data: {
            visitorToken: assessment.sessionToken,
            assessmentId: assessment.id,
            eventType: 'ASSESSMENT_START',
            metadata: {
              source: dto.utmSource || null,
              medium: dto.utmMedium || null,
              campaignName: dto.utmCampaign || null,
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
            },
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to log initial tracking event: ${(err as Error).message}`);
      }
    }

    const totalQuestions = publishedVersion.questions.length;

    return {
      assessmentId: assessment.id,
      sessionToken: assessment.sessionToken,
      calculator: {
        slug: calculator.slug,
        name: calculator.name,
      },
      versionNumber: publishedVersion.versionNumber,
      status: assessment.status,
      startedAt: assessment.startedAt,
      expiresAt: assessment.expiresAt,
      progress: {
        totalQuestions,
        visibleQuestions: totalQuestions,
        answeredQuestions: 0,
        percentage: 0,
        isComplete: false,
      },
    };
  }

  /**
   * Retrieves full assessment session state, dynamic questions, and saved answers.
   */
  async getAssessment(sessionToken: string): Promise<AssessmentStateResponseDto> {
    const assessment = await this.findAssessmentByToken(sessionToken);

    const questions = assessment.calculatorVersion.questions;
    const answers = assessment.answers;

    // Convert answers to snapshots for condition evaluator
    const answerSnapshots: AnswerSnapshot[] = answers.map((a) => ({
      questionId: a.questionId,
      questionCode: a.question.code,
      selectedOptionValue: a.selectedOption?.value || null,
      selectedOptionId: a.selectedOptionId,
      textValue: a.textValue,
      numericValue: a.numericValue,
      rawInput: a.rawInput,
    }));

    // Evaluate visibility per question
    const answeredQuestionIds = new Set(answers.map((a) => a.questionId));
    let visibleCount = 0;
    let answeredVisibleCount = 0;

    const assessmentQuestions: AssessmentQuestionDto[] = questions.map((q) => {
      const isVisible = ConditionEvaluator.isQuestionVisible(
        q.displayConditions as any,
        answerSnapshots,
      );

      if (isVisible) {
        visibleCount++;
        if (answeredQuestionIds.has(q.id)) {
          answeredVisibleCount++;
        }
      }

      return {
        id: q.id,
        code: q.code,
        title: q.title,
        helpText: q.helpText,
        type: q.type,
        orderIndex: q.orderIndex,
        isRequired: q.isRequired,
        isVisible,
        categoryCode: q.scoreCategory?.code || null,
        displayConditions: q.displayConditions,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          orderIndex: o.orderIndex,
          metadata: o.metadata,
        })),
      };
    });

    const progress: AssessmentProgressDto = {
      totalQuestions: questions.length,
      visibleQuestions: visibleCount,
      answeredQuestions: answeredVisibleCount,
      percentage: visibleCount > 0 ? Math.round((answeredVisibleCount / visibleCount) * 1000) / 10 : 0,
      isComplete: visibleCount > 0 && answeredVisibleCount === visibleCount,
    };

    const savedAnswers: SavedAnswerDto[] = answers.map((a) => ({
      questionId: a.questionId,
      questionCode: a.question.code,
      selectedOptionId: a.selectedOptionId,
      selectedOptionValue: a.selectedOption?.value || null,
      numericValue: a.numericValue,
      textValue: a.textValue,
      rawInput: a.rawInput,
      updatedAt: a.updatedAt,
    }));

    return {
      assessmentId: assessment.id,
      sessionToken: assessment.sessionToken,
      status: assessment.status,
      calculator: {
        id: assessment.calculatorVersion.calculator.id,
        slug: assessment.calculatorVersion.calculator.slug,
        name: assessment.calculatorVersion.calculator.name,
        versionNumber: assessment.calculatorVersion.versionNumber,
      },
      progress,
      questions: assessmentQuestions,
      answers: savedAnswers,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      expiresAt: assessment.expiresAt,
    };
  }

  /**
   * Idempotently persists answers to PostgreSQL for an assessment session.
   */
  async saveAnswers(sessionToken: string, dto: SaveAnswersDto): Promise<SaveAnswersResponseDto> {
    const assessment = await this.findAssessmentByToken(sessionToken);

    if (assessment.status === AssessmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify answers for an assessment that is already completed.');
    }
    if (assessment.status === AssessmentStatus.ABANDONED) {
      throw new BadRequestException('Cannot modify answers for an abandoned assessment.');
    }

    // Build question lookup map for the assessment's specific calculatorVersion
    const versionQuestions = assessment.calculatorVersion.questions;
    const questionMap = new Map<string, (typeof versionQuestions)[0]>();
    for (const q of versionQuestions) {
      questionMap.set(q.id, q);
    }

    // Validate ownership and type constraints
    for (const ans of dto.answers) {
      const question = questionMap.get(ans.questionId);
      if (!question) {
        throw new BadRequestException(
          `Question "${ans.questionId}" does not belong to calculator version #${assessment.calculatorVersion.versionNumber}.`,
        );
      }

      // If selectedOptionId is provided, verify it belongs to this specific question
      if (ans.selectedOptionId) {
        const optionExists = question.options.some((o) => o.id === ans.selectedOptionId);
        if (!optionExists) {
          throw new BadRequestException(
            `Option "${ans.selectedOptionId}" is not a valid option for question "${question.code}".`,
          );
        }
      }

      // Validate expected inputs based on QuestionType
      if (question.type === QuestionType.SINGLE_CHOICE || question.type === QuestionType.BOOLEAN) {
        if (!ans.selectedOptionId && !ans.textValue) {
          throw new BadRequestException(
            `Question "${question.code}" (${question.type}) requires a selectedOptionId.`,
          );
        }
      } else if (question.type === QuestionType.NUMERIC_INPUT || question.type === QuestionType.SLIDER) {
        if (ans.numericValue === undefined || ans.numericValue === null) {
          throw new BadRequestException(
            `Question "${question.code}" (${question.type}) requires a numericValue.`,
          );
        }
      }
    }

    // Upsert answers idempotently in a transaction
    await this.prisma.$transaction(
      dto.answers.map((ans) =>
        this.prisma.assessmentAnswer.upsert({
          where: {
            assessmentId_questionId: {
              assessmentId: assessment.id,
              questionId: ans.questionId,
            },
          },
          update: {
            selectedOptionId: ans.selectedOptionId || null,
            textValue: ans.textValue || null,
            numericValue: ans.numericValue !== undefined ? ans.numericValue : null,
            rawInput: ans.rawInput !== undefined ? ans.rawInput : undefined,
          },
          create: {
            assessmentId: assessment.id,
            questionId: ans.questionId,
            selectedOptionId: ans.selectedOptionId || null,
            textValue: ans.textValue || null,
            numericValue: ans.numericValue !== undefined ? ans.numericValue : null,
            rawInput: ans.rawInput !== undefined ? ans.rawInput : undefined,
          },
        }),
      ),
    );

    // Refresh answers and recompute progress
    const updatedAnswers = await this.prisma.assessmentAnswer.findMany({
      where: { assessmentId: assessment.id },
      include: {
        question: true,
        selectedOption: true,
      },
    });

    const snapshots: AnswerSnapshot[] = updatedAnswers.map((a) => ({
      questionId: a.questionId,
      questionCode: a.question.code,
      selectedOptionValue: a.selectedOption?.value || null,
      selectedOptionId: a.selectedOptionId,
      textValue: a.textValue,
      numericValue: a.numericValue,
      rawInput: a.rawInput,
    }));

    const answeredIds = new Set(updatedAnswers.map((a) => a.questionId));
    let visibleCount = 0;
    let answeredVisibleCount = 0;

    for (const q of versionQuestions) {
      const isVisible = ConditionEvaluator.isQuestionVisible(
        q.displayConditions as any,
        snapshots,
      );
      if (isVisible) {
        visibleCount++;
        if (answeredIds.has(q.id)) {
          answeredVisibleCount++;
        }
      }
    }

    const progress: AssessmentProgressDto = {
      totalQuestions: versionQuestions.length,
      visibleQuestions: visibleCount,
      answeredQuestions: answeredVisibleCount,
      percentage: visibleCount > 0 ? Math.round((answeredVisibleCount / visibleCount) * 1000) / 10 : 0,
      isComplete: visibleCount > 0 && answeredVisibleCount === visibleCount,
    };

    return {
      success: true,
      savedCount: dto.answers.length,
      progress,
      answers: updatedAnswers.map((a) => ({
        questionId: a.questionId,
        questionCode: a.question.code,
        selectedOptionId: a.selectedOptionId,
        selectedOptionValue: a.selectedOption?.value || null,
        numericValue: a.numericValue,
        textValue: a.textValue,
        rawInput: a.rawInput,
        updatedAt: a.updatedAt,
      })),
    };
  }

  /**
   * Completes an assessment session after validating that all required visible questions are answered.
   */
  async completeAssessment(sessionToken: string): Promise<CompleteAssessmentResponseDto> {
    const assessment = await this.findAssessmentByToken(sessionToken);

    // Idempotent completion check
    if (assessment.status === AssessmentStatus.COMPLETED) {
      return {
        success: true,
        assessmentId: assessment.id,
        status: AssessmentStatus.COMPLETED,
        completedAt: assessment.completedAt || new Date(),
        message: 'Assessment is already marked as completed.',
      };
    }

    const questions = assessment.calculatorVersion.questions;
    const answers = assessment.answers;

    const answerSnapshots: AnswerSnapshot[] = answers.map((a) => ({
      questionId: a.questionId,
      questionCode: a.question.code,
      selectedOptionValue: a.selectedOption?.value || null,
      selectedOptionId: a.selectedOptionId,
      textValue: a.textValue,
      numericValue: a.numericValue,
      rawInput: a.rawInput,
    }));

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));

    // Validate that all visible required questions have non-empty answers
    for (const q of questions) {
      const isVisible = ConditionEvaluator.isQuestionVisible(
        q.displayConditions as any,
        answerSnapshots,
      );

      if (isVisible && q.isRequired) {
        const ans = answerMap.get(q.id);
        if (!ans) {
          throw new BadRequestException(
            `Required question "${q.title}" (${q.code}) has not been answered.`,
          );
        }

        const hasValue =
          ans.selectedOptionId !== null ||
          (ans.textValue !== null && ans.textValue !== '') ||
          ans.numericValue !== null ||
          ans.rawInput !== null;

        if (!hasValue) {
          throw new BadRequestException(
            `Required question "${q.title}" (${q.code}) contains an empty response.`,
          );
        }
      }
    }

    const completedAt = new Date();
    await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        status: AssessmentStatus.COMPLETED,
        completedAt,
      },
    });

    return {
      success: true,
      assessmentId: assessment.id,
      status: AssessmentStatus.COMPLETED,
      completedAt,
      message: 'Assessment completed successfully. Ready for scoring and lead capture.',
    };
  }

  /**
   * Deterministically executes scoring and recommendation evaluation in an atomic transaction.
   * If an immutable result already exists, returns it idempotently without recomputing.
   */
  async generateAssessmentResult(sessionToken: string): Promise<AssessmentFullResultResponseDto> {
    const assessment = await this.findAssessmentForScoring(sessionToken);

    // 1. Idempotency Check: if result already exists and is immutable, return it
    if (assessment.result && assessment.result.isImmutable) {
      return this.formatFullResultResponse(assessment, assessment.result, assessment.recommendations);
    }

    // 2. Map answers to snapshots
    const answerSnapshots: AnswerSnapshot[] = assessment.answers.map((a) => ({
      questionId: a.questionId,
      questionCode: a.question.code,
      selectedOptionValue: a.selectedOption?.value || null,
      selectedOptionId: a.selectedOptionId,
      textValue: a.textValue,
      numericValue: a.numericValue,
      rawInput: a.rawInput,
    }));

    // 3. Execute deterministic scoring
    const scoringResult = this.scoringService.calculateScores({
      calculatorSlug: assessment.calculatorVersion.calculator.slug,
      categories: assessment.calculatorVersion.scoreCategories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        weight: c.weight,
      })),
      questions: assessment.calculatorVersion.questions.map((q) => ({
        id: q.id,
        code: q.code,
        title: q.title,
        type: q.type,
        weight: q.weight,
        isRequired: q.isRequired,
        scoreCategoryId: q.scoreCategoryId,
        displayConditions: q.displayConditions,
        options: q.options.map((o) => ({
          id: o.id,
          value: o.value,
          scoreValue: o.scoreValue,
        })),
      })),
      scoringRules: assessment.calculatorVersion.scoringRules.map((r) => ({
        id: r.id,
        name: r.name,
        scoreCategoryId: r.scoreCategoryId,
        conditionExpression: r.conditionExpression,
        multiplier: r.multiplier,
      })),
      answers: answerSnapshots,
    });

    // 4. Execute recommendation rules evaluation
    const generatedRecommendations = this.recommendationService.evaluateRecommendations(
      assessment.calculatorVersion.recommendationRules.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        scoreCategoryId: r.scoreCategoryId,
        scoreCategory: r.scoreCategory ? { id: r.scoreCategory.id, code: r.scoreCategory.code, name: r.scoreCategory.name } : null,
        minScore: r.minScore,
        maxScore: r.maxScore,
        conditionJson: r.conditionJson,
        template: {
          id: r.template.id,
          code: r.template.code,
          title: r.template.title,
          summary: r.template.summary,
          actionPlan: r.template.actionPlan,
          priority: r.template.priority,
          serviceLink: r.template.serviceLink,
        },
      })),
      scoringResult,
      answerSnapshots,
    );

    // 5. Execute atomic transaction in PostgreSQL
    const { savedResult, savedRecommendations } = await this.prisma.$transaction(async (tx) => {
      // Upsert immutable result
      const resultRecord = await tx.assessmentResult.upsert({
        where: { assessmentId: assessment.id },
        update: {
          overallScore: scoringResult.overallScore,
          normalizedIndex: scoringResult.normalizedIndex,
          maturityLevel: scoringResult.maturityLevel,
          categoryScores: scoringResult.categoryScores as any,
          calculatedMetrics: {
            riskLevel: scoringResult.riskLevel,
            benchmarkComparison: scoringResult.benchmarkComparison,
          },
          isImmutable: true,
          calculatedAt: scoringResult.calculatedAt,
        },
        create: {
          assessmentId: assessment.id,
          overallScore: scoringResult.overallScore,
          normalizedIndex: scoringResult.normalizedIndex,
          maturityLevel: scoringResult.maturityLevel,
          categoryScores: scoringResult.categoryScores as any,
          calculatedMetrics: {
            riskLevel: scoringResult.riskLevel,
            benchmarkComparison: scoringResult.benchmarkComparison,
          },
          isImmutable: true,
          calculatedAt: scoringResult.calculatedAt,
        },
      });

      // Freeze recommendations
      await tx.assessmentRecommendation.deleteMany({ where: { assessmentId: assessment.id } });
      const createdRecs = [];
      for (const rec of generatedRecommendations) {
        const created = await tx.assessmentRecommendation.create({
          data: {
            assessmentId: assessment.id,
            templateId: rec.templateId,
            ruleId: rec.ruleId || null,
            title: rec.title,
            summary: rec.summary,
            actionPlan: rec.actionPlan,
            priority: rec.priority,
            status: rec.status,
          },
        });
        createdRecs.push(created);
      }

      // Mark assessment as completed if not yet marked
      if (assessment.status !== AssessmentStatus.COMPLETED) {
        await tx.assessment.update({
          where: { id: assessment.id },
          data: {
            status: AssessmentStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }

      return { savedResult: resultRecord, savedRecommendations: createdRecs };
    });

    return this.formatFullResultResponse(assessment, savedResult, savedRecommendations);
  }

  /**
   * Retrieves the immutable score result for an assessment.
   */
  async getAssessmentResult(sessionToken: string): Promise<AssessmentResultResponseDto> {
    const assessment = await this.findAssessmentByToken(sessionToken);

    const result = await this.prisma.assessmentResult.findUnique({
      where: { assessmentId: assessment.id },
    });

    if (!result) {
      throw new NotFoundException(
        'Assessment has not yet been scored. Call POST /api/v1/assessments/:sessionToken/score first.',
      );
    }

    const calculatedMetrics = (result.calculatedMetrics as any) || {};

    return {
      assessmentId: assessment.id,
      sessionToken: assessment.sessionToken,
      overallScore: result.overallScore,
      normalizedIndex: result.normalizedIndex,
      maturityLevel: result.maturityLevel,
      riskLevel: calculatedMetrics.riskLevel || 'MODERATE',
      categoryScores: result.categoryScores as any,
      benchmark: calculatedMetrics.benchmarkComparison || { status: 'unconfigured' },
      isImmutable: result.isImmutable,
      calculatedAt: result.calculatedAt,
    };
  }

  /**
   * Retrieves the generated recommendations for an assessment.
   */
  async getAssessmentRecommendations(sessionToken: string): Promise<AssessmentRecommendationItemDto[]> {
    const assessment = await this.findAssessmentByToken(sessionToken);

    const recs = await this.prisma.assessmentRecommendation.findMany({
      where: { assessmentId: assessment.id },
      include: { template: true },
      orderBy: { createdAt: 'asc' },
    });

    return recs.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      title: r.title,
      summary: r.summary,
      actionPlan: r.actionPlan,
      priority: r.priority,
      status: r.status,
      serviceLink: r.template?.serviceLink || null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Helper to format full response bundle with result and recommendations.
   */
  private formatFullResultResponse(
    assessment: { id: string; sessionToken: string },
    result: any,
    recommendations: any[],
  ): AssessmentFullResultResponseDto {
    const calculatedMetrics = (result.calculatedMetrics as any) || {};

    return {
      result: {
        assessmentId: assessment.id,
        sessionToken: assessment.sessionToken,
        overallScore: result.overallScore,
        normalizedIndex: result.normalizedIndex,
        maturityLevel: result.maturityLevel,
        riskLevel: calculatedMetrics.riskLevel || 'MODERATE',
        categoryScores: result.categoryScores as any,
        benchmark: calculatedMetrics.benchmarkComparison || { status: 'unconfigured' },
        isImmutable: result.isImmutable,
        calculatedAt: result.calculatedAt,
      },
      recommendations: recommendations.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        title: r.title,
        summary: r.summary,
        actionPlan: r.actionPlan,
        priority: r.priority,
        status: r.status,
        serviceLink: r.template?.serviceLink || null,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Loads full assessment with scoring entities: categories, scoring rules, recommendation rules, templates.
   */
  private async findAssessmentForScoring(sessionToken: string) {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new BadRequestException('Session token is required.');
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { sessionToken },
      include: {
        calculatorVersion: {
          include: {
            calculator: true,
            scoreCategories: true,
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                options: { orderBy: { orderIndex: 'asc' } },
                scoreCategory: true,
              },
            },
            scoringRules: true,
            recommendationRules: {
              include: {
                template: true,
                scoreCategory: true,
              },
            },
          },
        },
        answers: {
          include: {
            question: true,
            selectedOption: true,
          },
        },
        result: true,
        recommendations: {
          include: { template: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException('Assessment session was not found.');
    }

    if (assessment.expiresAt && assessment.expiresAt < new Date()) {
      throw new UnauthorizedException('Assessment session has expired.');
    }

    return assessment;
  }

  /**
   * Helper to retrieve assessment with version, questions, options, and answers, verifying expiration.
   */
  private async findAssessmentByToken(sessionToken: string) {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new BadRequestException('Session token is required.');
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { sessionToken },
      include: {
        calculatorVersion: {
          include: {
            calculator: true,
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                options: { orderBy: { orderIndex: 'asc' } },
                scoreCategory: true,
              },
            },
          },
        },
        answers: {
          include: {
            question: true,
            selectedOption: true,
          },
        },
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException('Assessment session was not found.');
    }

    if (assessment.expiresAt && assessment.expiresAt < new Date()) {
      throw new UnauthorizedException('Assessment session has expired.');
    }

    return assessment;
  }
}
