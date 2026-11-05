import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { LeadStatus, Prisma } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly productCalculatorSlugs = [
    'payroll-cost-calculator',
    'payroll-compliance-calculator',
    'hr-administrative-cost-calculator',
    'hr-health-check',
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves aggregated business analytics directly from PostgreSQL.
   * Never returns mock or hardcoded data.
   */
  async getDashboardMetrics(query: DashboardQueryDto) {
    const dateFilter = this.resolveDateRange(
      query.timeframe,
      query.from,
      query.to,
    );

    // 1. Concurrent counts using Prisma aggregation
    const [
      totalLeads,
      newLeads,
      qualifiedLeads,
      completedAssessments,
      abandonedAssessments,
      inProgressAssessments,
      totalAssessments,
      walkthroughRequests,
      statusCounts,
      recentLeadsRaw,
      recentActivitiesRaw,
      pendingWalkthroughsRaw,
      calculatorsRaw,
      completedPerVersionRaw,
      dbLatency,
    ] = await Promise.all([
      // Total leads within timeframe
      this.prisma.lead.count({
        where: {
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // New status leads
      this.prisma.lead.count({
        where: {
          status: LeadStatus.NEW,
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Qualified leads
      this.prisma.lead.count({
        where: {
          status: LeadStatus.QUALIFIED,
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Completed assessments
      this.prisma.assessment.count({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Abandoned assessments
      this.prisma.assessment.count({
        where: {
          status: 'ABANDONED',
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      this.prisma.assessment.count({
        where: {
          status: 'IN_PROGRESS',
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Total assessments started
      this.prisma.assessment.count({
        where: {
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Walkthrough consultations
      this.prisma.walkthroughRequest.count({
        where: dateFilter ? { createdAt: dateFilter } : {},
      }),

      // Lead status breakdown
      this.prisma.lead.groupBy({
        by: ['status'],
        _count: { id: true },
        where: {
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Recent leads (up to 5)
      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          company: true,
          assignedAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assessments: {
            where: { deletedAt: null },
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              result: true,
              calculatorVersion: {
                include: { calculator: true },
              },
            },
          },
          followUps: {
            where: { status: { in: ['PENDING', 'RESCHEDULED'] } },
            orderBy: { dueAt: 'asc' },
            take: 1,
            select: { dueAt: true },
          },
        },
      }),

      // Recent activities (up to 6)
      this.prisma.leadActivity.findMany({
        where: dateFilter ? { createdAt: dateFilter } : {},
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),

      // Follow-up queue: pending walkthroughs
      this.prisma.walkthroughRequest.findMany({
        where: {
          status: 'PENDING',
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            include: { company: true },
          },
        },
      }),

      // Active calculators
      this.prisma.calculator.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          slug: { in: this.productCalculatorSlugs },
        },
        include: {
          versions: {
            where: { isPublished: true },
            select: { id: true, versionNumber: true },
          },
        },
      }),

      // Completed assessments grouped by calculatorVersionId
      this.prisma.assessment.groupBy({
        by: ['calculatorVersionId'],
        _count: { id: true },
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),

      // Live database latency probe
      this.checkDatabaseLatency(),
    ]);

    // 2. Exact rate calculations with documented formulas
    const completionRate =
      totalAssessments > 0
        ? Number(((completedAssessments / totalAssessments) * 100).toFixed(1))
        : 0;

    // Conversion rate denominator: Qualified Leads / Total Captured Leads
    const leadConversionRate =
      totalLeads > 0
        ? Number(((qualifiedLeads / totalLeads) * 100).toFixed(1))
        : 0;

    const abandonmentRate =
      totalAssessments > 0
        ? Number(((abandonedAssessments / totalAssessments) * 100).toFixed(1))
        : 0;

    // 3. Calculator engagement mapping
    const versionCountMap = new Map<string, number>();
    for (const row of completedPerVersionRaw) {
      versionCountMap.set(row.calculatorVersionId, row._count.id);
    }

    const calculatorEngagement = calculatorsRaw.map((calc) => {
      let count = 0;
      for (const ver of calc.versions) {
        count += versionCountMap.get(ver.id) || 0;
      }
      const percentage =
        completedAssessments > 0
          ? Number(((count / completedAssessments) * 100).toFixed(1))
          : 0;
      return {
        id: calc.id,
        slug: calc.slug,
        name: calc.name,
        completions: count,
        percentage,
      };
    });

    // 4. Status distribution object
    const statusDistribution: Record<string, number> = {
      NEW: 0,
      CONTACTED: 0,
      QUALIFIED: 0,
      UNQUALIFIED: 0,
      CONVERTED: 0,
    };
    for (const item of statusCounts) {
      statusDistribution[item.status] = item._count.id;
    }

    // 5. Geographic distribution (querying Company/Lead country or GeoLocation)
    const geoCountsRaw = await this.prisma.company.groupBy({
      by: ['country'],
      _count: { id: true },
      where: {
        deletedAt: null,
        country: { not: null },
      },
      take: 5,
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const totalGeoCompanies = geoCountsRaw.reduce(
      (acc, curr) => acc + curr._count.id,
      0,
    );
    const geographicDistribution = geoCountsRaw.map((geo) => ({
      region: geo.country || 'Unknown',
      count: geo._count.id,
      percentage:
        totalGeoCompanies > 0
          ? Number(((geo._count.id / totalGeoCompanies) * 100).toFixed(1))
          : 0,
    }));

    // 6. Recent monthly acquisition trend (actual time-series)
    const acquisitionTrend = await this.calculateMonthlyTrend();

    // 7. Format recent leads cleanly
    const recentLeads = recentLeadsRaw.map((lead) => {
      const latestAssessment = lead.assessments[0];
      return {
        id: lead.id,
        name:
          [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
          lead.email,
        email: lead.email,
        company: lead.company?.name || 'Independent',
        calculator:
          latestAssessment?.calculatorVersion?.calculator?.name ||
          'Direct Lead',
        score:
          latestAssessment?.result?.overallScore == null
            ? null
            : Math.round(latestAssessment.result.overallScore),
        tier: lead.qualificationTier,
        status: lead.status,
        source: lead.source,
        hasOverdueFollowUp: Boolean(
          lead.followUps[0] && lead.followUps[0].dueAt < new Date(),
        ),
        assignedAdmin: lead.assignedAdmin,
        date: lead.createdAt.toISOString(),
      };
    });

    // 8. Format follow-ups
    const followUps = pendingWalkthroughsRaw.map((req) => ({
      id: req.id,
      leadId: req.leadId,
      name:
        [req.lead.firstName, req.lead.lastName].filter(Boolean).join(' ') ||
        req.lead.email,
      company: req.lead.company?.name || 'Independent',
      note: req.notes || 'Consultation walkthrough requested via portal',
      timeDue: req.preferredDate
        ? req.preferredDate.toISOString()
        : req.createdAt.toISOString(),
      status: req.status,
    }));

    // Integration logs alone do not verify that a third-party connection works.
    const integrationStatus = {
      database: {
        status: dbLatency >= 0 ? 'CONNECTED' : 'DISCONNECTED',
        latencyMs: dbLatency >= 0 ? dbLatency : null,
      },
      hubspot: { status: 'NOT_IMPLEMENTED', lastSync: null },
      sendgrid: { status: 'NOT_IMPLEMENTED', lastSync: null },
      webhook: { status: 'NOT_IMPLEMENTED', lastSync: null },
    };

    return {
      metrics: {
        totalLeads,
        newLeads,
        qualifiedLeads,
        completedAssessments,
        abandonedAssessments,
        inProgressAssessments,
        totalAssessments,
        walkthroughRequests,
        completionRate,
        leadConversionRate,
        abandonmentRate,
        conversionRateDescription:
          'Qualified leads divided by total captured leads (0% when no leads exist)',
      },
      acquisitionTrend,
      calculatorEngagement,
      statusDistribution,
      geographicDistribution,
      recentLeads,
      recentActivities: recentActivitiesRaw.map((act) => ({
        id: act.id,
        leadId: act.leadId,
        userName:
          [act.lead.firstName, act.lead.lastName].filter(Boolean).join(' ') ||
          act.lead.email,
        type: act.type,
        description: act.description,
        createdAt: act.createdAt.toISOString(),
      })),
      followUps,
      integrationStatus,
      timeframe: query.timeframe || 'last_30_days',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves paginated, searchable, and filtered leads.
   */
  async getLeads(query: LeadsQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      tier,
      source,
      companyId,
      calculatorSlug,
      from,
      to,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
    };

    if (status) where.status = status;
    if (tier) where.qualificationTier = tier;
    if (source) where.source = source;
    if (companyId) where.companyId = companyId;
    if (calculatorSlug) {
      where.assessments = {
        some: {
          deletedAt: null,
          calculatorVersion: {
            calculator: { slug: calculatorSlug },
          },
        },
      };
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: true,
          assignedAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assessments: {
            where: { deletedAt: null },
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              result: true,
              calculatorVersion: {
                include: { calculator: true },
              },
            },
          },
          followUps: {
            where: { status: { in: ['PENDING', 'RESCHEDULED'] } },
            orderBy: { dueAt: 'asc' },
            take: 1,
            select: { dueAt: true },
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items: items.map((lead) => ({
        id: lead.id,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        jobTitle: lead.jobTitle,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        hasOverdueFollowUp: Boolean(
          lead.followUps[0] && lead.followUps[0].dueAt < new Date(),
        ),
        qualificationTier: lead.qualificationTier,
        assignedAdmin: lead.assignedAdmin,
        company: lead.company
          ? { id: lead.company.id, name: lead.company.name }
          : null,
        latestAssessment: lead.assessments[0]
          ? {
              id: lead.assessments[0].id,
              calculator:
                lead.assessments[0].calculatorVersion?.calculator?.name,
              score: lead.assessments[0].result?.overallScore ?? null,
              completedAt: lead.assessments[0].completedAt,
            }
          : null,
        createdAt: lead.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Probes real PostgreSQL connection round-trip latency.
   */
  private async checkDatabaseLatency(): Promise<number> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return Date.now() - start;
    } catch (e) {
      this.logger.error(`Database health probe error: ${(e as Error).message}`);
      return -1;
    }
  }

  /**
   * Generates genuine monthly buckets for time-series charts.
   */
  private async calculateMonthlyTrend() {
    const months: { label: string; start: Date; end: Date }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = d.toLocaleString('en-US', {
        month: 'short',
        year: 'numeric',
      });
      months.push({ label, start: d, end });
    }

    const results = await Promise.all(
      months.map(async (m) => {
        const [assessments, qualifiedLeads] = await Promise.all([
          this.prisma.assessment.count({
            where: {
              createdAt: { gte: m.start, lte: m.end },
              deletedAt: null,
            },
          }),
          this.prisma.lead.count({
            where: {
              status: LeadStatus.QUALIFIED,
              createdAt: { gte: m.start, lte: m.end },
              deletedAt: null,
            },
          }),
        ]);
        return {
          month: m.label,
          assessments,
          qualifiedLeads,
        };
      }),
    );

    return results;
  }

  /**
   * Normalizes timeframe string into a Prisma date range.
   */
  private resolveDateRange(timeframe?: string, from?: string, to?: string) {
    if (from || to) {
      const range: { gte?: Date; lte?: Date } = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      return range;
    }

    const now = new Date();
    switch (timeframe) {
      case 'today':
        return {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        };
      case 'last_7_days': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return { gte: d };
      }
      case 'last_30_days': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return { gte: d };
      }
      case 'this_quarter': {
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        return { gte: new Date(now.getFullYear(), quarterMonth, 1) };
      }
      case 'year_to_date':
        return { gte: new Date(now.getFullYear(), 0, 1) };
      case 'all_time':
      default:
        return undefined;
    }
  }
}
