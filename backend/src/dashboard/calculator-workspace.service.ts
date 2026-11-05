import { Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsQueryDto } from './dto/assessments-query.dto';
import { CalculatorSubmissionsQueryDto } from './dto/calculator-submissions-query.dto';

const publicProductSlugs = new Set([
  'payroll-cost-calculator',
  'payroll-compliance-calculator',
  'hr-administrative-cost-calculator',
  'hr-health-check',
]);

@Injectable()
export class CalculatorWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(slug: string) {
    const calculator = await this.findPublicProduct(slug);
    const [starts, completed, leads, abandoned] = await Promise.all([
      this.prisma.assessment.count({
        where: { calculatorVersion: { calculatorId: calculator.id } },
      }),
      this.prisma.assessment.count({
        where: {
          calculatorVersion: { calculatorId: calculator.id },
          status: AssessmentStatus.COMPLETED,
        },
      }),
      this.prisma.assessment.count({
        where: {
          calculatorVersion: { calculatorId: calculator.id },
          status: AssessmentStatus.COMPLETED,
          leadId: { not: null },
        },
      }),
      this.prisma.assessment.count({
        where: {
          calculatorVersion: { calculatorId: calculator.id },
          status: AssessmentStatus.ABANDONED,
        },
      }),
    ]);

    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const trend = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        starts: bigint;
        completions: bigint;
        leadCaptures: bigint;
      }>
    >(Prisma.sql`
      SELECT date_trunc('day', a."createdAt") AS day,
        COUNT(*) AS starts,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completions,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED' AND a."leadId" IS NOT NULL) AS "leadCaptures"
      FROM "assessments" a
      INNER JOIN "calculator_versions" cv ON cv.id = a."calculatorVersionId"
      WHERE cv."calculatorId" = ${calculator.id} AND a."createdAt" >= ${start}
      GROUP BY date_trunc('day', a."createdAt")
      ORDER BY day
    `);

    const versions = await this.prisma.calculatorVersion.findMany({
      where: { calculatorId: calculator.id, isPublished: true },
      orderBy: { versionNumber: 'desc' },
      take: 1,
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { options: { orderBy: { orderIndex: 'asc' } } },
        },
        scoreCategories: { orderBy: { code: 'asc' } },
      },
    });

    return {
      calculator: {
        id: calculator.id,
        slug: calculator.slug,
        name: calculator.name,
        description: calculator.description,
        isActive: calculator.isActive,
      },
      publishedVersion: versions[0] ?? null,
      metrics: {
        totalVisits: null,
        visitsAvailability: 'NOT_TRACKED',
        assessmentStarts: starts,
        completions: completed,
        capturedLeads: leads,
        abandonedAssessments: abandoned,
        completionRate: starts ? completed / starts : null,
        leadCaptureRate: completed ? leads / completed : null,
      },
      trend: trend.map((row) => ({
        date: row.day.toISOString(),
        starts: Number(row.starts),
        completions: Number(row.completions),
        capturedLeads: Number(row.leadCaptures),
      })),
    };
  }

  async getSubmissions(slug: string, query: CalculatorSubmissionsQueryDto) {
    const calculator = await this.findPublicProduct(slug);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: Prisma.AssessmentWhereInput = {
      deletedAt: null,
      calculatorVersion: { calculatorId: calculator.id },
    };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { lead: { email: { contains: query.search, mode: 'insensitive' } } },
        {
          lead: { firstName: { contains: query.search, mode: 'insensitive' } },
        },
        { lead: { lastName: { contains: query.search, mode: 'insensitive' } } },
        {
          lead: {
            company: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          calculatorVersion: { select: { versionNumber: true } },
          lead: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              company: { select: { id: true, name: true } },
            },
          },
          answers: {
            orderBy: { question: { orderIndex: 'asc' } },
            select: {
              textValue: true,
              numericValue: true,
              rawInput: true,
              question: { select: { code: true, title: true } },
              selectedOption: { select: { label: true } },
            },
          },
          result: {
            select: {
              overallScore: true,
              normalizedIndex: true,
              maturityLevel: true,
              calculatedMetrics: true,
              categoryScores: true,
            },
          },
          recommendations: {
            select: { title: true, summary: true, priority: true },
          },
        },
      }),
      this.prisma.assessment.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAssessments(query: AssessmentsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const now = new Date();
    const where: Prisma.AssessmentWhereInput = { deletedAt: null };
    if (query.scope === 'active') {
      where.status = AssessmentStatus.IN_PROGRESS;
      where.OR = [{ expiresAt: null }, { expiresAt: { gte: now } }];
    } else if (query.scope === 'expired') {
      where.status = AssessmentStatus.IN_PROGRESS;
      where.expiresAt = { lt: now };
    } else if (query.scope === 'completed') {
      where.status = AssessmentStatus.COMPLETED;
    } else if (query.scope === 'abandoned') {
      where.status = AssessmentStatus.ABANDONED;
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        ...(where.OR ? [{ OR: where.OR }] : []),
        {
          OR: [
            { id: { contains: search } },
            { lead: { email: { contains: search, mode: 'insensitive' } } },
            { lead: { firstName: { contains: search, mode: 'insensitive' } } },
            { lead: { lastName: { contains: search, mode: 'insensitive' } } },
            {
              lead: {
                company: { name: { contains: search, mode: 'insensitive' } },
              },
            },
            {
              calculatorVersion: {
                calculator: { name: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        },
      ];
      delete where.OR;
    }
    const [records, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          _count: { select: { answers: true } },
          calculatorVersion: {
            select: {
              versionNumber: true,
              calculator: { select: { id: true, slug: true, name: true } },
            },
          },
          lead: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              company: { select: { id: true, name: true } },
            },
          },
          result: {
            select: {
              overallScore: true,
              normalizedIndex: true,
              maturityLevel: true,
            },
          },
        },
      }),
      this.prisma.assessment.count({ where }),
    ]);
    return {
      items: records.map((record) => ({
        ...record,
        lifecycleStatus:
          record.status === AssessmentStatus.IN_PROGRESS &&
          record.expiresAt !== null &&
          record.expiresAt < now
            ? 'EXPIRED'
            : record.status,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAssessmentDetail(id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        calculatorVersion: {
          select: {
            versionNumber: true,
            calculator: { select: { id: true, slug: true, name: true } },
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: {
                scoreCategory: { select: { code: true, name: true } },
                options: { orderBy: { orderIndex: 'asc' } },
              },
            },
          },
        },
        lead: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            company: { select: { id: true, name: true } },
          },
        },
        answers: {
          orderBy: { question: { orderIndex: 'asc' } },
          include: {
            question: { include: { options: { orderBy: { orderIndex: 'asc' } } } },
            selectedOption: true,
          },
        },
        result: true,
        recommendations: {
          orderBy: { createdAt: 'asc' },
          select: {
            title: true,
            summary: true,
            actionPlan: true,
            priority: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment was not found.');
    const now = new Date();
    return {
      ...assessment,
      lifecycleStatus:
        assessment.status === AssessmentStatus.IN_PROGRESS &&
        assessment.expiresAt !== null &&
        assessment.expiresAt < now
          ? 'EXPIRED'
          : assessment.status,
    };
  }

  private async findPublicProduct(slug: string) {
    if (!publicProductSlugs.has(slug)) {
      throw new NotFoundException('Supported calculator was not found.');
    }
    const calculator = await this.prisma.calculator.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        isActive: true,
      },
    });
    if (!calculator)
      throw new NotFoundException('Supported calculator was not found.');
    return calculator;
  }
}
