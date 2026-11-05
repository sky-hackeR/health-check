import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import { ScoringService } from '../scoring/scoring.service';
import { IntelligenceAdminService } from './intelligence-admin.service';

describe('IntelligenceAdminService', () => {
  it('creates a new immutable calculator version draft and remaps question references', async () => {
    const source = {
      id: 'published-version',
      calculatorId: 'calculator',
      versionNumber: 4,
      isPublished: true,
      changelog: null,
      calculator: { id: 'calculator', slug: 'hr-health-check' },
      scoreCategories: [
        {
          id: 'old-category',
          code: 'OPERATIONS',
          name: 'Operations',
          weight: 2,
        },
      ],
      questions: [
        {
          id: 'old-question',
          scoreCategoryId: 'old-category',
          code: 'Q_ONE',
          title: 'Question one',
          helpText: null,
          type: 'SINGLE_CHOICE',
          orderIndex: 0,
          weight: 1,
          isRequired: true,
          displayConditions: null,
          options: [],
        },
        {
          id: 'old-conditional',
          scoreCategoryId: 'old-category',
          code: 'Q_TWO',
          title: 'Question two',
          helpText: null,
          type: 'SINGLE_CHOICE',
          orderIndex: 1,
          weight: 1,
          isRequired: false,
          displayConditions: {
            questionId: 'old-question',
            operator: 'EQUALS',
            value: 'yes',
          },
          options: [],
        },
      ],
      scoringRules: [
        {
          id: 'old-rule',
          scoreCategoryId: 'old-category',
          name: 'Conditional multiplier',
          conditionExpression: JSON.stringify({
            questionCondition: {
              questionId: 'old-question',
              operator: 'EQUALS',
              value: 'yes',
            },
          }),
          multiplier: 1.5,
        },
      ],
      recommendationRules: [],
    };
    const questionCreates: Array<{ data: Record<string, unknown> }> = [];
    const questionUpdates: Array<{ data: Record<string, unknown> }> = [];
    const scoringRuleCreates: Array<{ data: Record<string, unknown> }> = [];
    const versionQueries: Array<{ where: Record<string, unknown> }> = [];
    const findVersion = jest
      .fn()
      .mockImplementation((args: { where: Record<string, unknown> }) => {
        versionQueries.push(args);
        return versionQueries.length === 1 ? null : { versionNumber: 4 };
      });
    const auditCreate = jest.fn();
    const tx = {
      calculatorVersion: {
        findUnique: jest.fn().mockResolvedValue(source),
        findFirst: findVersion,
        create: jest.fn().mockResolvedValue({
          id: 'draft-version',
          versionNumber: 5,
          changelog: 'Draft based on version 4',
        }),
      },
      scoreCategory: {
        create: jest.fn().mockResolvedValue({ id: 'new-category' }),
      },
      question: {
        create: jest
          .fn()
          .mockImplementation(
            ({
              data,
            }: {
              data: Record<string, unknown> & { code: string };
            }) => {
              questionCreates.push({ data });
              return {
                id: data.code === 'Q_ONE' ? 'new-question' : 'new-conditional',
              };
            },
          ),
        update: jest
          .fn()
          .mockImplementation((input: { data: Record<string, unknown> }) => {
            questionUpdates.push(input);
            return input;
          }),
      },
      scoringRule: {
        create: jest
          .fn()
          .mockImplementation((input: { data: Record<string, unknown> }) => {
            scoringRuleCreates.push(input);
            return input;
          }),
      },
      recommendationRule: { create: jest.fn() },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new IntelligenceAdminService(
      prisma,
      new ScoringService(),
      new RecommendationService(),
    );

    const draft = await service.createDraft('published-version', 'admin-id');

    expect(draft).toMatchObject({ id: 'draft-version', versionNumber: 5 });
    expect(versionQueries[0].where).toMatchObject({
      isPublished: false,
      publishedAt: null,
    });
    expect(questionCreates[1].data).toMatchObject({
      calculatorVersionId: 'draft-version',
      scoreCategoryId: 'new-category',
    });
    expect(questionUpdates[0].data.displayConditions).toMatchObject({
      questionId: 'new-question',
    });
    expect(
      JSON.parse(String(scoringRuleCreates[0].data.conditionExpression)),
    ).toMatchObject({
      questionCondition: { questionId: 'new-question' },
    });
    expect(auditCreate.mock.calls).toHaveLength(1);
  });

  it('rejects unsupported recommendation placeholders before creating a template', async () => {
    const findTemplate = jest.fn();
    const prisma = {
      recommendationTemplate: { findUnique: findTemplate },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new IntelligenceAdminService(
      prisma,
      new ScoringService(),
      new RecommendationService(),
    );

    await expect(
      service.createRecommendationTemplate('admin-id', {
        code: 'TEST_TEMPLATE',
        title: 'Test {{unknownToken}}',
        summary: 'Summary',
        actionPlan: 'Action plan',
        priority: 'MEDIUM',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findTemplate.mock.calls).toHaveLength(0);
  });

  it('does not allow a historical calculator version to be republished', async () => {
    const updateMany = jest.fn();
    const update = jest.fn();
    const tx = {
      calculatorVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'old-version',
          calculatorId: 'calculator',
          isPublished: false,
          publishedAt: new Date('2025-01-01T00:00:00.000Z'),
          calculator: { slug: 'hr-health-check' },
        }),
        updateMany,
        update,
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new IntelligenceAdminService(
      prisma,
      new ScoringService(),
      new RecommendationService(),
    );

    await expect(
      service.publishVersion('old-version', 'admin-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany.mock.calls).toHaveLength(0);
    expect(update.mock.calls).toHaveLength(0);
  });

  describe('Company Pain Points', () => {
    it('creates a pain point draft and validates question references', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'point-1',
        code: 'PAYROLL_MANUAL_ERRORS',
        title: 'Manual payroll errors',
        versionNumber: 1,
      });
      const auditCreate = jest.fn().mockResolvedValue({});
      const prisma = {
        companyPainPoint: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        calculatorVersion: {
          findFirst: jest.fn().mockResolvedValue({
            questions: [{ code: 'PC_REGULAR_GROSS_PER_RUN' }],
          }),
        },
        $transaction: jest.fn((cb: any) =>
          cb({
            companyPainPoint: { create },
            auditLog: { create: auditCreate },
          }),
        ),
      } as unknown as PrismaService;

      const service = new IntelligenceAdminService(
        prisma,
        new ScoringService(),
        new RecommendationService(),
      );

      const result = await service.createCompanyPainPointDraft('admin-1', {
        code: 'PAYROLL_MANUAL_ERRORS',
        title: 'Manual payroll errors',
        description: 'Frequent errors in manual calculations.',
        businessImpact: 'Compliance risks and delayed wages.',
        calculatorSlug: 'payroll-cost-calculator',
        category: 'Compliance',
        priority: 'HIGH' as any,
        isActive: true,
        detectionRule: {
          questionCode: 'PC_REGULAR_GROSS_PER_RUN',
          operator: 'GREATER_THAN',
          value: 100000,
        },
      });

      expect(result.id).toBe('point-1');
      expect(create).toHaveBeenCalledTimes(1);
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_COMPANY_PAIN_POINT_DRAFT',
          }),
        }),
      );
    });

    it('rejects pain point creation when detection rule references unsupported question code', async () => {
      const prisma = {
        companyPainPoint: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        calculatorVersion: {
          findFirst: jest.fn().mockResolvedValue({
            questions: [{ code: 'KNOWN_CODE' }],
          }),
        },
      } as unknown as PrismaService;

      const service = new IntelligenceAdminService(
        prisma,
        new ScoringService(),
        new RecommendationService(),
      );

      await expect(
        service.createCompanyPainPointDraft('admin-1', {
          code: 'TEST_PAIN_POINT',
          title: 'Test',
          description: 'Desc',
          businessImpact: 'Impact',
          calculatorSlug: 'payroll-cost-calculator',
          category: 'Tax',
          priority: 'MEDIUM' as any,
          isActive: true,
          detectionRule: {
            questionCode: 'NON_EXISTENT_CODE',
            operator: 'EQUALS',
            value: 'yes',
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Cold Email Templates', () => {
    it('creates a cold email template draft and audits the action', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'cold-1',
        name: 'Payroll Risk Alert',
        subject: 'Addressing {{painPoints}} at {{companyName}}',
        body: 'Hello {{recipientName}}, we noticed potential risks.',
        versionNumber: 1,
        status: 'DRAFT',
      });
      const auditCreate = jest.fn().mockResolvedValue({});
      const prisma = {
        $transaction: jest.fn((cb: any) =>
          cb({
            coldEmailTemplate: { create },
            auditLog: { create: auditCreate },
          }),
        ),
      } as unknown as PrismaService;

      const service = new IntelligenceAdminService(
        prisma,
        new ScoringService(),
        new RecommendationService(),
      );

      const result = await service.createColdEmailTemplateDraft('admin-1', {
        name: 'Payroll Risk Alert',
        subject: 'Addressing {{painPoints}} at {{companyName}}',
        body: 'Hello {{recipientName}}, we noticed potential risks.',
        applicablePainPointCategories: ['Payroll', 'Compliance'],
      });

      expect(result.id).toBe('cold-1');
      expect(create).toHaveBeenCalledTimes(1);
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_COLD_EMAIL_TEMPLATE_DRAFT',
          }),
        }),
      );
    });

    it('publishes a cold email template draft and archives existing published version', async () => {
      const template = {
        id: 'cold-draft-2',
        versionGroupId: 'group-1',
        versionNumber: 2,
        name: 'Payroll Risk Alert',
        subject: 'Subject for {{companyName}}',
        body: 'Body text',
        status: 'DRAFT',
      };
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const update = jest.fn().mockResolvedValue({
        ...template,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });
      const auditCreate = jest.fn().mockResolvedValue({});

      const prisma = {
        $transaction: jest.fn((cb: any) =>
          cb({
            coldEmailTemplate: {
              findUnique: jest.fn().mockResolvedValue(template),
              updateMany,
              update,
            },
            auditLog: { create: auditCreate },
          }),
        ),
      } as unknown as PrismaService;

      const service = new IntelligenceAdminService(
        prisma,
        new ScoringService(),
        new RecommendationService(),
      );

      const published = await service.publishColdEmailTemplate('cold-draft-2', 'admin-1');

      expect(published.status).toBe('PUBLISHED');
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            versionGroupId: 'group-1',
            status: 'PUBLISHED',
          }),
          data: { status: 'ARCHIVED' },
        }),
      );
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PUBLISH_COLD_EMAIL_TEMPLATE',
          }),
        }),
      );
    });

    it('previews a personalized cold email template using assessment and detected pain points', async () => {
      const template = {
        id: 'cold-1',
        subject: 'High priority pain points at {{companyName}}',
        body: 'Dear {{recipientName}}, regarding your {{calculatorName}} score of {{score}}:\n{{painPoints}}\n\nRecommendations:\n{{recommendations}}\n\nBest,\n{{senderName}} from {{senderCompany}}',
      };
      const assessment = {
        id: 'assess-1',
        lead: {
          firstName: 'Amara',
          lastName: 'Okonkwo',
          company: { name: 'Apex Logistics Ltd' },
        },
        calculatorVersion: {
          calculator: { name: 'Payroll Cost Calculator' },
        },
        result: {
          overallScore: 82,
        },
        painPointFindings: [
          {
            code: 'MANUAL_COMPLIANCE_GAP',
            title: 'Unverified Statutory Deduction Records',
            businessImpact: 'High risk of state audit penalties',
            priority: 'HIGH',
            suggestedSolution: 'Automate tax schedule reconciliation.',
          },
        ],
        recommendations: [
          {
            title: 'Automate PAYE filing',
            summary: 'Deploy automated deduction schedules.',
          },
        ],
      };

      const prisma = {
        coldEmailTemplate: {
          findUnique: jest.fn().mockResolvedValue(template),
        },
        assessment: {
          findUnique: jest.fn().mockResolvedValue(assessment),
        },
      } as unknown as PrismaService;

      const service = new IntelligenceAdminService(
        prisma,
        new ScoringService(),
        new RecommendationService(),
      );

      const preview = await service.previewColdEmail('cold-1', 'assess-1', {
        senderName: 'David J.',
        senderCompany: 'GoSwiftHR Advisory',
      });

      expect(preview.renderedSubject).toBe('High priority pain points at Apex Logistics Ltd');
      expect(preview.renderedBody).toContain('Dear Amara Okonkwo');
      expect(preview.renderedBody).toContain('Payroll Cost Calculator score of 82%');
      expect(preview.renderedBody).toContain('Unverified Statutory Deduction Records: High risk of state audit penalties');
      expect(preview.renderedBody).toContain('Automate PAYE filing');
      expect(preview.renderedBody).toContain('David J. from GoSwiftHR Advisory');
      expect(preview.detectedPainPoints).toHaveLength(1);
      expect(preview.context.companyName).toBe('Apex Logistics Ltd');
    });
  });
});
