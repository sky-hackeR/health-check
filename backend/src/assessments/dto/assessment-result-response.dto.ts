import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationPriority, RecommendationStatus } from '@prisma/client';

export class CategoryScoreDetailDto {
  @ApiProperty({ example: 'COMPLIANCE' })
  code: string;

  @ApiProperty({ example: 'Regulatory Compliance' })
  name: string;

  @ApiProperty({ example: 1.2 })
  weight: number;

  @ApiProperty({ example: 85.0 })
  rawScore: number;

  @ApiProperty({ example: 100.0 })
  maxPossibleScore: number;

  @ApiProperty({ example: 85.0 })
  percentage: number;

  @ApiProperty({ example: 'LOW', enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] })
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

  @ApiProperty({ example: 3 })
  answeredCount: number;

  @ApiProperty({ example: 3 })
  visibleCount: number;
}

export class BenchmarkComparisonDto {
  @ApiProperty({ example: 'configured' })
  status: 'configured' | 'unconfigured';

  @ApiPropertyOptional({ example: 'GoSwiftHR 2026 Workforce Health & Readiness Index' })
  source?: string;

  @ApiPropertyOptional({ example: 'SME & Mid-Market (20–500 FTE)' })
  segment?: string;

  @ApiPropertyOptional({ example: 'United Kingdom & North America' })
  geography?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  effectiveDate?: string;

  @ApiPropertyOptional({ example: 64.5 })
  industryAverageIndex?: number;

  @ApiPropertyOptional({ example: 20.5 })
  variance?: number;

  @ApiPropertyOptional({ example: 'No validated historical benchmark segment configured.' })
  message?: string;
}

export class AssessmentResultResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174099' })
  assessmentId: string;

  @ApiProperty({ example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0' })
  sessionToken: string;

  @ApiProperty({ example: 85.0 })
  overallScore: number;

  @ApiProperty({ example: 85.0 })
  normalizedIndex: number;

  @ApiProperty({ example: 'Optimized', enum: ['Foundational', 'Emerging', 'Advancing', 'Optimized'] })
  maturityLevel: string;

  @ApiProperty({ example: 'LOW', enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] })
  riskLevel: string;

  @ApiProperty({
    description: 'Category score breakdown indexed by category code',
    type: Object,
  })
  categoryScores: Record<string, CategoryScoreDetailDto>;

  @ApiProperty({ type: BenchmarkComparisonDto })
  benchmark: BenchmarkComparisonDto;

  @ApiProperty({ example: true })
  isImmutable: boolean;

  @ApiProperty({ example: '2026-11-03T16:30:00.000Z' })
  calculatedAt: Date;
}

export class AssessmentRecommendationItemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174088' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174077' })
  templateId: string;

  @ApiProperty({ example: 'Comprehensive HR & Wage-Hour Compliance Audit' })
  title: string;

  @ApiProperty({ example: 'Your compliance score indicates potential exposure to labor law audits.' })
  summary: string;

  @ApiProperty({ example: 'Engage GoSwiftHR specialists to conduct an end-to-end audit.' })
  actionPlan: string;

  @ApiProperty({ enum: RecommendationPriority, example: RecommendationPriority.CRITICAL })
  priority: RecommendationPriority;

  @ApiProperty({ enum: RecommendationStatus, example: RecommendationStatus.PROPOSED })
  status: RecommendationStatus;

  @ApiPropertyOptional({ example: 'https://goswifthr.com/compliance' })
  serviceLink?: string | null;

  @ApiProperty({ example: '2026-11-03T16:30:00.000Z' })
  createdAt: Date;
}

export class AssessmentFullResultResponseDto {
  @ApiProperty({ type: AssessmentResultResponseDto })
  result: AssessmentResultResponseDto;

  @ApiProperty({ type: [AssessmentRecommendationItemDto] })
  recommendations: AssessmentRecommendationItemDto[];
}
