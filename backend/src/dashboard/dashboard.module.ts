import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { LeadWorkflowService } from './lead-workflow.service';
import { CalculatorWorkspaceService } from './calculator-workspace.service';
import { IntelligenceAdminService } from './intelligence-admin.service';
import { CalculatorConfigurationService } from './calculator-configuration.service';
import { ScoringModule } from '../scoring/scoring.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { CalculatorMetricsService } from '../assessments/calculator-metrics.service';

@Module({
  imports: [AuthModule, ScoringModule, RecommendationsModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    LeadWorkflowService,
    CalculatorWorkspaceService,
    IntelligenceAdminService,
    CalculatorConfigurationService,
    CalculatorMetricsService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
