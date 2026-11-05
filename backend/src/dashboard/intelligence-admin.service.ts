import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentStatus, ColdEmailTemplateStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import {
  CreateRecommendationRuleDto,
  CreateScoringRuleDto,
  IntelligenceListQueryDto,
  UpdateRecommendationRuleDto,
  CreateRecommendationTemplateDto,
  UpdateRecommendationTemplateDto,
  UpdateScoreCategoryDto,
  UpdateScoringRuleDto,
} from './dto/intelligence-admin.dto';
import {
  CompanyPainPointDto,
  CompanyPainPointListDto,
} from './dto/company-pain-point.dto';
import {
  ColdEmailTemplateDto,
  UpdateColdEmailTemplateDto,
  ColdEmailTemplateListQueryDto,
  ColdEmailPreviewDto,
} from './dto/cold-email-template.dto';

const SUPPORTED_SCORED_CALCULATOR = 'hr-health-check';
const SCORE_EXPRESSION = /^SCORE\s*(<|<=|>|>=|==)\s*(\d+(?:\.\d+)?)$/i;
const CONDITION_OPERATORS = new Set([
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'CONTAINS',
  'NOT_CONTAINS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
]);

@Injectable()
export class IntelligenceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly recommendationService: RecommendationService,
  ) {}

  async listVersions() {
    const items = await this.prisma.calculatorVersion.findMany({
      where: {
        calculator: {
          slug: SUPPORTED_SCORED_CALCULATOR,
          deletedAt: null,
        },
      },
      orderBy: [{ calculatorId: 'asc' }, { versionNumber: 'desc' }],
      include: {
        calculator: { select: { id: true, slug: true, name: true } },
        scoreCategories: {
          select: { id: true, code: true, name: true, weight: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { scoringRules: true, recommendationRules: true } },
      },
    });
    return items.map(({ _count, ...version }) => ({
      ...version,
      scoringRuleCount: _count.scoringRules,
      recommendationRuleCount: _count.recommendationRules,
    }));
  }

  async createDraft(
    sourceVersionId: string,
    actorAdminId: string,
    changelog?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.calculatorVersion.findUnique({
        where: { id: sourceVersionId },
        include: {
          calculator: true,
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { options: { orderBy: { orderIndex: 'asc' } } },
          },
          scoreCategories: true,
          scoringRules: true,
          recommendationRules: true,
        },
      });
      if (!source || source.calculator.slug !== SUPPORTED_SCORED_CALCULATOR) {
        throw new NotFoundException(
          'The scored calculator version was not found.',
        );
      }
      if (!source.isPublished) {
        throw new ConflictException(
          'A draft can only be created from a published version.',
        );
      }
      const existingDraft = await tx.calculatorVersion.findFirst({
        where: {
          calculatorId: source.calculatorId,
          isPublished: false,
          publishedAt: null,
        },
        select: { id: true },
      });
      if (existingDraft) {
        throw new ConflictException(
          'A draft already exists for this calculator. Publish or discard it before creating another.',
        );
      }
      const latestVersion = await tx.calculatorVersion.findFirst({
        where: { calculatorId: source.calculatorId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const draft = await tx.calculatorVersion.create({
        data: {
          calculatorId: source.calculatorId,
          versionNumber:
            (latestVersion?.versionNumber ?? source.versionNumber) + 1,
          changelog:
            changelog?.trim() ||
            `Draft based on version ${source.versionNumber}`,
          isPublished: false,
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
            displayConditions:
              question.displayConditions === null ? Prisma.JsonNull : undefined,
            options: {
              create: question.options.map((option) => ({
                label: option.label,
                value: option.value,
                orderIndex: option.orderIndex,
                scoreValue: option.scoreValue,
                metadata:
                  option.metadata === null ? Prisma.JsonNull : option.metadata,
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
              displayConditions: remapJson(
                copied.source.displayConditions,
                questionIds,
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
            conditionExpression: remapScoringExpression(
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
                : remapJson(rule.conditionJson, questionIds),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_INTELLIGENCE_DRAFT',
          resource: 'CalculatorVersion',
          resourceId: draft.id,
          diff: {
            sourceVersionId,
            versionNumber: draft.versionNumber,
            changelog: draft.changelog,
          },
        },
      });
      return draft;
    });
  }

  async publishVersion(versionId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.calculatorVersion.findUnique({
        where: { id: versionId },
        include: {
          calculator: true,
          scoreCategories: true,
          questions: true,
          scoringRules: true,
          recommendationRules: true,
        },
      });
      if (!version || version.calculator.slug !== SUPPORTED_SCORED_CALCULATOR) {
        throw new NotFoundException(
          'The scored calculator version was not found.',
        );
      }
      if (version.isPublished) {
        throw new ConflictException(
          'This calculator version is already published.',
        );
      }
      if (version.publishedAt) {
        throw new ConflictException(
          'Previously published calculator versions are immutable. Create a draft from the current published version.',
        );
      }
      if (
        version.scoreCategories.length === 0 ||
        version.questions.length === 0
      ) {
        throw new BadRequestException(
          'A calculator version must contain questions and scoring categories before publication.',
        );
      }
      for (const rule of version.scoringRules) {
        this.validateScoringExpression(rule.conditionExpression);
      }
      for (const rule of version.recommendationRules) {
        this.validateScoreRange(rule.minScore, rule.maxScore);
        if (rule.conditionJson !== null) validateCondition(rule.conditionJson);
      }
      await tx.calculatorVersion.updateMany({
        where: {
          calculatorId: version.calculatorId,
          isPublished: true,
          id: { not: version.id },
        },
        data: { isPublished: false },
      });
      const published = await tx.calculatorVersion.update({
        where: { id: version.id },
        data: { isPublished: true, publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'PUBLISH_INTELLIGENCE_VERSION',
          resource: 'CalculatorVersion',
          resourceId: version.id,
          diff: { versionNumber: version.versionNumber },
        },
      });
      return published;
    });
  }

  async listCompanyPainPoints(query: CompanyPainPointListDto) {
    const search = query.search?.trim();
    return this.prisma.companyPainPoint.findMany({
      where: {
        ...(query.calculatorSlug ? { calculatorSlug: query.calculatorSlug } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { title: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: 'asc' }, { versionNumber: 'desc' }],
      include: { _count: { select: { findings: true } } },
    });
  }

  async createCompanyPainPointDraft(
    actorAdminId: string,
    dto: CompanyPainPointDto,
  ) {
    await this.validatePainPoint(dto.calculatorSlug, dto.detectionRule);
    const existing = await this.prisma.companyPainPoint.findFirst({
      where: { code: dto.code, calculatorSlug: dto.calculatorSlug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This pain-point code already exists. Create a new version from its history.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const point = await tx.companyPainPoint.create({
        data: {
          ...dto,
          title: dto.title.trim(),
          description: dto.description.trim(),
          businessImpact: dto.businessImpact.trim(),
          category: dto.category.trim(),
          suggestedSolution: dto.suggestedSolution?.trim() || null,
          detectionRule: toAdminJson(dto.detectionRule),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_COMPANY_PAIN_POINT_DRAFT',
          resource: 'CompanyPainPoint',
          resourceId: point.id,
          diff: { code: point.code, calculatorSlug: point.calculatorSlug },
        },
      });
      return point;
    });
  }

  async createCompanyPainPointVersion(
    sourceId: string,
    actorAdminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.companyPainPoint.findUnique({
        where: { id: sourceId },
      });
      if (!source || !source.publishedAt) {
        throw new NotFoundException('Published pain-point version was not found.');
      }
      const openDraft = await tx.companyPainPoint.findFirst({
        where: { versionGroupId: source.versionGroupId, publishedAt: null },
        select: { id: true },
      });
      if (openDraft) {
        throw new ConflictException('A draft already exists for this pain point.');
      }
      const latest = await tx.companyPainPoint.findFirst({
        where: { versionGroupId: source.versionGroupId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const point = await tx.companyPainPoint.create({
        data: {
          code: source.code,
          versionGroupId: source.versionGroupId,
          versionNumber: (latest?.versionNumber ?? source.versionNumber) + 1,
          title: source.title,
          description: source.description,
          businessImpact: source.businessImpact,
          calculatorSlug: source.calculatorSlug,
          detectionRule: source.detectionRule as Prisma.InputJsonValue,
          category: source.category,
          priority: source.priority,
          suggestedSolution: source.suggestedSolution,
          isActive: source.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_COMPANY_PAIN_POINT_VERSION',
          resource: 'CompanyPainPoint',
          resourceId: point.id,
          diff: { sourceId, versionNumber: point.versionNumber },
        },
      });
      return point;
    });
  }

  async updateCompanyPainPoint(
    pointId: string,
    actorAdminId: string,
    dto: CompanyPainPointDto,
  ) {
    const existing = await this.prisma.companyPainPoint.findUnique({
      where: { id: pointId },
    });
    if (!existing) throw new NotFoundException('Company pain point was not found.');
    if (existing.publishedAt) {
      throw new ConflictException('Published pain-point versions are immutable.');
    }
    if (
      existing.calculatorSlug !== dto.calculatorSlug ||
      existing.code !== dto.code
    ) {
      throw new BadRequestException(
        'A pain-point version cannot change its calculator or stable code.',
      );
    }
    await this.validatePainPoint(dto.calculatorSlug, dto.detectionRule);
    return this.prisma.$transaction(async (tx) => {
      const point = await tx.companyPainPoint.update({
        where: { id: pointId },
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          businessImpact: dto.businessImpact.trim(),
          detectionRule: toAdminJson(dto.detectionRule),
          category: dto.category.trim(),
          priority: dto.priority,
          suggestedSolution: dto.suggestedSolution?.trim() || null,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'UPDATE_COMPANY_PAIN_POINT_DRAFT',
          resource: 'CompanyPainPoint',
          resourceId: pointId,
          diff: { title: point.title, category: point.category, isActive: point.isActive },
        },
      });
      return point;
    });
  }

  async publishCompanyPainPoint(pointId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const point = await tx.companyPainPoint.findUnique({
        where: { id: pointId },
      });
      if (!point) throw new NotFoundException('Company pain point was not found.');
      if (point.publishedAt) {
        throw new ConflictException('This pain-point version was already published.');
      }
      await this.validatePainPoint(point.calculatorSlug, point.detectionRule);
      const published = await tx.companyPainPoint.update({
        where: { id: pointId },
        data: { publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'PUBLISH_COMPANY_PAIN_POINT',
          resource: 'CompanyPainPoint',
          resourceId: pointId,
          diff: { code: point.code, versionNumber: point.versionNumber },
        },
      });
      return published;
    });
  }

  private async validatePainPoint(calculatorSlug: string, detectionRule: unknown) {
    validateCondition(detectionRule);
    const version = await this.prisma.calculatorVersion.findFirst({
      where: {
        isPublished: true,
        calculator: { slug: calculatorSlug, deletedAt: null },
      },
      orderBy: { versionNumber: 'desc' },
      include: {
        questions: {
          where: { isActive: true },
          select: { code: true },
        },
      },
    });
    if (!version) {
      throw new BadRequestException('The calculator has no active published question version.');
    }
    const codes = new Set(version.questions.map((question) => question.code));
    for (const reference of collectConditionReferences(detectionRule)) {
      if (!reference.questionCode || reference.questionId) {
        throw new BadRequestException(
          'Pain-point detection must use stable question codes, not version-specific question IDs.',
        );
      }
      if (!codes.has(reference.questionCode)) {
        throw new BadRequestException(
          `Pain-point detection references unsupported question "${reference.questionCode}".`,
        );
      }
    }
  }

  async listColdEmailTemplates(query: ColdEmailTemplateListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ColdEmailTemplateWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.coldEmailTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.coldEmailTemplate.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createColdEmailTemplateDraft(
    actorAdminId: string,
    dto: ColdEmailTemplateDto,
  ) {
    const name = dto.name.trim();
    const subject = dto.subject.trim();
    const body = dto.body.trim();
    if (!name || !subject || !body) {
      throw new BadRequestException('Template name, subject, and body are required.');
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.coldEmailTemplate.create({
        data: {
          name,
          subject,
          body,
          description: dto.description?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          applicablePainPointCategories: dto.applicablePainPointCategories || [],
          status: ColdEmailTemplateStatus.DRAFT,
          versionNumber: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_COLD_EMAIL_TEMPLATE_DRAFT',
          resource: 'ColdEmailTemplate',
          resourceId: template.id,
          diff: { name: template.name, versionNumber: 1 },
        },
      });
      return template;
    });
  }

  async createColdEmailTemplateVersion(
    sourceId: string,
    actorAdminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.coldEmailTemplate.findUnique({
        where: { id: sourceId },
      });
      if (!source || source.status !== ColdEmailTemplateStatus.PUBLISHED) {
        throw new NotFoundException('Published cold-email template was not found.');
      }
      const openDraft = await tx.coldEmailTemplate.findFirst({
        where: { versionGroupId: source.versionGroupId, status: ColdEmailTemplateStatus.DRAFT },
        select: { id: true },
      });
      if (openDraft) {
        throw new ConflictException('A draft already exists for this cold email template.');
      }
      const latest = await tx.coldEmailTemplate.findFirst({
        where: { versionGroupId: source.versionGroupId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const newVersion = await tx.coldEmailTemplate.create({
        data: {
          versionGroupId: source.versionGroupId,
          versionNumber: (latest?.versionNumber ?? source.versionNumber) + 1,
          name: source.name,
          subject: source.subject,
          body: source.body,
          description: source.description,
          internalNotes: source.internalNotes,
          applicablePainPointCategories: source.applicablePainPointCategories,
          status: ColdEmailTemplateStatus.DRAFT,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_COLD_EMAIL_TEMPLATE_VERSION',
          resource: 'ColdEmailTemplate',
          resourceId: newVersion.id,
          diff: { sourceId, versionNumber: newVersion.versionNumber },
        },
      });
      return newVersion;
    });
  }

  async updateColdEmailTemplate(
    templateId: string,
    actorAdminId: string,
    dto: UpdateColdEmailTemplateDto,
  ) {
    const existing = await this.prisma.coldEmailTemplate.findUnique({
      where: { id: templateId },
    });
    if (!existing) throw new NotFoundException('Cold email template was not found.');
    if (existing.status !== ColdEmailTemplateStatus.DRAFT) {
      throw new ConflictException('Published and archived cold email templates are immutable. Create a new draft version.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coldEmailTemplate.update({
        where: { id: templateId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
          ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes?.trim() || null } : {}),
          ...(dto.applicablePainPointCategories !== undefined
            ? { applicablePainPointCategories: dto.applicablePainPointCategories }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'UPDATE_COLD_EMAIL_TEMPLATE_DRAFT',
          resource: 'ColdEmailTemplate',
          resourceId: templateId,
          diff: { name: updated.name },
        },
      });
      return updated;
    });
  }

  async publishColdEmailTemplate(templateId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.coldEmailTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) throw new NotFoundException('Cold email template was not found.');
      if (template.status !== ColdEmailTemplateStatus.DRAFT) {
        throw new ConflictException('Only draft cold email templates can be published.');
      }
      if (!template.name.trim() || !template.subject.trim() || !template.body.trim()) {
        throw new BadRequestException('Template name, subject, and body cannot be empty.');
      }
      await tx.coldEmailTemplate.updateMany({
        where: {
          versionGroupId: template.versionGroupId,
          status: ColdEmailTemplateStatus.PUBLISHED,
          id: { not: template.id },
        },
        data: { status: ColdEmailTemplateStatus.ARCHIVED },
      });
      const published = await tx.coldEmailTemplate.update({
        where: { id: templateId },
        data: { status: ColdEmailTemplateStatus.PUBLISHED, publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'PUBLISH_COLD_EMAIL_TEMPLATE',
          resource: 'ColdEmailTemplate',
          resourceId: templateId,
          diff: { name: template.name, versionNumber: template.versionNumber },
        },
      });
      return published;
    });
  }

  async archiveColdEmailTemplate(templateId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.coldEmailTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) throw new NotFoundException('Cold email template was not found.');
      const archived = await tx.coldEmailTemplate.update({
        where: { id: templateId },
        data: { status: ColdEmailTemplateStatus.ARCHIVED },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'ARCHIVE_COLD_EMAIL_TEMPLATE',
          resource: 'ColdEmailTemplate',
          resourceId: templateId,
          diff: { name: template.name, versionNumber: template.versionNumber },
        },
      });
      return archived;
    });
  }

  async previewColdEmail(
    templateId: string,
    assessmentId: string,
    dto?: ColdEmailPreviewDto,
  ) {
    const template = await this.prisma.coldEmailTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Cold email template was not found.');

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        lead: { include: { company: true } },
        calculatorVersion: { include: { calculator: true } },
        painPointFindings: true,
        recommendations: {
          include: { template: true },
          take: 5,
        },
        result: true,
      },
    });
    if (!assessment) throw new NotFoundException('Assessment was not found.');

    const lead = assessment.lead;
    const company = lead?.company;
    const companyName = company?.name || 'Your Company';
    const recipientName = lead ? `${lead.firstName} ${lead.lastName}`.trim() : 'Executive';
    const firstName = lead?.firstName || 'there';
    const lastName = lead?.lastName || '';
    const calculatorName = assessment.calculatorVersion.calculator.name;
    const scoreVal = assessment.result?.overallScore !== null && assessment.result?.overallScore !== undefined
      ? `${assessment.result.overallScore}%`
      : 'Completed';

    const painPointBullets = assessment.painPointFindings.length
      ? assessment.painPointFindings.map((p) => `• ${p.title}: ${p.businessImpact}`).join('\n')
      : '• Opportunities for operational efficiency and compliance improvements';

    const recommendationBullets = assessment.recommendations.length
      ? assessment.recommendations.map((r) => `• ${r.title}: ${r.summary}`).join('\n')
      : '• Strategic HR alignment and process modernization';

    const senderName = dto?.senderName || 'GoSwiftHR Specialist';
    const senderCompany = dto?.senderCompany || 'GoSwiftHR';

    const renderText = (input: string) =>
      input
        .replace(/\{\{companyName\}\}/g, companyName)
        .replace(/\{\{recipientName\}\}/g, recipientName)
        .replace(/\{\{firstName\}\}/g, firstName)
        .replace(/\{\{lastName\}\}/g, lastName)
        .replace(/\{\{calculatorName\}\}/g, calculatorName)
        .replace(/\{\{score\}\}/g, scoreVal)
        .replace(/\{\{painPoints\}\}/g, painPointBullets)
        .replace(/\{\{recommendations\}\}/g, recommendationBullets)
        .replace(/\{\{senderName\}\}/g, senderName)
        .replace(/\{\{senderCompany\}\}/g, senderCompany);

    return {
      templateId,
      assessmentId,
      renderedSubject: renderText(template.subject),
      renderedBody: renderText(template.body),
      context: {
        companyName,
        recipientName,
        calculatorName,
        score: scoreVal,
        painPointCount: assessment.painPointFindings.length,
      },
      detectedPainPoints: assessment.painPointFindings.map((p) => ({
        code: p.code,
        title: p.title,
        businessImpact: p.businessImpact,
        priority: p.priority,
        suggestedSolution: p.suggestedSolution,
      })),
    };
  }



  async listScoringRules(query: IntelligenceListQueryDto) {
    const where: Prisma.ScoringRuleWhereInput = {
      ...(query.versionId ? { calculatorVersionId: query.versionId } : {}),
      calculatorVersion: {
        calculator: {
          slug: query.calculatorSlug || SUPPORTED_SCORED_CALCULATOR,
          deletedAt: null,
        },
      },
      ...(query.search
        ? { name: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.scoringRule.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        include: {
          scoreCategory: { select: { id: true, code: true, name: true } },
          calculatorVersion: {
            select: {
              id: true,
              versionNumber: true,
              isPublished: true,
              publishedAt: true,
              calculator: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      }),
      this.prisma.scoringRule.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateScoreCategory(
    categoryId: string,
    actorAdminId: string,
    dto: UpdateScoreCategoryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.scoreCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category)
        throw new NotFoundException('Scoring category was not found.');
      await this.assertDraftVersion(tx, category.calculatorVersionId);
      const updated = await tx.scoreCategory.update({
        where: { id: categoryId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'UPDATE_SCORING_CATEGORY',
        categoryId,
        dto,
      );
      return updated;
    });
  }

  async createScoringRule(
    versionId: string,
    actorAdminId: string,
    dto: CreateScoringRuleDto,
  ) {
    this.validateScoringExpression(dto.conditionExpression);
    return this.prisma.$transaction(async (tx) => {
      await this.assertDraftVersion(tx, versionId);
      await this.assertCategory(tx, versionId, dto.scoreCategoryId);
      const rule = await tx.scoringRule.create({
        data: {
          calculatorVersionId: versionId,
          scoreCategoryId: dto.scoreCategoryId || null,
          name: dto.name.trim(),
          conditionExpression: dto.conditionExpression.trim(),
          multiplier: dto.multiplier,
        },
      });
      await this.writeAudit(tx, actorAdminId, 'CREATE_SCORING_RULE', rule.id, {
        versionId,
      });
      return rule;
    });
  }

  async updateScoringRule(
    ruleId: string,
    actorAdminId: string,
    dto: UpdateScoringRuleDto,
  ) {
    if (dto.conditionExpression !== undefined) {
      this.validateScoringExpression(dto.conditionExpression);
    }
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.scoringRule.findUnique({
        where: { id: ruleId },
        include: { calculatorVersion: true },
      });
      if (!rule) throw new NotFoundException('Scoring rule was not found.');
      await this.assertDraftVersion(tx, rule.calculatorVersionId);
      if (dto.scoreCategoryId !== undefined) {
        await this.assertCategory(
          tx,
          rule.calculatorVersionId,
          dto.scoreCategoryId,
        );
      }
      const updated = await tx.scoringRule.update({
        where: { id: ruleId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.conditionExpression !== undefined
            ? { conditionExpression: dto.conditionExpression.trim() }
            : {}),
          ...(dto.multiplier !== undefined
            ? { multiplier: dto.multiplier }
            : {}),
          ...(dto.scoreCategoryId !== undefined
            ? { scoreCategoryId: dto.scoreCategoryId }
            : {}),
        },
      });
      await this.writeAudit(tx, actorAdminId, 'UPDATE_SCORING_RULE', ruleId, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.conditionExpression !== undefined
          ? { conditionExpression: dto.conditionExpression }
          : {}),
        ...(dto.multiplier !== undefined ? { multiplier: dto.multiplier } : {}),
        ...(dto.scoreCategoryId !== undefined
          ? { scoreCategoryId: dto.scoreCategoryId }
          : {}),
      });
      return updated;
    });
  }

  async deleteScoringRule(ruleId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.scoringRule.findUnique({ where: { id: ruleId } });
      if (!rule) throw new NotFoundException('Scoring rule was not found.');
      await this.assertDraftVersion(tx, rule.calculatorVersionId);
      await tx.scoringRule.delete({ where: { id: ruleId } });
      await this.writeAudit(tx, actorAdminId, 'DISABLE_SCORING_RULE', ruleId, {
        name: rule.name,
      });
      return { id: ruleId, disabled: true };
    });
  }

  async listRecommendationTemplates(query: IntelligenceListQueryDto) {
    const where: Prisma.RecommendationTemplateWhereInput = query.search
      ? {
          OR: [
            { code: { contains: query.search.trim(), mode: 'insensitive' } },
            { title: { contains: query.search.trim(), mode: 'insensitive' } },
            { summary: { contains: query.search.trim(), mode: 'insensitive' } },
          ],
        }
      : {};
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.recommendationTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
        include: {
          rules: {
            select: {
              scoreCategory: { select: { code: true, name: true } },
            },
          },
          _count: { select: { rules: true, assessmentRecommendations: true } },
        },
      }),
      this.prisma.recommendationTemplate.count({ where }),
    ]);
    const groups = [...new Set(items.map((item) => item.versionGroupId))];
    const groupVersions = groups.length
      ? await this.prisma.recommendationTemplate.findMany({
          where: { versionGroupId: { in: groups } },
          select: {
            versionGroupId: true,
            versionNumber: true,
            isPublished: true,
            publishedAt: true,
          },
        })
      : [];
    const publishedByGroup = new Map<string, number>();
    const latestByGroup = new Map<string, number>();
    for (const item of groupVersions) {
      latestByGroup.set(
        item.versionGroupId,
        Math.max(
          latestByGroup.get(item.versionGroupId) ?? 0,
          item.versionNumber,
        ),
      );
      if (item.isPublished) {
        publishedByGroup.set(
          item.versionGroupId,
          Math.max(
            publishedByGroup.get(item.versionGroupId) ?? 0,
            item.versionNumber,
          ),
        );
      }
    }
    return {
      items: items.map(({ _count, rules, ...template }) => ({
        ...template,
        status: template.isPublished
          ? 'PUBLISHED'
          : template.versionNumber >
              (publishedByGroup.get(template.versionGroupId) ?? 0)
            ? template.publishedAt &&
              template.versionNumber ===
                latestByGroup.get(template.versionGroupId) &&
              !publishedByGroup.has(template.versionGroupId)
              ? 'INACTIVE'
              : 'DRAFT'
            : 'SUPERSEDED',
        ruleCount: _count.rules,
        generatedRecommendationCount: _count.assessmentRecommendations,
        applicableCategories: [
          ...new Set(
            rules.map((rule) => rule.scoreCategory?.name ?? 'Overall'),
          ),
        ],
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createRecommendationTemplate(
    actorAdminId: string,
    dto: CreateRecommendationTemplateDto,
  ) {
    this.validateTemplateContent(dto.title, dto.summary, dto.actionPlan);
    const code = dto.code.trim();
    const existing = await this.prisma.recommendationTemplate.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A template with this code already exists.');
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.recommendationTemplate.create({
        data: {
          code,
          versionGroupId: randomUUID(),
          versionNumber: 1,
          isPublished: false,
          title: dto.title.trim(),
          summary: dto.summary.trim(),
          actionPlan: dto.actionPlan.trim(),
          priority: dto.priority,
          serviceLink: dto.serviceLink || null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_RECOMMENDATION_TEMPLATE_DRAFT',
          resource: 'RecommendationTemplate',
          resourceId: template.id,
          diff: { code: template.code, versionNumber: 1 },
        },
      });
      return template;
    });
  }

  async createRecommendationTemplateDraft(
    templateId: string,
    actorAdminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.recommendationTemplate.findUnique({
        where: { id: templateId },
      });
      if (!source) {
        throw new NotFoundException('Recommendation template was not found.');
      }
      if (!source.isPublished) {
        const latest = await tx.recommendationTemplate.findFirst({
          where: { versionGroupId: source.versionGroupId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true },
        });
        if (!source.publishedAt || latest?.id !== source.id) {
          throw new ConflictException(
            'A template draft can only be created from the current published or inactive version.',
          );
        }
      }
      const existing = await tx.recommendationTemplate.findFirst({
        where: {
          versionGroupId: source.versionGroupId,
          isPublished: false,
          versionNumber: { gt: source.versionNumber },
        },
      });
      if (existing) {
        throw new ConflictException(
          'A draft already exists for this template. Publish it before creating another.',
        );
      }
      const versionNumber = source.versionNumber + 1;
      const base = await tx.recommendationTemplate.findFirst({
        where: { versionGroupId: source.versionGroupId },
        orderBy: { versionNumber: 'asc' },
        select: { code: true },
      });
      const code = `${base?.code ?? source.code}_V${versionNumber}`;
      const codeConflict = await tx.recommendationTemplate.findUnique({
        where: { code },
        select: { id: true },
      });
      if (codeConflict) {
        throw new ConflictException(
          'The generated version code is already in use. Contact an administrator.',
        );
      }
      const template = await tx.recommendationTemplate.create({
        data: {
          code,
          versionGroupId: source.versionGroupId,
          versionNumber,
          isPublished: false,
          title: source.title,
          summary: source.summary,
          actionPlan: source.actionPlan,
          priority: source.priority,
          serviceLink: source.serviceLink,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorAdminId,
          action: 'CREATE_RECOMMENDATION_TEMPLATE_DRAFT',
          resource: 'RecommendationTemplate',
          resourceId: template.id,
          diff: { sourceTemplateId: source.id, versionNumber },
        },
      });
      return template;
    });
  }

  async updateRecommendationTemplate(
    templateId: string,
    actorAdminId: string,
    dto: UpdateRecommendationTemplateDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.recommendationTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) {
        throw new NotFoundException('Recommendation template was not found.');
      }
      if (template.isPublished) {
        throw new ConflictException(
          'Published template versions are immutable. Create a draft to edit content.',
        );
      }
      this.validateTemplateContent(
        dto.title ?? template.title,
        dto.summary ?? template.summary,
        dto.actionPlan ?? template.actionPlan,
      );
      const updated = await tx.recommendationTemplate.update({
        where: { id: template.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
          ...(dto.actionPlan !== undefined
            ? { actionPlan: dto.actionPlan.trim() }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.serviceLink !== undefined
            ? { serviceLink: dto.serviceLink || null }
            : {}),
        },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'UPDATE_RECOMMENDATION_TEMPLATE',
        templateId,
        dto,
      );
      return updated;
    });
  }

  async publishRecommendationTemplate(
    templateId: string,
    actorAdminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.recommendationTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) {
        throw new NotFoundException('Recommendation template was not found.');
      }
      if (template.isPublished) {
        throw new ConflictException(
          'This template version is already published.',
        );
      }
      if (template.publishedAt) {
        throw new ConflictException(
          'A previously published template version is immutable. Create a new draft from the latest version.',
        );
      }
      const latestVersion = await tx.recommendationTemplate.findFirst({
        where: { versionGroupId: template.versionGroupId },
        orderBy: { versionNumber: 'desc' },
        select: { id: true },
      });
      if (latestVersion?.id !== template.id) {
        throw new ConflictException(
          'Only the latest template draft can be published.',
        );
      }
      this.validateTemplateContent(
        template.title,
        template.summary,
        template.actionPlan,
      );
      await tx.recommendationTemplate.updateMany({
        where: { versionGroupId: template.versionGroupId, isPublished: true },
        data: { isPublished: false },
      });
      const published = await tx.recommendationTemplate.update({
        where: { id: template.id },
        data: { isPublished: true, publishedAt: new Date() },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'PUBLISH_RECOMMENDATION_TEMPLATE',
        template.id,
        { versionNumber: template.versionNumber },
      );
      return published;
    });
  }

  async previewRecommendationTemplate(templateId: string) {
    const template = await this.prisma.recommendationTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        code: true,
        title: true,
        summary: true,
        actionPlan: true,
        priority: true,
        serviceLink: true,
      },
    });
    if (!template) {
      throw new NotFoundException('Recommendation template was not found.');
    }
    this.validateTemplateContent(
      template.title,
      template.summary,
      template.actionPlan,
    );
    return {
      ...template,
      placeholders: extractTemplatePlaceholders([
        template.title,
        template.summary,
        template.actionPlan,
      ]),
      renderedContent: {
        title: template.title,
        summary: template.summary,
        actionPlan: template.actionPlan,
      },
    };
  }

  async deactivateRecommendationTemplate(
    templateId: string,
    actorAdminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.recommendationTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) {
        throw new NotFoundException('Recommendation template was not found.');
      }
      if (!template.isPublished) return { id: template.id, isPublished: false };
      const referenced = await tx.recommendationRule.count({
        where: { templateId },
      });
      if (referenced > 0) {
        throw new ConflictException(
          'This template is referenced by a versioned recommendation rule and cannot be deactivated without breaking its historical configuration.',
        );
      }
      const updated = await tx.recommendationTemplate.update({
        where: { id: template.id },
        data: { isPublished: false },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'DEACTIVATE_RECOMMENDATION_TEMPLATE',
        template.id,
        { versionNumber: template.versionNumber },
      );
      return updated;
    });
  }

  private validateTemplateContent(
    title: string,
    summary: string,
    actionPlan: string,
  ) {
    const allowed = new Set([
      'categoryName',
      'score',
      'riskLevel',
      'maturityLevel',
      'answeredQuestionsCount',
      'visibleQuestionsCount',
    ]);
    const invalid = extractTemplatePlaceholders([
      title,
      summary,
      actionPlan,
    ]).filter((token) => !allowed.has(token));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unsupported template placeholder(s): ${invalid.join(', ')}.`,
      );
    }
  }

  async listRecommendationRules(query: IntelligenceListQueryDto) {
    const where: Prisma.RecommendationRuleWhereInput = {
      ...(query.versionId ? { calculatorVersionId: query.versionId } : {}),
      calculatorVersion: {
        calculator: {
          slug: query.calculatorSlug || SUPPORTED_SCORED_CALCULATOR,
          deletedAt: null,
        },
      },
      ...(query.search
        ? {
            template: {
              OR: [
                {
                  code: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  title: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  summary: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
              ],
            },
          }
        : {}),
    };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.recommendationRule.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          scoreCategory: { select: { id: true, code: true, name: true } },
          template: true,
          calculatorVersion: {
            select: {
              id: true,
              versionNumber: true,
              isPublished: true,
              publishedAt: true,
              calculator: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      }),
      this.prisma.recommendationRule.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createRecommendationRule(
    versionId: string,
    actorAdminId: string,
    dto: CreateRecommendationRuleDto,
  ) {
    this.validateScoreRange(dto.minScore, dto.maxScore);
    if (dto.conditionJson) validateCondition(dto.conditionJson);
    return this.prisma.$transaction(async (tx) => {
      await this.assertDraftVersion(tx, versionId);
      await this.assertCategory(tx, versionId, dto.scoreCategoryId);
      const template = await tx.recommendationTemplate.findFirst({
        where: { id: dto.templateId, isPublished: true },
        select: { id: true },
      });
      if (!template) {
        throw new BadRequestException(
          'Recommendation rules must reference a published template version.',
        );
      }
      const rule = await tx.recommendationRule.create({
        data: {
          calculatorVersionId: versionId,
          templateId: dto.templateId,
          scoreCategoryId: dto.scoreCategoryId || null,
          minScore: dto.minScore ?? null,
          maxScore: dto.maxScore ?? null,
          conditionJson:
            dto.conditionJson == null
              ? Prisma.JsonNull
              : toJsonInput(dto.conditionJson),
        },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'CREATE_RECOMMENDATION_RULE',
        rule.id,
        { versionId },
      );
      return rule;
    });
  }

  async updateRecommendationRule(
    ruleId: string,
    actorAdminId: string,
    dto: UpdateRecommendationRuleDto,
  ) {
    this.validateScoreRange(dto.minScore, dto.maxScore);
    if (dto.conditionJson) validateCondition(dto.conditionJson);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.recommendationRule.findUnique({
        where: { id: ruleId },
      });
      if (!rule)
        throw new NotFoundException('Recommendation rule was not found.');
      await this.assertDraftVersion(tx, rule.calculatorVersionId);
      if (dto.scoreCategoryId !== undefined) {
        await this.assertCategory(
          tx,
          rule.calculatorVersionId,
          dto.scoreCategoryId,
        );
      }
      if (dto.templateId !== undefined) {
        const template = await tx.recommendationTemplate.findFirst({
          where: { id: dto.templateId, isPublished: true },
          select: { id: true },
        });
        if (!template) {
          throw new BadRequestException(
            'Recommendation rules must reference a published template version.',
          );
        }
      }
      const updated = await tx.recommendationRule.update({
        where: { id: ruleId },
        data: {
          ...(dto.templateId !== undefined
            ? { templateId: dto.templateId }
            : {}),
          ...(dto.scoreCategoryId !== undefined
            ? { scoreCategoryId: dto.scoreCategoryId }
            : {}),
          ...(dto.minScore !== undefined ? { minScore: dto.minScore } : {}),
          ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
          ...(dto.conditionJson !== undefined
            ? {
                conditionJson:
                  dto.conditionJson === null
                    ? Prisma.JsonNull
                    : toJsonInput(dto.conditionJson),
              }
            : {}),
        },
      });
      await this.writeAudit(
        tx,
        actorAdminId,
        'UPDATE_RECOMMENDATION_RULE',
        ruleId,
        {
          ...(dto.templateId !== undefined
            ? { templateId: dto.templateId }
            : {}),
          ...(dto.scoreCategoryId !== undefined
            ? { scoreCategoryId: dto.scoreCategoryId }
            : {}),
          ...(dto.minScore !== undefined ? { minScore: dto.minScore } : {}),
          ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
          ...(dto.conditionJson !== undefined
            ? { conditionJson: dto.conditionJson }
            : {}),
        },
      );
      return updated;
    });
  }

  async deleteRecommendationRule(ruleId: string, actorAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.recommendationRule.findUnique({
        where: { id: ruleId },
      });
      if (!rule)
        throw new NotFoundException('Recommendation rule was not found.');
      await this.assertDraftVersion(tx, rule.calculatorVersionId);
      await tx.recommendationRule.delete({ where: { id: ruleId } });
      await this.writeAudit(
        tx,
        actorAdminId,
        'DISABLE_RECOMMENDATION_RULE',
        ruleId,
        { versionId: rule.calculatorVersionId },
      );
      return { id: ruleId, disabled: true };
    });
  }

  async preview(versionId: string, assessmentId: string) {
    const version = await this.prisma.calculatorVersion.findUnique({
      where: { id: versionId },
      include: {
        calculator: true,
        scoreCategories: true,
        questions: { include: { options: true } },
        scoringRules: true,
        recommendationRules: {
          include: {
            scoreCategory: true,
            template: true,
          },
        },
      },
    });
    if (!version || version.calculator.slug !== SUPPORTED_SCORED_CALCULATOR) {
      throw new NotFoundException(
        'The scored calculator version was not found.',
      );
    }

    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        deletedAt: null,
        status: AssessmentStatus.COMPLETED,
      },
      include: {
        calculatorVersion: { select: { calculatorId: true } },
        answers: {
          include: {
            question: { select: { code: true } },
            selectedOption: { select: { value: true } },
          },
        },
      },
    });
    if (
      !assessment ||
      assessment.calculatorVersion.calculatorId !== version.calculatorId
    ) {
      throw new BadRequestException(
        'Preview requires a completed assessment from the same calculator.',
      );
    }
    const questionIdsByCode = new Map(
      version.questions.map((question) => [question.code, question.id]),
    );
    const answers = assessment.answers.flatMap((answer) => {
      const questionId = questionIdsByCode.get(answer.question.code);
      if (!questionId) return [];
      return [
        {
          questionId,
          questionCode: answer.question.code,
          selectedOptionValue: answer.selectedOption?.value ?? null,
          numericValue: answer.numericValue,
          textValue: answer.textValue,
          rawInput: answer.rawInput,
        },
      ];
    });
    const scoringResult = this.scoringService.calculateScores({
      calculatorSlug: version.calculator.slug,
      categories: version.scoreCategories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        weight: category.weight,
      })),
      questions: version.questions.map((question) => ({
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
      scoringRules: version.scoringRules,
      answers,
    });
    const recommendations = this.recommendationService.evaluateRecommendations(
      version.recommendationRules.map((rule) => ({
        id: rule.id,
        templateId: rule.templateId,
        template: {
          id: rule.template.id,
          code: rule.template.code,
          title: rule.template.title,
          summary: rule.template.summary,
          actionPlan: rule.template.actionPlan,
          priority: rule.template.priority,
          serviceLink: rule.template.serviceLink,
        },
        scoreCategoryId: rule.scoreCategoryId,
        scoreCategory: rule.scoreCategory
          ? {
              id: rule.scoreCategory.id,
              code: rule.scoreCategory.code,
              name: rule.scoreCategory.name,
            }
          : null,
        minScore: rule.minScore,
        maxScore: rule.maxScore,
        conditionJson: rule.conditionJson,
      })),
      scoringResult,
      answers,
    );
    return { assessmentId, versionId, scoringResult, recommendations };
  }

  async listPreviewAssessments(query: IntelligenceListQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: Prisma.AssessmentWhereInput = {
      status: AssessmentStatus.COMPLETED,
      calculatorVersion: {
        calculator: { slug: SUPPORTED_SCORED_CALCULATOR, deletedAt: null },
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          completedAt: true,
          calculatorVersion: {
            select: {
              versionNumber: true,
              calculator: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.assessment.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async assertDraftVersion(
    tx: Prisma.TransactionClient,
    versionId: string,
  ) {
    const version = await tx.calculatorVersion.findUnique({
      where: { id: versionId },
      include: { calculator: true },
    });
    if (!version || version.calculator.slug !== SUPPORTED_SCORED_CALCULATOR) {
      throw new NotFoundException(
        'The scored calculator version was not found.',
      );
    }
    if (version.isPublished) {
      throw new ConflictException(
        'Published calculator versions are immutable. Create a draft to edit rules.',
      );
    }
    return version;
  }

  private async assertCategory(
    tx: Prisma.TransactionClient,
    versionId: string,
    categoryId?: string | null,
  ) {
    if (!categoryId) return;
    const category = await tx.scoreCategory.findFirst({
      where: { id: categoryId, calculatorVersionId: versionId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException(
        'The scoring category must belong to this calculator version.',
      );
    }
  }

  private validateScoringExpression(expression: string) {
    const value = expression.trim();
    if (value.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new BadRequestException('Scoring condition JSON is invalid.');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BadRequestException(
          'Scoring condition must be a JSON object.',
        );
      }
      const record = parsed as Record<string, unknown>;
      const allowedKeys = new Set([
        'minScore',
        'maxScore',
        'questionCondition',
      ]);
      if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
        throw new BadRequestException(
          'Scoring condition contains unsupported fields.',
        );
      }
      const min = record.minScore;
      const max = record.maxScore;
      if (
        (min !== undefined && !isScore(min)) ||
        (max !== undefined && !isScore(max)) ||
        (typeof min === 'number' && typeof max === 'number' && min > max)
      ) {
        throw new BadRequestException(
          'Scoring thresholds must be ordered values from 0 to 100.',
        );
      }
      if (record.questionCondition !== undefined) {
        validateCondition(record.questionCondition);
      }
      return;
    }
    const match = SCORE_EXPRESSION.exec(value);
    if (!match || !isScore(Number(match[2]))) {
      throw new BadRequestException(
        'Use a supported score condition (for example SCORE < 40) or a valid JSON condition.',
      );
    }
  }

  private validateScoreRange(min?: number | null, max?: number | null) {
    if (min !== undefined && min !== null && !isScore(min)) {
      throw new BadRequestException(
        'Minimum recommendation score must be between 0 and 100.',
      );
    }
    if (max !== undefined && max !== null && !isScore(max)) {
      throw new BadRequestException(
        'Maximum recommendation score must be between 0 and 100.',
      );
    }
    if (min != null && max != null && min > max) {
      throw new BadRequestException(
        'Minimum recommendation score cannot exceed the maximum.',
      );
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorAdminId: string,
    action: string,
    resourceId: string,
    diff: object,
  ) {
    const jsonDiff = JSON.parse(JSON.stringify(diff)) as Prisma.InputJsonObject;
    await tx.auditLog.create({
      data: {
        adminUserId: actorAdminId,
        action,
        resource: action.includes('SCORING')
          ? 'ScoringRule'
          : 'RecommendationRule',
        resourceId,
        diff: jsonDiff,
      },
    });
  }
}

function isScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

export function validateCondition(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Question condition must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (record.operator === 'AND' || record.operator === 'OR') {
    if (
      (record.conditions !== undefined && !Array.isArray(record.conditions)) ||
      (record.groups !== undefined && !Array.isArray(record.groups))
    ) {
      throw new BadRequestException(
        'Condition groups must contain condition arrays.',
      );
    }
    for (const condition of (record.conditions as unknown[] | undefined) ??
      []) {
      validateCondition(condition);
    }
    for (const group of (record.groups as unknown[] | undefined) ?? []) {
      validateCondition(group);
    }
    return;
  }
  if (
    (!record.questionCode && !record.questionId) ||
    typeof record.operator !== 'string' ||
    !CONDITION_OPERATORS.has(record.operator)
  ) {
    throw new BadRequestException(
      'Question condition has an unsupported operator or target.',
    );
  }
  if (
    record.value !== undefined &&
    typeof record.value !== 'string' &&
    typeof record.value !== 'number' &&
    typeof record.value !== 'boolean' &&
    !(
      Array.isArray(record.value) &&
      record.value.every(
        (item) =>
          typeof item === 'string' ||
          (typeof item === 'number' && Number.isFinite(item)),
      )
    )
  ) {
    throw new BadRequestException(
      'Question condition value has an unsupported type.',
    );
  }
}

function remapScoringExpression(
  expression: string,
  questionIds: Map<string, string>,
): string {
  if (!expression.trim().startsWith('{')) return expression;
  const parsed: unknown = JSON.parse(expression);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return expression;
  const record = { ...(parsed as Record<string, unknown>) };
  if (record.questionCondition !== undefined) {
    record.questionCondition = remapObjectReferences(
      record.questionCondition,
      questionIds,
    );
  }
  return JSON.stringify(record);
}

function remapJson(
  value: Prisma.JsonValue,
  questionIds: Map<string, string>,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === null) return Prisma.JsonNull;
  return remapNonNullJson(value, questionIds);
}

function remapNonNullJson(
  value: Exclude<Prisma.JsonValue, null>,
  questionIds: Map<string, string>,
): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === null ? null : remapNonNullJson(item, questionIds),
    );
  }
  if (typeof value === 'object') {
    const output = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'questionId' && typeof item === 'string'
          ? (questionIds.get(item) ?? item)
          : item === null || item === undefined
            ? null
            : remapNonNullJson(item, questionIds),
      ]),
    );
    return output;
  }
  return value;
}

function collectConditionReferences(
  value: unknown,
): Array<{ questionCode?: string; questionId?: string }> {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (record.operator === 'AND' || record.operator === 'OR') {
    const list: Array<{ questionCode?: string; questionId?: string }> = [];
    for (const c of (record.conditions as unknown[]) ?? []) {
      list.push(...collectConditionReferences(c));
    }
    for (const g of (record.groups as unknown[]) ?? []) {
      list.push(...collectConditionReferences(g));
    }
    return list;
  }
  return [
    {
      questionCode: typeof record.questionCode === 'string' ? record.questionCode : undefined,
      questionId: typeof record.questionId === 'string' ? record.questionId : undefined,
    },
  ];
}

const toAdminJson = toJsonInput;

function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (parsed === null || typeof parsed !== 'object') {
    throw new BadRequestException('The condition must be a JSON object.');
  }
  return parsed;
}

function extractTemplatePlaceholders(values: string[]): string[] {
  const placeholders = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/\{\{([a-zA-Z]+)\}\}/g)) {
      placeholders.add(match[1]);
    }
  }
  return [...placeholders].sort();
}

function remapObjectReferences(
  value: unknown,
  questionIds: Map<string, string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => remapObjectReferences(item, questionIds));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'questionId' && typeof item === 'string'
          ? (questionIds.get(item) ?? item)
          : remapObjectReferences(item, questionIds),
      ]),
    );
  }
  return value;
}
