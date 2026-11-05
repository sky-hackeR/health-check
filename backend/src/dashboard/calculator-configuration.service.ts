import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConditionEvaluator, AnswerSnapshot } from '../assessments/condition-evaluator';
import { CalculatorMetricsService } from '../assessments/calculator-metrics.service';
import { ScoringService } from '../scoring/scoring.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import {
  SUPPORTED_CALCULATOR_INPUT_KEYS,
  SUPPORTED_QUESTION_TYPES,
} from '../assessments/calculator-inputs';
import { CalculatorQuestionDto } from './dto/calculator-question.dto';
import { CalculatorSettingsDto } from './dto/calculator-settings.dto';
import { CalculatorEvaluationPreviewDto } from './dto/calculator-evaluation-preview.dto';
import { validateCondition } from './intelligence-admin.service';

const publicCalculatorSlugs = new Set([
  'payroll-cost-calculator',
  'payroll-compliance-calculator',
  'hr-administrative-cost-calculator',
  'hr-health-check',
]);

const supportedOptionValues: Record<string, readonly string[]> = {
  PC_VARIABLE_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
  PC_EMPLOYER_STATUTORY_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
  PC_BENEFITS_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
  PC_PROCESSING_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
  NG_JURISDICTION: ['nigeria', 'other'],
  NG_MULTIPLE_JURISDICTIONS: ['no', 'yes'],
  NG_PAYROLL_RECORDS: ['verified', 'partial', 'not_verified', 'not_applicable'],
  NG_EMPLOYEE_PAY_DOCUMENTS: ['verified', 'partial', 'not_verified', 'not_applicable'],
  NG_TAX_REMITTANCE_RECORDS: ['verified', 'partial', 'not_verified', 'not_applicable'],
  NG_EMPLOYER_CONTRIBUTION_RECORDS: ['verified', 'partial', 'not_verified', 'not_applicable'],
  NG_PAYROLL_RECONCILIATION: ['verified', 'partial', 'not_verified', 'not_applicable'],
  NG_PAYROLL_RECORDS_NA_REASON: ['adviser_confirmed', 'documented_reason', 'not_sure'],
  NG_EMPLOYEE_PAY_DOCUMENTS_NA_REASON: ['adviser_confirmed', 'documented_reason', 'not_sure'],
  NG_TAX_REMITTANCE_RECORDS_NA_REASON: ['adviser_confirmed', 'documented_reason', 'not_sure'],
  NG_EMPLOYER_CONTRIBUTION_RECORDS_NA_REASON: ['adviser_confirmed', 'documented_reason', 'not_sure'],
  NG_PAYROLL_RECONCILIATION_NA_REASON: ['adviser_confirmed', 'documented_reason', 'not_sure'],
  HA_SOFTWARE_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
  HA_EXTERNAL_SERVICES_STATUS: ['verified_amount', 'verified_zero', 'unknown'],
};

const numericInputKeys = new Set([
  'PC_EMPLOYEE_COUNT',
  'PC_RUNS_PER_YEAR',
  'PC_REGULAR_GROSS_PER_RUN',
  'PC_VARIABLE_GROSS_PER_RUN',
  'PC_EMPLOYER_STATUTORY_PER_RUN',
  'PC_BENEFITS_PER_RUN',
  'PC_PROCESSING_PER_RUN',
  'HA_EMPLOYEE_COUNT',
  'HA_HOURS_PER_WEEK',
  'HA_LOADED_HOURLY_COST',
  'HA_SOFTWARE_ANNUAL',
  'HA_EXTERNAL_SERVICES_ANNUAL',
]);

