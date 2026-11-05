import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { CalculatorMetricsService } from './calculator-metrics.service';

@Module({
  imports: [PrismaModule, ScoringModule, RecommendationsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, CalculatorMetricsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
