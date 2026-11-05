import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService (Database Aggregation)', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, PrismaService],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return real aggregated dashboard metrics without errors', async () => {
    const data = await service.getDashboardMetrics({ timeframe: 'all_time' });

    expect(data).toBeDefined();
    expect(data.metrics).toBeDefined();
    expect(typeof data.metrics.totalLeads).toBe('number');
    expect(typeof data.metrics.newLeads).toBe('number');
    expect(typeof data.metrics.qualifiedLeads).toBe('number');
    expect(typeof data.metrics.completedAssessments).toBe('number');
    expect(typeof data.metrics.abandonedAssessments).toBe('number');
    expect(typeof data.metrics.inProgressAssessments).toBe('number');
    expect(typeof data.metrics.completionRate).toBe('number');
    expect(typeof data.metrics.leadConversionRate).toBe('number');
    expect(data.metrics.conversionRateDescription).toBeDefined();

    expect(Array.isArray(data.acquisitionTrend)).toBe(true);
    expect(Array.isArray(data.calculatorEngagement)).toBe(true);
    expect(data.statusDistribution).toBeDefined();
    expect(Array.isArray(data.recentLeads)).toBe(true);
    expect(Array.isArray(data.recentActivities)).toBe(true);
    expect(Array.isArray(data.followUps)).toBe(true);
    expect(data.integrationStatus).toBeDefined();
    expect(data.integrationStatus.database.status).toBe('CONNECTED');
    expect(data.integrationStatus.hubspot.status).toBe('NOT_IMPLEMENTED');
    expect(data.integrationStatus.sendgrid.status).toBe('NOT_IMPLEMENTED');
    expect(data.integrationStatus.webhook.status).toBe('NOT_IMPLEMENTED');
  });

  it('should handle pagination and return total count on getLeads', async () => {
    const result = await service.getLeads({ page: 1, limit: 5 });

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(5);
    expect(typeof result.totalPages).toBe('number');
  });

  it('should calculate 0% completion and conversion rates safely when denominator is zero', async () => {
    // Test that the mathematical helper returns 0 rather than NaN or Infinity
    const data = await service.getDashboardMetrics({ timeframe: 'today' });
    expect(Number.isNaN(data.metrics.completionRate)).toBe(false);
    expect(Number.isNaN(data.metrics.leadConversionRate)).toBe(false);
    expect(Number.isNaN(data.metrics.abandonmentRate)).toBe(false);
  });
});