@Injectable()
export class CalculatorConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService = new ScoringService(),
    private readonly recommendationService: RecommendationService = new RecommendationService(),
    private readonly calculatorMetricsService: CalculatorMetricsService = new CalculatorMetricsService(),
  ) {}

  async listVersions(slug: string) {
    const calculator = await this.findCalculator(slug);
    return this.prisma.calculatorVersion.findMany({
      where: { calculatorId: calculator.id },
      orderBy: { versionNumber: 'desc' },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { options: { orderBy: { orderIndex: 'asc' } } },
        },
        scoreCategories: { orderBy: { code: 'asc' } },
      },
    });
  }

  /**
   * Runs the same calculator engines used at assessment completion, but never
   * creates an assessment, lead, answer, result, or pain-point finding.
   */
  async previewEvaluation(slug: string, dto: CalculatorEvaluationPreviewDto) {
    if (!publicCalculatorSlugs.has(slug)) {
      throw new NotFoundException('Supported calculator was not found.');
    }
    const version = await this.prisma.calculatorVersion.findFirst({
      where: { id: dto.versionId, calculator: { slug, deletedAt: null } },
      include: {
        calculator: { select: { slug: true, name: true } },
        questions: { where: { isActive: true }, orderBy: { orderIndex: 'asc' }, include: { options: true } },
        scoreCategories: true,
        scoringRules: true,
        recommendationRules: { include: { template: true, scoreCategory: true } },
      },
    });
    if (!version) throw new NotFoundException('Calculator version was not found.');

    const answersByQuestion = new Map<string, CalculatorEvaluationPreviewDto['answers'][number]>();
    for (const answer of dto.answers) {
      if (answersByQuestion.has(answer.questionId)) {
        throw new BadRequestException('Each preview question can have only one answer.');
      }
      answersByQuestion.set(answer.questionId, answer);
    }

    const snapshots: AnswerSnapshot[] = version.questions.flatMap((question) => {
      const answer = answersByQuestion.get(question.id);
      if (!answer) return [];
      const option = answer.selectedOptionId
        ? question.options.find((item) => item.id === answer.selectedOptionId)
        : undefined;
      if (answer.selectedOptionId && !option) {
        throw new BadRequestException(`The selected option does not belong to "${question.title}".`);
      }
      if (option && (answer.numericValue !== undefined || answer.textValue !== undefined)) {
        throw new BadRequestException(`"${question.title}" cannot use both an option and a typed value.`);
      }
      return [{
        questionId: question.id,
        questionCode: question.code,
        calculationKey: question.calculationKey,
        selectedOptionId: option?.id ?? null,
        selectedOptionValue: option?.value ?? null,
        numericValue: answer.numericValue ?? null,
        textValue: answer.textValue ?? null,
        rawInput: null,
      }];
    });

    const visible = new Map(
      version.questions.map((question) => [
        question.id,
        ConditionEvaluator.isQuestionVisible(question.displayConditions as never, snapshots),
      ]),
    );
    const domainResult = this.calculatorMetricsService.calculate(slug, snapshots);
    const scoringResult = domainResult
      ? null
      : this.scoringService.calculateScores({
          calculatorSlug: slug,
          categories: version.scoreCategories,
          questions: version.questions.map((question) => ({
            id: question.id, code: question.code, title: question.title,
            type: question.type, weight: question.weight, isRequired: question.isRequired,
            scoreCategoryId: question.scoreCategoryId, displayConditions: question.displayConditions,
            options: question.options.map((option) => ({ id: option.id, value: option.value, scoreValue: option.scoreValue })),
          })),
          scoringRules: version.scoringRules,
          answers: snapshots,
        });
    const recommendations = domainResult
      ? domainResult.recommendations
      : this.recommendationService.evaluateRecommendations(
          version.recommendationRules,
          scoringResult!,
          snapshots,
        );

    return {
      simulated: true,
      notice: 'Simulation only. No assessment, lead, answer, result, or configuration was saved.',
      calculator: { slug, name: version.calculator.name, versionNumber: version.versionNumber },
      answers: version.questions.map((question) => {
        const answer = snapshots.find((item) => item.questionId === question.id);
        const option = answer?.selectedOptionId
          ? question.options.find((item) => item.id === answer.selectedOptionId)
          : undefined;
        return {
          questionId: question.id,
          questionCode: question.code,
          question: question.title,
          visible: visible.get(question.id) ?? true,
          answer: option?.label ?? answer?.numericValue ?? answer?.textValue ?? null,
          evaluation: domainResult
            ? question.calculationKey || question.code
            : question.scoreCategoryId
              ? `Contributes to the configured ${version.scoreCategories.find((category) => category.id === question.scoreCategoryId)?.name ?? 'score'} category.`
              : 'Does not contribute to a score category.',
        };
      }),
      result: domainResult
        ? { type: domainResult.metrics.resultType, metrics: domainResult.metrics }
        : {
            type: 'HR_HEALTH_CHECK',
            overallScore: scoringResult!.overallScore,
            normalizedIndex: scoringResult!.normalizedIndex,
            maturityLevel: scoringResult!.maturityLevel,
            riskLevel: scoringResult!.riskLevel,
            categoryScores: scoringResult!.categoryScores,
          },
      recommendations: recommendations.map((item) => ({
        title: item.title,
        summary: item.summary,
        actionPlan: item.actionPlan,
        priority: item.priority,
      })),
    };
  }

  async updateSettings(
    slug: string,
    actorAdminId: string,
    dto: CalculatorSettingsDto,
  ) {
    const calculator = await this.findCalculator(slug);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.calculator.update({
        where: { id: calculator.id },
        data: {
          isActive: dto.isActive,
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
        },
      });
      await this.audit(
        tx,
        actorAdminId,
        'UPDATE_CALCULATOR_SETTINGS',
        calculator.id,
        { isActive: dto.isActive, description: dto.description ?? null },
      );
      return updated;
    });
  }

  async createDraft(slug: string, sourceVersionId: string, actorAdminId: string) {
    const calculator = await this.findCalculator(slug);
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.calculatorVersion.findFirst({
        where: { id: sourceVersionId, calculatorId: calculator.id },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { options: { orderBy: { orderIndex: 'asc' } } },
          },
          scoreCategories: true,
          scoringRules: true,
          recommendationRules: true,
        },
      });
      if (!source || !source.publishedAt) {
        throw new NotFoundException('A published source version was not found.');
      }
      const openDraft = await tx.calculatorVersion.findFirst({
        where: {
          calculatorId: calculator.id,
          isPublished: false,
          publishedAt: null,
        },
        select: { id: true },
      });
      if (openDraft) {
        throw new ConflictException(
          'A draft already exists. Publish it or continue editing that draft.',
        );
      }
      const latest = await tx.calculatorVersion.findFirst({
        where: { calculatorId: calculator.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const draft = await tx.calculatorVersion.create({
        data: {
          calculatorId: calculator.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          changelog: `Draft based on version ${source.versionNumber}`,
        },
      });

      const categoryIds = new Map<string, string>();
      for (const category of source.scoreCategories) {
        const clone = await tx.scoreCategory.create({
          data: {
            calculatorVersionId: draft.id,
            code: category.code,
            name: category.name,
            weight: category.weight,
          },
          select: { id: true },
        });
        categoryIds.set(category.id, clone.id);
      }

      const questionIds = new Map<string, string>();
      const copiedQuestions = [];
      for (const question of source.questions) {
        const clone = await tx.question.create({
          data: {
            calculatorVersionId: draft.id,
            scoreCategoryId: question.scoreCategoryId
              ? (categoryIds.get(question.scoreCategoryId) ?? null)
              : null,
            code: question.code,
            title: question.title,
            helpText: question.helpText,
            type: question.type,
            orderIndex: question.orderIndex,
            weight: question.weight,
            isRequired: question.isRequired,
            isActive: question.isActive,
            calculationKey: question.calculationKey,
            validationRules: question.validationRules ?? undefined,
            defaultValue: question.defaultValue ?? undefined,
            displayConditions: question.displayConditions ?? undefined,
            options: {
              create: question.options.map((option) => ({
                label: option.label,
                value: option.value,
                orderIndex: option.orderIndex,
                scoreValue: option.scoreValue,
                metadata: option.metadata ?? undefined,
              })),
            },
          },
          select: { id: true },
        });
        questionIds.set(question.id, clone.id);
        copiedQuestions.push({ source: question, cloneId: clone.id });
      }
      for (const copied of copiedQuestions) {
        if (copied.source.displayConditions !== null) {
          await tx.question.update({
            where: { id: copied.cloneId },
            data: {
              displayConditions: asPrismaJson(
                remapQuestionReferences(
                  copied.source.displayConditions,
                  questionIds,
                ),
              ),
            },
          });
        }
      }
      for (const rule of source.scoringRules) {
        await tx.scoringRule.create({
          data: {
            calculatorVersionId: draft.id,
            scoreCategoryId: rule.scoreCategoryId
              ? (categoryIds.get(rule.scoreCategoryId) ?? null)
              : null,
            name: rule.name,
            conditionExpression: remapExpression(
              rule.conditionExpression,
              questionIds,
            ),
            multiplier: rule.multiplier,
          },
        });
      }
      for (const rule of source.recommendationRules) {
        await tx.recommendationRule.create({
          data: {
            calculatorVersionId: draft.id,
            templateId: rule.templateId,
            scoreCategoryId: rule.scoreCategoryId
              ? (categoryIds.get(rule.scoreCategoryId) ?? null)
              : null,
            minScore: rule.minScore,
            maxScore: rule.maxScore,
            conditionJson:
              rule.conditionJson === null
                ? Prisma.JsonNull
                : asPrismaJson(
                    remapQuestionReferences(rule.conditionJson, questionIds),
                  ),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_CALCULATOR_DRAFT',
          resource: 'CalculatorVersion',
          resourceId: draft.id,
          diff: { sourceVersionId, versionNumber: draft.versionNumber },
        },
      });
      return draft;
    });
  }

  async createQuestion(versionId: string, actorAdminId: string, dto: CalculatorQuestionDto) {
    return this.prisma.$transaction(async (tx) => {
      const version = await this.assertDraft(tx, versionId);
      this.validateQuestion(version.calculator.slug, dto);
      if (dto.scoreCategoryId) {
        await this.assertCategory(tx, versionId, dto.scoreCategoryId);
      }
      const currentCount = await tx.question.count({
        where: { calculatorVersionId: versionId },
      });
      const question = await tx.question.create({
        data: {
          calculatorVersionId: versionId,
          scoreCategoryId: dto.scoreCategoryId || null,
          code: dto.code,
          title: dto.title.trim(),
          helpText: dto.helpText?.trim() || null,
          type: dto.type,
          orderIndex: dto.orderIndex ?? currentCount,
          weight: dto.weight ?? 1,
          isRequired: dto.isRequired,
          isActive: dto.isActive ?? true,
          calculationKey: dto.calculationKey || null,
          validationRules: jsonField(dto.validationRules),
          defaultValue: jsonField(dto.defaultValue),
          displayConditions: jsonField(dto.displayConditions),
          options: {
            create: dto.options.map((option, index) => ({
              label: option.label.trim(),
              value: option.value,
              orderIndex: option.orderIndex ?? index,
              scoreValue: option.scoreValue ?? 0,
            })),
          },
        },
        include: { options: { orderBy: { orderIndex: 'asc' } } },
      });
      await this.audit(tx, actorAdminId, 'CREATE_CALCULATOR_QUESTION', question.id, {
        versionId,
        code: question.code,
      });
      return question;
    });
  }

  async updateQuestion(questionId: string, actorAdminId: string, dto: CalculatorQuestionDto) {
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.findUnique({
        where: { id: questionId },
        include: { calculatorVersion: { include: { calculator: true } } },
      });
      if (!question) throw new NotFoundException('Question was not found.');
      const version = await this.assertDraft(
        tx,
        question.calculatorVersionId,
      );
      this.validateQuestion(version.calculator.slug, dto);
      if (dto.scoreCategoryId) {
        await this.assertCategory(tx, version.id, dto.scoreCategoryId);
      }
      const updated = await tx.question.update({
        where: { id: questionId },
        data: {
          scoreCategoryId: dto.scoreCategoryId || null,
          code: dto.code,
          title: dto.title.trim(),
          helpText: dto.helpText?.trim() || null,
          type: dto.type,
          orderIndex: dto.orderIndex ?? question.orderIndex,
          weight: dto.weight ?? 1,
          isRequired: dto.isRequired,
          isActive: dto.isActive ?? true,
          calculationKey: dto.calculationKey || null,
          validationRules: jsonField(dto.validationRules),
          defaultValue: jsonField(dto.defaultValue),
          displayConditions: jsonField(dto.displayConditions),
          options: {
            deleteMany: {},
            create: dto.options.map((option, index) => ({
              label: option.label.trim(),
              value: option.value,
              orderIndex: option.orderIndex ?? index,
              scoreValue: option.scoreValue ?? 0,
            })),
          },
        },
        include: { options: { orderBy: { orderIndex: 'asc' } } },
      });
      await this.audit(tx, actorAdminId, 'UPDATE_CALCULATOR_QUESTION', questionId, {
        versionId: version.id,
      });
      return updated;
    });
  }

  async archiveQuestion(questionId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.findUnique({
        where: { id: questionId },
        select: { id: true, calculatorVersionId: true, isActive: true },
      });
      if (!question) throw new NotFoundException('Question was not found.');
      await this.assertDraft(tx, question.calculatorVersionId);
      const updated = await tx.question.update({
        where: { id: questionId },
        data: { isActive: false },
      });
      await this.audit(tx, actorAdminId, 'ARCHIVE_CALCULATOR_QUESTION', questionId, {
        isActive: question.isActive,
      });
      return updated;
    });
  }

  async reorderQuestions(versionId: string, actorAdminId: string, questionIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertDraft(tx, versionId);
      const questions = await tx.question.findMany({
        where: { calculatorVersionId: versionId },
        select: { id: true },
      });
      if (
        questionIds.length !== questions.length ||
        new Set(questionIds).size !== questionIds.length ||
        questionIds.some((id) => !questions.some((question) => question.id === id))
      ) {
        throw new BadRequestException(
          'Reordering must include every question in this draft exactly once.',
        );
      }
      await Promise.all(
        questionIds.map((id, orderIndex) =>
          tx.question.update({ where: { id }, data: { orderIndex } }),
        ),
      );
      await this.audit(tx, actorAdminId, 'REORDER_CALCULATOR_QUESTIONS', versionId, {
        questionIds,
      });
      return tx.question.findMany({
        where: { calculatorVersionId: versionId },
        orderBy: { orderIndex: 'asc' },
        include: { options: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  }

  async validateVersion(versionId: string) {
    const version = await this.prisma.calculatorVersion.findUnique({
      where: { id: versionId },
      include: {
        calculator: true,
        questions: { where: { isActive: true }, include: { options: true } },
        scoreCategories: true,
      },
    });
    if (!version) throw new NotFoundException('Calculator version was not found.');
    const errors = this.versionErrors(version);
    return { valid: errors.length === 0, errors };
  }

  async publishVersion(versionId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.calculatorVersion.findUnique({
        where: { id: versionId },
        include: {
          calculator: true,
          questions: { where: { isActive: true }, include: { options: true } },
          scoreCategories: true,
        },
      });
      if (!version) throw new NotFoundException('Calculator version was not found.');
      await this.assertDraft(tx, versionId);
      const errors = this.versionErrors(version);
      if (errors.length > 0) {
        throw new BadRequestException({
          message: 'Calculator version failed validation.',
          errors,
        });
      }
      await tx.calculatorVersion.updateMany({
        where: { calculatorId: version.calculatorId, isPublished: true },
        data: { isPublished: false },
      });
      const published = await tx.calculatorVersion.update({
        where: { id: versionId },
        data: { isPublished: true, publishedAt: new Date() },
      });
      await this.audit(tx, actorAdminId, 'PUBLISH_CALCULATOR_VERSION', versionId, {
        versionNumber: version.versionNumber,
      });
      return published;
    });
  }

  private versionErrors(version: {
    calculator: { slug: string };
    questions: Array<{
    id: string;
    code: string;
      type: QuestionType;
      calculationKey: string | null;
      scoreCategoryId: string | null;
      displayConditions: Prisma.JsonValue | null;
      validationRules: Prisma.JsonValue | null;
      weight: number;
      options: Array<{ value: string; scoreValue: number }>;
    }>;
    scoreCategories: Array<{ id: string }>;
  }): string[] {
    const errors: string[] = [];
    if (version.questions.length === 0) errors.push('At least one active question is required.');
    const questionsByCode = new Map(
      version.questions.map((question) => [question.code, question]),
    );
    const questionIds = new Set(version.questions.map((question) => question.id));
    for (const question of version.questions) {
      if (!SUPPORTED_QUESTION_TYPES.includes(question.type as (typeof SUPPORTED_QUESTION_TYPES)[number])) {
        errors.push(`${question.code} uses unsupported question type ${question.type}.`);
      }
      if (
        (question.type === QuestionType.SINGLE_CHOICE ||
          question.type === QuestionType.BOOLEAN) &&
        question.options.length === 0
      ) {
        errors.push(`${question.code} requires answer options.`);
      }
      if (
        (question.type === QuestionType.NUMERIC_INPUT ||
          question.type === QuestionType.SLIDER) &&
        question.options.length > 0
      ) {
        errors.push(`${question.code} cannot define answer options for a numeric input.`);
      }
      if (
        version.calculator.slug === 'hr-health-check' &&
        question.scoreCategoryId === null
      ) {
        errors.push(`${question.code} must map to a scoring category.`);
      }
      if (!Number.isFinite(question.weight) || question.weight < 0) {
        errors.push(`${question.code} must have a finite non-negative weight.`);
      }
      if (question.displayConditions !== null) {
        try {
          validateCondition(question.displayConditions);
          for (const reference of conditionReferences(question.displayConditions)) {
            if (
              (reference.questionCode && !questionsByCode.has(reference.questionCode)) ||
              (reference.questionId && !questionIds.has(reference.questionId))
            ) {
              errors.push(`${question.code} has a visibility condition referencing an unknown question.`);
            }
          }
        } catch (cause) {
          errors.push(
            `${question.code} has invalid visibility conditions: ${cause instanceof Error ? cause.message : 'unsupported condition'}`,
          );
        }
      }
    }
    const expectedKeys = SUPPORTED_CALCULATOR_INPUT_KEYS[version.calculator.slug];
    if (expectedKeys) {
      const mapped = version.questions.map(
        (question) => question.calculationKey || question.code,
      );
      for (const expected of expectedKeys) {
        if (!mapped.includes(expected)) {
          errors.push(`The required calculation input "${expected}" is not mapped.`);
        }
      }
      for (const key of mapped) {
        if (!expectedKeys.some((expected) => expected === key)) {
          errors.push(`Calculation input "${key}" is not supported by this calculator.`);
        }
      }
      for (const question of version.questions) {
        const key = question.calculationKey || question.code;
        if (numericInputKeys.has(key) &&
          question.type !== QuestionType.NUMERIC_INPUT &&
          question.type !== QuestionType.SLIDER
        ) {
          errors.push(`${question.code} must use a numeric question type for "${key}".`);
        }
        const values = supportedOptionValues[key];
        if (values) {
          const actualValues = question.options.map((option) => option.value).sort();
          if (JSON.stringify(actualValues) !== JSON.stringify([...values].sort())) {
            errors.push(`${question.code} must preserve the supported answer values for "${key}".`);
          }
        }
        if (question.options.some((option) => !Number.isFinite(option.scoreValue))) {
          errors.push(`${question.code} has a non-finite option score.`);
        }
      }
      for (const key of new Set(mapped)) {
        if (mapped.filter((mappedKey) => mappedKey === key).length > 1) {
          errors.push(`Calculation input "${key}" is mapped by more than one question.`);
        }
      }
    }
    if (
      version.calculator.slug === 'hr-health-check' &&
      version.scoreCategories.length === 0
    ) {
      errors.push('The health check requires at least one scoring category.');
    }
    return [...new Set(errors)];
  }

  private validateQuestion(slug: string, dto: CalculatorQuestionDto) {
    if (!SUPPORTED_QUESTION_TYPES.includes(dto.type as (typeof SUPPORTED_QUESTION_TYPES)[number])) {
      throw new BadRequestException(
        `Question type "${dto.type}" is not supported by answer persistence.`,
      );
    }
    if (
      (dto.type === QuestionType.SINGLE_CHOICE || dto.type === QuestionType.BOOLEAN) &&
      dto.options.length === 0
    ) {
      throw new BadRequestException('Choice questions require at least one option.');
    }
    if (
      (dto.type === QuestionType.NUMERIC_INPUT || dto.type === QuestionType.SLIDER) &&
      dto.options.length > 0
    ) {
      throw new BadRequestException('Numeric questions cannot define answer options.');
    }
    const inputKeys = SUPPORTED_CALCULATOR_INPUT_KEYS[slug];
    const mapping = dto.calculationKey || dto.code;
    if (inputKeys && !inputKeys.includes(mapping)) {
      throw new BadRequestException(
        `Calculation input "${mapping}" is not supported by ${slug}.`,
      );
    }
    if (slug === 'hr-health-check' && dto.calculationKey) {
      throw new BadRequestException(
        'The health check uses question categories and option scores, not monetary input mappings.',
      );
    }
    if (dto.displayConditions !== undefined && dto.displayConditions !== null) {
      validateCondition(dto.displayConditions);
    }
    const rules = dto.validationRules;
    if (rules) {
      for (const key of ['minimum', 'maximum', 'step']) {
        const value = rules[key];
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
          throw new BadRequestException(`Validation rule "${key}" must be a finite number.`);
        }
      }
      if (
        typeof rules.minimum === 'number' &&
        typeof rules.maximum === 'number' &&
        rules.minimum > rules.maximum
      ) {
        throw new BadRequestException('The minimum cannot exceed the maximum.');
      }
      if (
        rules.step !== undefined &&
        (typeof rules.step !== 'number' || rules.step <= 0)
      ) {
        throw new BadRequestException('The numeric step must be greater than zero.');
      }
    }
    if (dto.options.some((option) => !Number.isFinite(option.scoreValue ?? 0))) {
      throw new BadRequestException('Option scores must be finite numbers.');
    }
    const key = dto.calculationKey || dto.code;
    const values = supportedOptionValues[key];
    if (values) {
      const actualValues = dto.options.map((option) => option.value).sort();
      if (JSON.stringify(actualValues) !== JSON.stringify([...values].sort())) {
        throw new BadRequestException(
          `This question must preserve the supported answer values for "${key}".`,
        );
      }
    }
  }

  private async findCalculator(slug: string) {
    if (!publicCalculatorSlugs.has(slug)) {
      throw new NotFoundException('Supported calculator was not found.');
    }
    const calculator = await this.prisma.calculator.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!calculator) throw new NotFoundException('Supported calculator was not found.');
    return calculator;
  }

  private async assertDraft(tx: Prisma.TransactionClient, versionId: string) {
    const version = await tx.calculatorVersion.findUnique({
      where: { id: versionId },
      include: { calculator: true },
    });
    if (!version) throw new NotFoundException('Calculator version was not found.');
    if (!publicCalculatorSlugs.has(version.calculator.slug)) {
      throw new BadRequestException('This calculator configuration is not supported.');
    }
    if (version.isPublished || version.publishedAt) {
      throw new ConflictException('Published calculator versions are immutable.');
    }
    return version;
  }

  private async assertCategory(
    tx: Prisma.TransactionClient,
    versionId: string,
    categoryId: string,
  ) {
    const category = await tx.scoreCategory.findFirst({
      where: { id: categoryId, calculatorVersionId: versionId },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('Scoring category is not in this version.');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorAdminId: string,
    action: string,
    resourceId: string,
    diff: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actorAdminId,
        action,
        resource: 'CalculatorConfiguration',
        resourceId,
        diff,
      },
    });
  }
}

