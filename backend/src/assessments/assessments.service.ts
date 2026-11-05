import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssessmentStatus,
  LeadActivityType,
  LeadQualificationTier,
  LeadStatus,
  Prisma,
  QuestionType,
  RecommendationPriority,
  RecommendationStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { StartAssessmentDto } from './dto/start-assessment.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import {
  CalculatorConfigResponseDto,
  PublishedCalculatorSummaryDto,
} from './dto/calculator-config.dto';
import { CaptureAssessmentLeadDto } from './dto/capture-assessment-lead.dto';
import {
  StartAssessmentResponseDto,
  AssessmentStateResponseDto,
  SaveAnswersResponseDto,
  CompleteAssessmentResponseDto,
  AssessmentProgressDto,
  AssessmentQuestionDto,
  SavedAnswerDto,
} from './dto/assessment-response.dto';
import {
  ConditionEvaluator,
  AnswerSnapshot,
  DisplayConditionRule,
} from './condition-evaluator';
import { ScoringService } from '../scoring/scoring.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import {
  CalculatorMetricsService,
  CalculatorResultType,
  DomainRecommendation,
} from './calculator-metrics.service';
import {
  BenchmarkComparisonDto,
  CategoryScoreDetailDto,
  AssessmentResultResponseDto,
  AssessmentRecommendationItemDto,
  AssessmentFullResultResponseDto,
} from './dto/assessment-result-response.dto';
import { ScoringCalculationResult } from '../scoring/interfaces/scoring.interfaces';

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

  private readonly PUBLIC_CALCULATOR_SLUGS = new Set([
    'payroll-cost-calculator',
    'payroll-compliance-calculator',
    'hr-administrative-cost-calculator',
    'hr-health-check',
  ]);

  // Standard session expiration window (30 days)
  private readonly SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly recommendationService: RecommendationService,
    private readonly calculatorMetricsService: CalculatorMetricsService = new CalculatorMetricsService(),
  ) {}

  async getPublishedCalculators(): Promise<PublishedCalculatorSummaryDto[]> {
    const calculators = await this.prisma.calculator.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        slug: { in: [...this.PUBLIC_CALCULATOR_SLUGS] },
        versions: { some: { isPublished: true } },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        versions: {
          where: { isPublished: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            versionNumber: true,
            publishedAt: true,
            _count: { select: { questions: { where: { isActive: true } } } },
            scoreCategories: {
              orderBy: { code: 'asc' },
              select: { id: true, code: true, name: true },
            },
            questions: {
              where: { isActive: true },
              orderBy: { orderIndex: 'asc' },
              select: { title: true, type: true },
            },
          },
        },
      },
    });

    return calculators.flatMap((calculator) => {
      const version = calculator.versions[0];
      if (!version) return [];
      return [{
        id: calculator.id,
        slug: calculator.slug,
        name: calculator.name,
        description: calculator.description,
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt,
        categories: version.scoreCategories,
        questionTopics: version.questions.map((question) => question.title),
        questionTypes: [...new Set(version.questions.map((question) => question.type))],
        totalQuestions: version._count.questions,
      }];
    });
  }

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
    if (!this.PUBLIC_CALCULATOR_SLUGS.has(slug)) {
      throw new NotFoundException(`Calculator "${slug}" was not found or is currently inactive.`);
    }

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
              where: { isActive: true },
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
        validationRules: q.validationRules,
        defaultValue: q.defaultValue,
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
    if (!this.PUBLIC_CALCULATOR_SLUGS.has(dto.calculatorSlug)) {
      throw new NotFoundException(`Calculator "${dto.calculatorSlug}" is invalid or inactive.`);
    }

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
      calculationKey: a.question.calculationKey,
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
        validationRules: q.validationRules,
        defaultValue: q.defaultValue,
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
      leadAssociated: Boolean(assessment.leadId),
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
        if (!ans.selectedOptionId) {
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
        if (!Number.isFinite(ans.numericValue)) {
          throw new BadRequestException(
            `Question "${question.code}" requires a finite numericValue.`,
          );
        }
        this.validateNumericAnswer(question.code, question.validationRules, ans.numericValue);
      } else {
        throw new BadRequestException(
          `Question type "${question.type}" is not supported by answer persistence.`,
        );
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
      calculationKey: a.question.calculationKey,
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

  async captureLead(
    sessionToken: string,
    dto: CaptureAssessmentLeadDto,
    clientIp: string | undefined,
  ): Promise<{ leadId: string; calculatorName: string; alreadyAssociated: boolean }> {
    const assessment = await this.findAssessmentByToken(sessionToken);
    if (assessment.status !== AssessmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Contact details can be submitted after the assessment is complete.',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const companyName = dto.companyName?.trim();
    const normalizedName = companyName?.normalize('NFKC').toLowerCase();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      let companyId: string | undefined;
      if (companyName && normalizedName) {
        const relatedCompany = await tx.company.findUnique({
          where: { normalizedName },
          select: { id: true, deletedAt: true },
        });
        if (relatedCompany?.deletedAt) {
          throw new ConflictException(
            'This company record needs administrator review before it can be linked.',
          );
        }

        const company = relatedCompany
          ? await tx.company.update({
              where: { id: relatedCompany.id },
              data: {
                name: companyName,
                ...(dto.industry ? { industry: dto.industry.trim() } : {}),
                ...(dto.headcountRange ? { headcountRange: dto.headcountRange } : {}),
                ...(dto.country ? { country: dto.country.trim() } : {}),
                ...(dto.city ? { city: dto.city.trim() } : {}),
              },
              select: { id: true },
            })
          : await tx.company.create({
              data: {
                name: companyName,
                normalizedName,
                industry: dto.industry?.trim() || null,
                headcountRange: dto.headcountRange || null,
                country: dto.country?.trim() || null,
                city: dto.city?.trim() || null,
              },
              select: { id: true },
            });
        companyId = company.id;
      }

      const matchingLeads = await tx.lead.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, deletedAt: true },
        take: 2,
      });
      if (matchingLeads.length > 1) {
        throw new ConflictException(
          'This email is associated with multiple existing records. Please contact GoSwiftHR.',
        );
      }
      if (matchingLeads[0]?.deletedAt) {
        throw new ConflictException(
          'This contact record needs administrator review before it can be linked.',
        );
      }

      const lead = matchingLeads[0]
        ? await tx.lead.update({
            where: { id: matchingLeads[0].id },
            data: {
              ...(companyId ? { companyId } : {}),
              ...(dto.firstName?.trim() ? { firstName: dto.firstName.trim() } : {}),
              ...(dto.lastName?.trim() ? { lastName: dto.lastName.trim() } : {}),
              ...(dto.jobTitle?.trim() ? { jobTitle: dto.jobTitle.trim() } : {}),
              ...(dto.phone?.trim() ? { phone: dto.phone.trim() } : {}),
              ...(dto.consentGdpr !== undefined
                ? { consentGdpr: dto.consentGdpr }
                : {}),
              ...(dto.consentMarketing !== undefined
                ? { consentMarketing: dto.consentMarketing }
                : {}),
              ...(dto.consentGdpr
                ? { consentAt: now, consentIp: clientIp || null }
                : {}),
            },
            select: { id: true },
          })
        : await tx.lead.create({
            data: {
              email,
              ...(companyId ? { companyId } : {}),
              ...(dto.firstName?.trim() ? { firstName: dto.firstName.trim() } : {}),
              ...(dto.lastName?.trim() ? { lastName: dto.lastName.trim() } : {}),
              jobTitle: dto.jobTitle?.trim() || null,
              phone: dto.phone?.trim() || null,
              status: LeadStatus.NEW,
              source: 'CALCULATOR',
              qualificationTier: LeadQualificationTier.UNGRADED,
              consentGdpr: dto.consentGdpr ?? false,
              consentMarketing: dto.consentMarketing ?? false,
              consentAt: dto.consentGdpr ? now : null,
              consentIp: dto.consentGdpr ? clientIp || null : null,
            },
            select: { id: true },
          });

      if (!matchingLeads.length) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: LeadActivityType.CREATED,
            description: 'Lead captured through a completed calculator assessment.',
            metadata: {
              assessmentId: assessment.id,
              calculatorSlug: assessment.calculatorVersion.calculator.slug,
              source: 'CALCULATOR',
            },
          },
        });
      }

      const linked = await tx.assessment.updateMany({
        where: {
          id: assessment.id,
          status: AssessmentStatus.COMPLETED,
          OR: [{ leadId: null }, { leadId: lead.id }],
        },
        data: { leadId: lead.id },
      });
      if (linked.count !== 1) {
        throw new ConflictException(
          'This completed assessment is already associated with another contact.',
        );
      }

      const alreadyAssociated = assessment.leadId === lead.id;
      if (!alreadyAssociated) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: LeadActivityType.ASSESSMENT_COMPLETED,
            description: `Completed ${assessment.calculatorVersion.calculator.name} assessment.`,
            metadata: {
              assessmentId: assessment.id,
              calculatorSlug: assessment.calculatorVersion.calculator.slug,
            },
          },
        });
      }

      return {
        leadId: lead.id,
        calculatorName: assessment.calculatorVersion.calculator.name,
        alreadyAssociated,
      };
    });
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
        calculationKey: answer.question.calculationKey,
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

      const domainResult = this.calculatorMetricsService.calculate(
        assessment.calculatorVersion.calculator.slug,
        answerSnapshots,
      );
      let overallScore: number | null;
      let normalizedIndex: number | null;
      let maturityLevel: string | null;
      let categoryScores: Prisma.InputJsonValue;
      let calculatedMetrics: Prisma.InputJsonValue;
      let scoringResult: ScoringCalculationResult | null = null;
      let domainRecommendations: DomainRecommendation[] | null = null;
      const generatedRecommendations: Array<{
        templateId: string;
        ruleId: string | null;
        title: string;
        summary: string;
        actionPlan: string;
        priority: RecommendationPriority;
        status: RecommendationStatus;
      }> = [];

      if (domainResult) {
        overallScore = null;
        normalizedIndex = null;
        maturityLevel = null;
        categoryScores = toPrismaJsonValue({});
        calculatedMetrics = toPrismaJsonValue(domainResult.metrics);
        domainRecommendations = domainResult.recommendations;
      } else {
        scoringResult = this.scoringService.calculateScores({
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
        overallScore = scoringResult.overallScore;
        normalizedIndex = scoringResult.normalizedIndex;
        maturityLevel = scoringResult.maturityLevel;
        categoryScores = toPrismaJsonValue(scoringResult.categoryScores);
        calculatedMetrics = toPrismaJsonValue({
          resultType: 'HR_HEALTH_CHECK',
          riskLevel: scoringResult.riskLevel,
          benchmarkComparison: scoringResult.benchmarkComparison,
        });
      }

      const resultRecord = await tx.assessmentResult.create({
        data: {
          assessmentId: assessment.id,
          overallScore,
          normalizedIndex,
          maturityLevel,
          categoryScores,
          calculatedMetrics,
          isImmutable: true,
          calculatedAt: scoringResult?.calculatedAt || new Date(),
        },
      });

      if (domainRecommendations) {
        const templateCodes = [
          ...new Set(domainRecommendations.map((recommendation) => recommendation.templateCode)),
        ];
        const baseTemplates = templateCodes.length
          ? await tx.recommendationTemplate.findMany({
              where: { code: { in: templateCodes } },
              select: { code: true, versionGroupId: true },
            })
          : [];
        const knownCodes = new Set(baseTemplates.map((template) => template.code));
        const missingCode = templateCodes.find((code) => !knownCodes.has(code));
        if (missingCode) {
          throw new InternalServerErrorException(
            `Recommendation template "${missingCode}" is not configured.`,
          );
        }
        const activeTemplates = baseTemplates.length
          ? await tx.recommendationTemplate.findMany({
              where: {
                versionGroupId: {
                  in: [
                    ...new Set(
                      baseTemplates.map((template) => template.versionGroupId),
                    ),
                  ],
                },
                isPublished: true,
              },
                select: {
                  id: true,
                  versionGroupId: true,
                  title: true,
                  summary: true,
                  actionPlan: true,
                  priority: true,
                  serviceLink: true,
                },
            })
          : [];
        const activeByGroup = new Map(
          activeTemplates.map((template) => [
            template.versionGroupId,
            template,
          ]),
        );
        const activeTemplateByCode = new Map(
          baseTemplates.map((template) => [
            template.code,
            activeByGroup.get(template.versionGroupId),
          ]),
        );
        generatedRecommendations.push(
          ...domainRecommendations.flatMap((recommendation) => {
            const template = activeTemplateByCode.get(
              recommendation.templateCode,
            );
            if (!template) return [];
            return {
              templateId: template.id,
              ruleId: null,
              title: template.title,
              summary: template.summary,
              actionPlan: template.actionPlan,
              priority: template.priority,
              status: RecommendationStatus.PROPOSED,
            };
          }),
        );
      } else if (scoringResult) {
        const recommendations = this.recommendationService.evaluateRecommendations(
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
        generatedRecommendations.push(
          ...recommendations.map((recommendation) => ({
            templateId: recommendation.templateId,
            ruleId: recommendation.ruleId || null,
            title: recommendation.title,
            summary: recommendation.summary,
            actionPlan: recommendation.actionPlan,
            priority: recommendation.priority,
            status: recommendation.status,
          })),
        );
      }

      if (generatedRecommendations.length > 0) {
        await tx.assessmentRecommendation.createMany({
          data: generatedRecommendations.map((rec) => ({
            assessmentId: assessment.id,
            templateId: rec.templateId,
            ruleId: rec.ruleId,
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
      await this.persistPainPointFindings(
        tx,
        assessment.id,
        assessment.calculatorVersion.calculator.slug,
        answerSnapshots,
        persistedAnswers,
      );

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
    if (!assessment.leadId) {
      throw new ForbiddenException(
        'Submit your email to access this assessment result.',
      );
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
    if (!assessment.leadId) {
      throw new ForbiddenException(
        'Submit your email to access assessment recommendations.',
      );
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
      resultType: metrics.resultType,
      overallScore: metrics.resultType === 'HR_HEALTH_CHECK' ? result.overallScore : null,
      normalizedIndex:
        metrics.resultType === 'HR_HEALTH_CHECK' ? result.normalizedIndex : null,
      maturityLevel:
        metrics.resultType === 'HR_HEALTH_CHECK' ? result.maturityLevel : null,
      riskLevel: metrics.riskLevel,
      categoryScores:
        metrics.resultType === 'HR_HEALTH_CHECK'
          ? this.formatCategoryScores(result.categoryScores)
          : {},
      benchmark: metrics.benchmark,
      calculatedMetrics: metrics.domainMetrics,
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
    resultType: CalculatorResultType;
    riskLevel: AssessmentResultResponseDto['riskLevel'];
    benchmark: BenchmarkComparisonDto;
    domainMetrics: Record<string, unknown> | null;
  } {
    if (value === null) {
      return {
        resultType: 'HR_HEALTH_CHECK',
        riskLevel: 'MODERATE',
        benchmark: { status: 'unconfigured' },
        domainMetrics: null,
      };
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new InternalServerErrorException('Assessment metrics are malformed.');
    }

    const storedResultType = value.resultType;
    if (storedResultType !== undefined) {
      if (
        storedResultType !== 'HR_HEALTH_CHECK' &&
        storedResultType !== 'PAYROLL_COST_ESTIMATE' &&
        storedResultType !== 'PAYROLL_COMPLIANCE_EVIDENCE' &&
        storedResultType !== 'HR_ADMINISTRATIVE_COST_ESTIMATE'
      ) {
        throw new InternalServerErrorException('Assessment result type is malformed.');
      }

      if (storedResultType !== 'HR_HEALTH_CHECK') {
        return {
          resultType: storedResultType,
          riskLevel: null,
          benchmark: { status: 'unconfigured' },
          domainMetrics: value,
        };
      }
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
      resultType: 'HR_HEALTH_CHECK',
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
      domainMetrics: null,
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
              where: { isActive: true },
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
              where: { isActive: true },
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

  private validateNumericAnswer(
    questionCode: string,
    rules: Prisma.JsonValue | null,
    value: number,
  ) {
    if (rules === null) return;
    if (typeof rules !== 'object' || Array.isArray(rules)) {
      throw new BadRequestException(
        `Question "${questionCode}" has invalid numeric validation rules.`,
      );
    }
    const minimum = rules.minimum;
    const maximum = rules.maximum;
    if (
      (minimum !== undefined &&
        (typeof minimum !== 'number' || !Number.isFinite(minimum))) ||
      (maximum !== undefined &&
        (typeof maximum !== 'number' || !Number.isFinite(maximum)))
    ) {
      throw new BadRequestException(
        `Question "${questionCode}" has invalid numeric validation bounds.`,
      );
    }
    if (typeof minimum === 'number' && value < minimum) {
      throw new BadRequestException(
        `Question "${questionCode}" must be at least ${minimum}.`,
      );
    }
    if (typeof maximum === 'number' && value > maximum) {
      throw new BadRequestException(
        `Question "${questionCode}" must be no greater than ${maximum}.`,
      );
    }
    const step = rules.step;
    if (step !== undefined) {
      if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0) {
        throw new BadRequestException(
          `Question "${questionCode}" has an invalid numeric step.`,
        );
      }
      const base = typeof minimum === 'number' ? minimum : 0;
      const increments = (value - base) / step;
      if (Math.abs(increments - Math.round(increments)) > 1e-9) {
        throw new BadRequestException(
          `Question "${questionCode}" must use increments of ${step}.`,
        );
      }
    }
  }

  private async persistPainPointFindings(
        tx: Prisma.TransactionClient,
        assessmentId: string,
        calculatorSlug: string,
        answerSnapshots: AnswerSnapshot[],
        persistedAnswers: Array<{
          question: { code: string; title: string };
          selectedOption: { label: string; value: string } | null;
          numericValue: number | null;
          textValue: string | null;
        }>,
      ) {
        if (!tx.companyPainPoint?.findMany) return;
        const candidates = await tx.companyPainPoint.findMany({
          where: {
            calculatorSlug,
            isActive: true,
            publishedAt: { not: null },
          },
          orderBy: [{ versionGroupId: 'asc' }, { versionNumber: 'desc' }],
        });
        const latestByGroup = new Map<string, (typeof candidates)[number]>();
        for (const candidate of candidates) {
          if (!latestByGroup.has(candidate.versionGroupId)) {
            latestByGroup.set(candidate.versionGroupId, candidate);
          }
        }

        const answersByCode = new Map(
          answerSnapshots.map((answer) => [answer.questionCode, answer]),
        );
        const labelsByCode = new Map(
          persistedAnswers.map((answer) => [
            answer.question.code,
            answer.selectedOption?.label ?? answer.textValue ?? answer.numericValue,
          ]),
        );
        const findings = [...latestByGroup.values()].flatMap((point) => {
          const rule = point.detectionRule as unknown as DisplayConditionRule;
          if (!isRuleSupportedForDetection(rule)) return [];
          const references = collectQuestionCodeReferences(rule);
          const explicitEmptyChecks = collectExplicitEmptyChecks(rule);
          if (
            [...references].some(
              (code: string) => !answersByCode.has(code) && !explicitEmptyChecks.has(code),
            )
          ) {
            return [];
          }
          if (!ConditionEvaluator.isQuestionVisible(rule, answerSnapshots)) return [];
          const triggeredAnswers = [...references]
            .map((code) => {
              const answer = answersByCode.get(code);
              if (!answer) return null;
              return {
                questionCode: code,
                answer:
                  labelsByCode.get(code) === undefined
                    ? null
                    : labelsByCode.get(code),
              };
            })
            .filter((answer): answer is NonNullable<typeof answer> => answer !== null);
          return [{
            assessmentId,
            companyPainPointId: point.id,
            code: point.code,
            title: point.title,
            description: point.description,
            businessImpact: point.businessImpact,
            calculatorSlug: point.calculatorSlug,
            category: point.category,
            priority: point.priority,
            suggestedSolution: point.suggestedSolution,
            triggeredAnswers,
          }];
        });
    if (findings.length) {
      await tx.assessmentPainPoint.createMany({ data: findings });
    }
  }
}

function isRuleSupportedForDetection(rule: DisplayConditionRule): boolean {
      if (!rule || typeof rule !== 'object') return false;
      if ('operator' in rule && (rule.operator === 'AND' || rule.operator === 'OR')) {
        const group = rule as { conditions?: unknown[]; groups?: unknown[] };
        return (
          (!group.conditions || Array.isArray(group.conditions)) &&
          (!group.groups || Array.isArray(group.groups)) &&
          [...(group.conditions ?? []), ...(group.groups ?? [])].every((item) =>
            isRuleSupportedForDetection(item as DisplayConditionRule),
          )
        );
      }
      return Boolean(
        'questionCode' in rule &&
          typeof rule.questionCode === 'string' &&
          'operator' in rule &&
          typeof rule.operator === 'string',
      );
    }

    function collectQuestionCodeReferences(rule: DisplayConditionRule): Set<string> {
      if ('operator' in rule && (rule.operator === 'AND' || rule.operator === 'OR')) {
        const group = rule as { conditions?: DisplayConditionRule[]; groups?: DisplayConditionRule[] };
        return new Set(
          [...(group.conditions ?? []), ...(group.groups ?? [])].flatMap((item) => [
            ...collectQuestionCodeReferences(item),
          ]),
        );
      }
      return 'questionCode' in rule && typeof rule.questionCode === 'string'
        ? new Set([rule.questionCode])
        : new Set();
    }

    function collectExplicitEmptyChecks(rule: DisplayConditionRule): Set<string> {
      if ('operator' in rule && (rule.operator === 'AND' || rule.operator === 'OR')) {
        const group = rule as { conditions?: DisplayConditionRule[]; groups?: DisplayConditionRule[] };
        return new Set(
          [...(group.conditions ?? []), ...(group.groups ?? [])].flatMap((item) => [
            ...collectExplicitEmptyChecks(item),
          ]),
        );
      }
      return 'operator' in rule &&
        rule.operator === 'IS_EMPTY' &&
        'questionCode' in rule &&
        typeof rule.questionCode === 'string'
        ? new Set([rule.questionCode])
        : new Set();
    }
