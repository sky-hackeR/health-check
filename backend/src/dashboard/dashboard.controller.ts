import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';

@ApiTags('Admin - Dashboard & Intelligence')
@Controller('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Retrieve live database-driven administrative dashboard metrics',
    description:
      'Aggregates real-time lead counts, completion rates, conversion rates, trends, status distribution, calculator engagement, recent leads, activities, and integration health from PostgreSQL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Real-time aggregated dashboard metrics',
  })
  async getDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboardMetrics(query);
  }

  @Get('leads')
  @ApiOperation({
    summary: 'List paginated, filtered, and searchable leads',
    description:
      'Returns paginated lead records directly from PostgreSQL with company details, assessment progress, and score metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated lead records',
  })
  async getLeads(@Query() query: LeadsQueryDto) {
    return this.dashboardService.getLeads(query);
  }
}