function conditionReferences(value: unknown): Array<{
  questionCode?: string;
  questionId?: string;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (record.operator === 'AND' || record.operator === 'OR') {
    const conditions = Array.isArray(record.conditions) ? record.conditions : [];
    const groups = Array.isArray(record.groups) ? record.groups : [];
    return [...conditions, ...groups].flatMap(conditionReferences);
  }
  return [{
    ...(typeof record.questionCode === 'string'
      ? { questionCode: record.questionCode }
      : {}),
    ...(typeof record.questionId === 'string'
      ? { questionId: record.questionId }
      : {}),
  }];
}

function jsonField(value: unknown) {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : asPrismaJson(value);
}

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  const ancestors = new WeakSet<object>();
  const convert = (
    current: unknown,
    nested: boolean,
  ): Prisma.InputJsonValue | null | undefined => {
    if (current === null) return nested ? null : undefined;
    if (typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new BadRequestException('JSON numbers must be finite.');
      }
      return current;
    }
    if (current === undefined) return undefined;
    if (typeof current !== 'object') {
      throw new BadRequestException('Value contains unsupported JSON data.');
    }
    if (ancestors.has(current)) {
      throw new BadRequestException('Circular values are not supported in JSON fields.');
    }
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return current.map((item) => {
          const converted = convert(item, true);
          return converted === undefined ? null : converted;
        });
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BadRequestException('JSON fields must contain plain objects.');
      }
      if (Reflect.ownKeys(current).some((key) => typeof key === 'symbol')) {
        throw new BadRequestException('JSON fields cannot contain symbol keys.');
      }
      const output: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [key, item] of Object.entries(current)) {
        const converted = convert(item, true);
        if (converted !== undefined) output[key] = converted;
      }
      return output;
    } finally {
      ancestors.delete(current);
    }
  };
  const result = convert(value, false);
  if (result === null || result === undefined) {
    throw new BadRequestException('A JSON field must be a non-null JSON value.');
  }
  return result;
}

function remapQuestionReferences(value: unknown, questionIds: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapQuestionReferences(item, questionIds));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key === 'questionId' && typeof nested === 'string'
        ? questionIds.get(nested) ?? nested
        : remapQuestionReferences(nested, questionIds),
    ]),
  );
}

function remapExpression(expression: string, questionIds: Map<string, string>) {
  if (!expression.trim().startsWith('{')) return expression;
  try {
    return JSON.stringify(
      remapQuestionReferences(JSON.parse(expression) as unknown, questionIds),
    );
  } catch {
    throw new BadRequestException('A source scoring rule contains invalid JSON.');
  }
}
