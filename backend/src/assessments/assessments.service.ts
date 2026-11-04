import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentStatus, Prisma, QuestionType } from '@prisma/client';
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
  BenchmarkComparisonDto,
  CategoryScoreDetailDto,
  AssessmentResultResponseDto,
  AssessmentRecommendationItemDto,
  AssessmentFullResultResponseDto,
} from './dto/assessment-result-response.dto';

type AssessmentResultRecord = Prisma.AssessmentResultGetPayload<object>;
type AssessmentRecommendationRecord = Prisma.AssessmentRecommendationGetPayload<{
  include: { template: true };
}>;

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  const ancestors = new WeakSet<object>();

  const convert = (
    current: unknown,
    path: string,
  ): Prisma.InputJsonValue | null | undefined => {
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return current;
    }

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new TypeError(`Non-finite number at ${path} cannot be stored as JSON.`);
      }
      return current;
    }

    if (current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      throw new TypeError(`Unsupported JSON value at ${path}.`);
    }

    if (ancestors.has(current)) {
      throw new TypeError(`Circular value at ${path} cannot be stored as JSON.`);
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return Array.from(current, (item, index) => {
          const converted = convert(item, `${path}[${index}]`);
          return converted === undefined ? null : converted;
        });
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Unsupported object at ${path}; expected a plain JSON object.`);
      }

      if (Reflect.ownKeys(current).some((key) => typeof key === 'symbol')) {
        throw new TypeError(`Symbol keys at ${path} cannot be stored as JSON.`);
      }

      const converted: {
        [key: string]: Prisma.InputJsonValue | null | undefined;
      } = {};
      for (const [key, nestedValue] of Object.entries(current)) {
        const convertedValue = convert(nestedValue, `${path}.${key}`);
        if (convertedValue !== undefined) {
          converted[key] = convertedValue;
        }
      }
      return converted;
    } finally {
      ancestors.delete(current);
    }
  };

  const converted = convert(value, 'calculatedMetrics');
  if (converted === null || converted === undefined) {
    throw new TypeError('calculatedMetrics must be a non-null JSON value.');
  }
  return converted;
}

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

    // Lock the assessment row before writes so completion and answer saves serialize.
    await this.prisma.$transaction(async (tx) => {
      const writableAssessment = await tx.assessment.updateMany({
        where: {
          id: assessment.id,
          status: AssessmentStatus.IN_PROGRESS,
        },
        data: { updatedAt: new Date() },
      });
      if (writableAssessment.count !== 1) {
        throw new BadRequestException(
          'Cannot modify answers for an assessment that is no longer in progress.',
        );
      }

      for (const ans of dto.answers) {
        await tx.assessmentAnswer.upsert({
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
        });
      }
    });

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
    const assessment = await this.findAssessmentForScoring(sessionToken);
    if (assessment.status === AssessmentStatus.COMPLETED && assessment.result) {
      return {
        success: true,
        assessmentId: assessment.id,
        status: AssessmentStatus.COMPLETED,
        completedAt: assessment.completedAt || new Date(),
        message: 'Assessment is already marked as completed.',
      };
    }
    if (
      assessment.status !== AssessmentStatus.IN_PROGRESS &&
      assessment.status !== AssessmentStatus.COMPLETED
    ) {
      throw new BadRequestException('Only in-progress assessments can be completed.');
    }

    const completedAt = assessment.completedAt || new Date();
    await this.persistAssessmentResult(assessment, completedAt);

    return {
      success: true,
      assessmentId: assessment.id,
      status: AssessmentStatus.COMPLETED,
      completedAt,
      message: 'Assessment completed and results generated successfully.',
    };
  }

  /**
   * Deterministically executes scoring and recommendation evaluation in an atomic transaction.
   * Results can only be generated for completed assessments.
   */
  async generateAssessmentResult(sessionToken: string): Promise<AssessmentFullResultResponseDto> {
    const assessment = await this.findAssessmentForScoring(sessionToken);

    if (assessment.status !== AssessmentStatus.COMPLETED) {
      throw new BadRequestException('Assessment must be completed before results can be generated.');
    }
    return this.persistAssessmentResult(
      assessment,
      assessment.completedAt || new Date(),
    );
  }

  private async persistAssessmentResult(
    assessment: Awaited<ReturnType<AssessmentsService['findAssessmentForScoring']>>,
    completedAt: Date,
  ): Promise<AssessmentFullResultResponseDto> {
    if (assessment.result) {
      if (assessment.status !== AssessmentStatus.COMPLETED) {
        throw new ConflictException('An incomplete assessment cannot have a result.');
      }
      return this.formatFullResultResponse(
        assessment,
        assessment.result,
        assessment.recommendations,
      );
    }

    const { savedResult, savedRecommendations } = await this.prisma.$transaction(async (tx) => {
      const completionClaim = await tx.assessment.updateMany({
        where: {
          id: assessment.id,
          status: assessment.status,
          result: { is: null },
        },
        data: {
          status: AssessmentStatus.COMPLETED,
          completedAt,
        },
      });

      if (completionClaim.count === 0) {
        const existingResult = await tx.assessmentResult.findUnique({
          where: { assessmentId: assessment.id },
        });
        if (!existingResult) {
          throw new ConflictException(
            'Assessment state changed while results were being generated. Retry the request.',
          );
        }
        const existingRecommendations = await tx.assessmentRecommendation.findMany({
          where: { assessmentId: assessment.id },
          include: { template: true },
          orderBy: { createdAt: 'asc' },
        });
        return {
          savedResult: existingResult,
          savedRecommendations: existingRecommendations,
        };
      }

      const persistedAnswers = await tx.assessmentAnswer.findMany({
        where: { assessmentId: assessment.id },
        include: {
          question: true,
          selectedOption: true,
        },
      });
      const answerSnapshots: AnswerSnapshot[] = persistedAnswers.map((answer) => ({
        questionId: answer.questionId,
        questionCode: answer.question.code,
        selectedOptionValue: answer.selectedOption?.value || null,
        selectedOptionId: answer.selectedOptionId,
        textValue: answer.textValue,
        numericValue: answer.numericValue,
        rawInput: answer.rawInput,
      }));
      const answerMap = new Map(persistedAnswers.map((answer) => [answer.questionId, answer]));

      for (const question of assessment.calculatorVersion.questions) {
        const isVisible = ConditionEvaluator.isQuestionVisible(
          question.displayConditions as any,
          answerSnapshots,
        );
        if (!isVisible || !question.isRequired) {
          continue;
        }

        const answer = answerMap.get(question.id);
        if (!answer) {
          throw new BadRequestException(
            `Required question "${question.title}" (${question.code}) has not been answered.`,
          );
        }

        const hasValue =
          answer.selectedOptionId !== null ||
          (answer.textValue !== null && answer.textValue !== '') ||
          answer.numericValue !== null ||
          answer.rawInput !== null;
        if (!hasValue) {
          throw new BadRequestException(
            `Required question "${question.title}" (${question.code}) contains an empty response.`,
          );
        }
      }

      const scoringResult = this.scoringService.calculateScores({
        calculatorSlug: assessment.calculatorVersion.calculator.slug,
        categories: assessment.calculatorVersion.scoreCategories.map((category) => ({
          id: category.id,
          code: category.code,
          name: category.name,
          weight: category.weight,
        })),
        questions: assessment.calculatorVersion.questions.map((question) => ({
          id: question.id,
          code: question.code,
          title: question.title,
          type: question.type,
          weight: question.weight,
          isRequired: question.isRequired,
          scoreCategoryId: question.scoreCategoryId,
          displayConditions: question.displayConditions,
          options: question.options.map((option) => ({
            id: option.id,
            value: option.value,
            scoreValue: option.scoreValue,
          })),
        })),
        scoringRules: assessment.calculatorVersion.scoringRules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          scoreCategoryId: rule.scoreCategoryId,
          conditionExpression: rule.conditionExpression,
          multiplier: rule.multiplier,
        })),
        answers: answerSnapshots,
      });
      const categoryScores = toPrismaJsonValue(scoringResult.categoryScores);
      const calculatedMetrics = toPrismaJsonValue({
        riskLevel: scoringResult.riskLevel,
        benchmarkComparison: scoringResult.benchmarkComparison,
      });

      const resultRecord = await tx.assessmentResult.create({
        data: {
          assessmentId: assessment.id,
          overallScore: scoringResult.overallScore,
          normalizedIndex: scoringResult.normalizedIndex,
          maturityLevel: scoringResult.maturityLevel,
          categoryScores,
          calculatedMetrics,
          isImmutable: true,
          calculatedAt: scoringResult.calculatedAt,
        },
      });

      const generatedRecommendations = this.recommendationService.evaluateRecommendations(
        assessment.calculatorVersion.recommendationRules.map((r) => ({
          id: r.id,
          templateId: r.templateId,
          scoreCategoryId: r.scoreCategoryId,
          scoreCategory: r.scoreCategory
            ? {
                id: r.scoreCategory.id,
                code: r.scoreCategory.code,
                name: r.scoreCategory.name,
              }
            : null,
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

      if (generatedRecommendations.length > 0) {
        await tx.assessmentRecommendation.createMany({
          data: generatedRecommendations.map((rec) => ({
            assessmentId: assessment.id,
            templateId: rec.templateId,
            ruleId: rec.ruleId || null,
            title: rec.title,
            summary: rec.summary,
            actionPlan: rec.actionPlan,
            priority: rec.priority,
            status: rec.status,
          })),
        });
      }

      const createdRecommendations = await tx.assessmentRecommendation.findMany({
        where: { assessmentId: assessment.id },
        include: { template: true },
        orderBy: { createdAt: 'asc' },
      });

      return {
        savedResult: resultRecord,
        savedRecommendations: createdRecommendations,
      };
    });

    return this.formatFullResultResponse(assessment, savedResult, savedRecommendations);
  }

  /**
   * Retrieves the immutable score result for an assessment.
   */
  async getAssessmentResult(sessionToken: string): Promise<AssessmentResultResponseDto> {
    const assessment = await this.findAssessmentByToken(sessionToken);
    if (assessment.status !== AssessmentStatus.COMPLETED) {
      throw new BadRequestException('Assessment results are available after completion.');
    }

    const result = await this.prisma.assessmentResult.findUnique({
      where: { assessmentId: assessment.id },
    });

    if (!result) {
      throw new NotFoundException(
        'Assessment result was not found.',
      );
    }

    return this.formatAssessmentResult(assessment, result);
  }

  /**
   * Retrieves the generated recommendations for an assessment.
   */
  async getAssessmentRecommendations(sessionToken: string): Promise<AssessmentRecommendationItemDto[]> {
    const assessment = await this.findAssessmentByToken(sessionToken);
    if (assessment.status !== AssessmentStatus.COMPLETED) {
      throw new BadRequestException('Recommendations are available after completion.');
    }

    const result = await this.prisma.assessmentResult.findUnique({
      where: { assessmentId: assessment.id },
      select: { id: true },
    });
    if (!result) {
      throw new NotFoundException('Assessment result was not found.');
    }

    const recs = await this.prisma.assessmentRecommendation.findMany({
      where: { assessmentId: assessment.id },
      include: { template: true },
      orderBy: { createdAt: 'asc' },
    });

    return recs.map((recommendation) =>
      this.formatAssessmentRecommendation(recommendation),
    );
  }

  /**
   * Helper to format full response bundle with result and recommendations.
   */
  private formatFullResultResponse(
    assessment: { id: string; sessionToken: string },
    result: AssessmentResultRecord,
    recommendations: AssessmentRecommendationRecord[],
  ): AssessmentFullResultResponseDto {
    return {
      result: this.formatAssessmentResult(assessment, result),
      recommendations: recommendations.map((recommendation) =>
        this.formatAssessmentRecommendation(recommendation),
      ),
    };
  }

  private formatAssessmentResult(
    assessment: { id: string; sessionToken: string },
    result: AssessmentResultRecord,
  ): AssessmentResultResponseDto {
    const metrics = this.readCalculatedMetrics(result.calculatedMetrics);
    return {
      assessmentId: assessment.id,
      sessionToken: assessment.sessionToken,
      overallScore: result.overallScore,
      normalizedIndex: result.normalizedIndex,
      maturityLevel: result.maturityLevel,
      riskLevel: metrics.riskLevel,
      categoryScores: this.formatCategoryScores(result.categoryScores),
      benchmark: metrics.benchmark,
      isImmutable: result.isImmutable,
      calculatedAt: result.calculatedAt,
    };
  }

  private formatAssessmentRecommendation(
    recommendation: AssessmentRecommendationRecord,
  ): AssessmentRecommendationItemDto {
    return {
      id: recommendation.id,
      templateId: recommendation.templateId,
      title: recommendation.title,
      summary: recommendation.summary,
      actionPlan: recommendation.actionPlan,
      priority: recommendation.priority,
      status: recommendation.status,
      serviceLink: recommendation.template.serviceLink,
      createdAt: recommendation.createdAt,
    };
  }

  private readCalculatedMetrics(value: Prisma.JsonValue | null): {
    riskLevel: AssessmentResultResponseDto['riskLevel'];
    benchmark: BenchmarkComparisonDto;
  } {
    if (value === null) {
      return {
        riskLevel: 'MODERATE',
        benchmark: { status: 'unconfigured' },
      };
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new InternalServerErrorException('Assessment metrics are malformed.');
    }

    const riskLevel = value.riskLevel;
    if (
      riskLevel !== 'LOW' &&
      riskLevel !== 'MODERATE' &&
      riskLevel !== 'HIGH' &&
      riskLevel !== 'CRITICAL'
    ) {
      throw new InternalServerErrorException('Assessment risk level is malformed.');
    }

    const benchmarkValue = value.benchmarkComparison;
    if (
      benchmarkValue === null ||
      typeof benchmarkValue !== 'object' ||
      Array.isArray(benchmarkValue) ||
      (benchmarkValue.status !== 'configured' &&
        benchmarkValue.status !== 'unconfigured')
    ) {
      throw new InternalServerErrorException('Assessment benchmark is malformed.');
    }

    return {
      riskLevel,
      benchmark: {
        status: benchmarkValue.status,
        ...(typeof benchmarkValue.source === 'string' && {
          source: benchmarkValue.source,
        }),
        ...(typeof benchmarkValue.segment === 'string' && {
          segment: benchmarkValue.segment,
        }),
        ...(typeof benchmarkValue.geography === 'string' && {
          geography: benchmarkValue.geography,
        }),
        ...(typeof benchmarkValue.effectiveDate === 'string' && {
          effectiveDate: benchmarkValue.effectiveDate,
        }),
        ...(typeof benchmarkValue.industryAverageIndex === 'number' && {
          industryAverageIndex: benchmarkValue.industryAverageIndex,
        }),
        ...(typeof benchmarkValue.variance === 'number' && {
          variance: benchmarkValue.variance,
        }),
        ...(typeof benchmarkValue.message === 'string' && {
          message: benchmarkValue.message,
        }),
      },
    };
  }

  private formatCategoryScores(
    value: Prisma.JsonValue,
  ): Record<string, CategoryScoreDetailDto> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new InternalServerErrorException('Assessment category scores are malformed.');
    }

    const categories: Record<string, CategoryScoreDetailDto> = {};
    for (const [code, category] of Object.entries(value)) {
      if (category === null || typeof category !== 'object' || Array.isArray(category)) {
        throw new InternalServerErrorException(`Assessment category "${code}" is malformed.`);
      }

      const name = category.categoryName;
      const riskLevel = category.riskLevel;
      const answeredCount = category.answeredQuestionsCount;
      const visibleCount = category.visibleQuestionsCount;
      if (
        typeof name !== 'string' ||
        typeof category.weight !== 'number' ||
        typeof category.rawScore !== 'number' ||
        typeof category.maxPossibleScore !== 'number' ||
        typeof category.percentage !== 'number' ||
        (riskLevel !== 'LOW' &&
          riskLevel !== 'MODERATE' &&
          riskLevel !== 'HIGH' &&
          riskLevel !== 'CRITICAL') ||
        typeof answeredCount !== 'number' ||
        typeof visibleCount !== 'number'
      ) {
        throw new InternalServerErrorException(`Assessment category "${code}" is malformed.`);
      }

      categories[code] = {
        code,
        name,
        weight: category.weight,
        rawScore: category.rawScore,
        maxPossibleScore: category.maxPossibleScore,
        percentage: category.percentage,
        riskLevel,
        answeredCount,
        visibleCount,
      };
    }
    return categories;
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
