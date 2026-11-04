import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';

export class PublicOptionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  id: string;

  @ApiProperty({ example: 'Within the last 12 months' })
  label: string;

  @ApiProperty({ example: '12_months' })
  value: string;

  @ApiProperty({ example: 0 })
  orderIndex: number;

  @ApiPropertyOptional({ example: { tooltip: 'Annual compliance review' } })
  metadata?: any;
}

export class PublicQuestionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'HC_COMP_01' })
  code: string;

  @ApiProperty({ example: 'How recently has your organization audited employee handbooks?' })
  title: string;

  @ApiPropertyOptional({ example: 'Include contractor agreements and state notices.' })
  helpText?: string | null;

  @ApiProperty({ enum: QuestionType, example: QuestionType.SINGLE_CHOICE })
  type: QuestionType;

  @ApiProperty({ example: 0 })
  orderIndex: number;

  @ApiProperty({ example: true })
  isRequired: boolean;

  @ApiPropertyOptional({ example: 'COMPLIANCE' })
  categoryCode?: string | null;

  @ApiPropertyOptional({ example: 'Regulatory Compliance' })
  categoryName?: string | null;

  @ApiPropertyOptional({
    description: 'Conditional display rules determining dynamic question visibility',
  })
  displayConditions?: any;

  @ApiProperty({ type: [PublicOptionDto] })
  options: PublicOptionDto[];
}

export class PublicCategoryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002' })
  id: string;

  @ApiProperty({ example: 'COMPLIANCE' })
  code: string;

  @ApiProperty({ example: 'Regulatory & Employment Compliance' })
  name: string;
}

export class CalculatorConfigResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003' })
  id: string;

  @ApiProperty({ example: 'hr-health-check' })
  slug: string;

  @ApiProperty({ example: 'GoSwiftHR Workforce Health & Maturity Index' })
  name: string;

  @ApiPropertyOptional({ example: 'Comprehensive diagnostic assessing organizational readiness.' })
  description?: string | null;

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ example: '2026-11-03T13:32:26.000Z' })
  publishedAt?: Date | null;

  @ApiProperty({ type: [PublicCategoryDto] })
  categories: PublicCategoryDto[];

  @ApiProperty({ type: [PublicQuestionDto] })
  questions: PublicQuestionDto[];

  @ApiProperty({ example: 4 })
  totalQuestions: number;
}
