import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import { ScoringService } from '../scoring/scoring.service';
import { CaptureAssessmentLeadDto } from './dto/capture-assessment-lead.dto';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsService public product endpoints', () => {
  const calculator = {
    id: 'calculator-1',
    slug: 'hr-health-check',
    name: 'Workforce health assessment',
    description: 'Assess HR operations.',
    versions: [
      {
        versionNumber: 1,
        publishedAt: new Date('2026-11-01T00:00:00.000Z'),
        _count: { questions: 1 },
        scoreCategories: [{ id: 'category-1', code: 'OPERATIONS', name: 'Operations' }],
        questions: [{ title: 'How do you manage HR records?', type: 'SINGLE_CHOICE' }],
      },
    ],
  };

  it('lists only public configuration fields for published calculator versions', async () => {
    const prisma = {
      calculator: { findMany: jest.fn().mockResolvedValue([calculator]) },
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );

    await expect(service.getPublishedCalculators()).resolves.toEqual([
      {
        id: calculator.id,
        slug: calculator.slug,
        name: calculator.name,
        description: calculator.description,
        versionNumber: 1,
        publishedAt: calculator.versions[0].publishedAt,
        categories: calculator.versions[0].scoreCategories,
        questionTopics: ['How do you manage HR records?'],
        questionTypes: ['SINGLE_CHOICE'],
        totalQuestions: 1,
      },
    ]);

    expect(prisma.calculator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          deletedAt: null,
          slug: {
            in: [
              'payroll-cost-calculator',
              'payroll-compliance-calculator',
              'hr-administrative-cost-calculator',
              'hr-health-check',
            ],
          },
          versions: { some: { isPublished: true } },
        }),
      }),
    );
  });

  it('does not expose existing non-product calculators or the hidden ROI calculator', async () => {
    const prisma = {
      calculator: { findUnique: jest.fn() },
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );

    await expect(service.getCalculatorConfig('compliance-risk-assessment')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getCalculatorConfig('turnover-retention-calculator')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getCalculatorConfig('hr-tech-roi-calculator')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.startAssessment({ calculatorSlug: 'hr-tech-roi-calculator' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.calculator.findUnique).not.toHaveBeenCalled();
  });

  it('associates a consenting lead with a completed assessment using existing records', async () => {
    const transaction = {
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'company-1' }),
      },
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
      assessment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      leadActivity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
    };
    const prisma = {
      assessment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assessment-1',
          status: AssessmentStatus.COMPLETED,
          expiresAt: null,
          deletedAt: null,
          leadId: null,
          calculatorVersion: {
            calculator: { name: 'Workforce health assessment', slug: 'hr-health-check' },
            questions: [],
          },
          answers: [],
        }),
      },
      $transaction: jest.fn(
        async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );
    const details: CaptureAssessmentLeadDto = {
      email: '  ALEX@EXAMPLE.COM ',
      firstName: ' Alex ',
      lastName: ' Morgan ',
      companyName: ' Example Company ',
      consentGdpr: true,
      consentMarketing: false,
    };

    await expect(
      service.captureLead('session-token', details, '127.0.0.1'),
    ).resolves.toEqual({
      leadId: 'lead-1',
      calculatorName: 'Workforce health assessment',
      alreadyAssociated: false,
    });

    expect(transaction.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alex@example.com',
          firstName: 'Alex',
          lastName: 'Morgan',
          source: 'CALCULATOR',
          consentGdpr: true,
          consentMarketing: false,
          consentIp: '127.0.0.1',
        }),
      }),
    );
    expect(transaction.assessment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'assessment-1',
          status: AssessmentStatus.COMPLETED,
          OR: [{ leadId: null }, { leadId: 'lead-1' }],
        }),
        data: { leadId: 'lead-1' },
      }),
    );
    expect(transaction.leadActivity.create).toHaveBeenCalledTimes(2);
    expect(transaction.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CREATED',
          metadata: expect.objectContaining({
            assessmentId: 'assessment-1',
            calculatorSlug: 'hr-health-check',
            source: 'CALCULATOR',
          }),
        }),
      }),
    );
  });

  it('does not capture lead data before assessment completion', async () => {
    const prisma = {
      assessment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assessment-1',
          status: AssessmentStatus.IN_PROGRESS,
          expiresAt: null,
          deletedAt: null,
          calculatorVersion: {
            calculator: { name: 'Workforce health assessment', slug: 'hr-health-check' },
            questions: [],
          },
          answers: [],
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );

    await expect(
      service.captureLead('session-token', {
        email: 'alex@example.com',
        firstName: 'Alex',
        lastName: 'Morgan',
        companyName: 'Example Company',
        consentGdpr: true,
      }, undefined),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts an email-only submission and associates it idempotently', async () => {
    const transaction = {
      company: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      lead: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'lead-1', deletedAt: null }]),
        create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
        update: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
      assessment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      leadActivity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
    };
    const assessment = {
      id: 'assessment-1',
      status: AssessmentStatus.COMPLETED,
      expiresAt: null,
      deletedAt: null,
      leadId: null,
      calculatorVersion: {
        calculator: { name: 'Workforce health assessment' },
        questions: [],
      },
      answers: [],
    };
    const prisma = {
      assessment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(assessment)
          .mockResolvedValueOnce({ ...assessment, leadId: 'lead-1' }),
      },
      $transaction: jest.fn(
        async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );

    await expect(
      service.captureLead('session-token', { email: 'alex@example.com' }, undefined),
    ).resolves.toMatchObject({ leadId: 'lead-1', alreadyAssociated: false });
    await expect(
      service.captureLead('session-token', { email: 'ALEX@example.com' }, undefined),
    ).resolves.toMatchObject({ leadId: 'lead-1', alreadyAssociated: true });

    expect(transaction.lead.create).toHaveBeenCalledTimes(1);
    expect(transaction.lead.update).toHaveBeenCalledTimes(1);
    expect(transaction.company.findUnique).not.toHaveBeenCalled();
    expect(transaction.leadActivity.create).toHaveBeenCalledTimes(2);
  });

  it('blocks completed result and recommendation reads until a lead is associated', async () => {
    const prisma = {
      assessment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assessment-1',
          status: AssessmentStatus.COMPLETED,
          expiresAt: null,
          deletedAt: null,
          leadId: null,
        }),
      },
      assessmentResult: { findUnique: jest.fn() },
      assessmentRecommendation: { findMany: jest.fn() },
    };
    const service = new AssessmentsService(
      prisma as unknown as PrismaService,
      {} as ScoringService,
      {} as RecommendationService,
    );

    await expect(service.getAssessmentResult('session-token')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.getAssessmentRecommendations('session-token'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.assessmentResult.findUnique).not.toHaveBeenCalled();
    expect(prisma.assessmentRecommendation.findMany).not.toHaveBeenCalled();
  });
});
