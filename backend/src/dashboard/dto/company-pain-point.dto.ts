import { RecommendationPriority } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const calculators = [
  'payroll-cost-calculator',
  'payroll-compliance-calculator',
  'hr-administrative-cost-calculator',
  'hr-health-check',
];

export class CompanyPainPointDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  code: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  description: string;

  @IsString()
  @MaxLength(5000)
  businessImpact: string;

  @IsString()
  @IsIn(calculators)
  calculatorSlug: string;

  @IsObject()
  detectionRule: Record<string, unknown>;

  @IsString()
  @MaxLength(120)
  category: string;

  @IsEnum(RecommendationPriority)
  priority: RecommendationPriority;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  suggestedSolution?: string | null;

  @IsBoolean()
  isActive: boolean;
}

export class CompanyPainPointListDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(calculators)
  calculatorSlug?: string;
}
