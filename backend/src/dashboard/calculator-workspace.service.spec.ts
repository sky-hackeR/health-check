import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculatorWorkspaceService } from './calculator-workspace.service';

describe('CalculatorWorkspaceService', () => {
  const prisma = {
    calculator: {
      findFirst: jest.fn(),
    },
    assessment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    calculatorVersion: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  let service: CalculatorWorkspaceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CalculatorWorkspaceService(
      prisma as unknown as PrismaService,
    );
    prisma.calculator.findFirst.mockResolvedValue({
      id: 'calculator-1',
      slug: 'payroll-cost-calculator',
      name: 'Payroll Cost Calculator',
      description: 'Payroll estimate',
      isActive: true,
    });
    prisma.assessment.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.calculatorVersion.findMany.mockResolvedValue([
      { id: 'version-1', versionNumber: 1, questions: [], scoreCategories: [] },
    ]);
  });

  it('returns database-backed funnel metrics and marks untracked visits as unavailable', async () => {
    const workspace = await service.getWorkspace('payroll-cost-calculator');

    expect(workspace.metrics).toMatchObject({
      totalVisits: null,
      visitsAvailability: 'NOT_TRACKED',
      assessmentStarts: 12,
      completions: 6,
      capturedLeads: 4,
      abandonedAssessments: 2,
      completionRate: 0.5,
      leadCaptureRate: 4 / 6,
    });
    expect(workspace.trend).toEqual([]);
  });

  it('does not expose unsupported calculator slugs', async () => {
    await expect(service.getWorkspace('hidden-roi-calculator')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.calculator.findFirst).not.toHaveBeenCalled();
  });

  it('filters active assessments to in-progress sessions that have not expired', async () => {
    prisma.assessment.findMany.mockResolvedValue([]);
    prisma.assessment.count.mockResolvedValue(0);

    await service.getAssessments({ scope: 'active', page: 1, limit: 20 });

    const where = prisma.assessment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      status: 'IN_PROGRESS',
      OR: expect.arrayContaining([
        { expiresAt: null },
        { expiresAt: { gte: expect.any(Date) } },
      ]),
    });
  });

  it('labels elapsed in-progress sessions as expired without calling them abandoned', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    prisma.assessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        status: 'IN_PROGRESS',
        expiresAt: expiredAt,
      },
    ]);
    prisma.assessment.count.mockResolvedValue(1);

    const result = await service.getAssessments({
      scope: 'expired',
      page: 1,
      limit: 20,
    });

    expect(result.items[0].lifecycleStatus).toBe('EXPIRED');
    expect(result.items[0].status).toBe('IN_PROGRESS');
  });

  it('returns the assessment-bound version definitions and saved result for detail', async () => {
    const assessment = {
      id: 'assessment-1',
      status: 'COMPLETED',
      expiresAt: null,
      calculatorVersion: {
        versionNumber: 3,
        questions: [{ id: 'question-1', title: 'Historical wording' }],
      },
      answers: [{ questionId: 'question-1', textValue: 'Saved answer' }],
      result: { overallScore: 80 },
      recommendations: [],
    };
    prisma.assessment.findFirst.mockResolvedValue(assessment);

    const result = await service.getAssessmentDetail('assessment-1');

    expect(prisma.assessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'assessment-1', deletedAt: null } }),
    );
    expect(result.calculatorVersion.questions).toEqual(assessment.calculatorVersion.questions);
    expect(result.answers).toEqual(assessment.answers);
    expect(result.result).toEqual(assessment.result);
  });
});
