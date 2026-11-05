import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsEnum,
  IsUrl,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RecommendationPriority } from '@prisma/client';

export class IntelligenceListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  calculatorSlug?: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;
}

export class CreateCalculatorDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changelog?: string;
}

export class UpdateScoreCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  weight?: number;
}

export class CreateScoringRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  conditionExpression!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplier!: number;

  @IsOptional()
  @IsUUID()
  scoreCategoryId?: string | null;
}

export class UpdateScoringRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  conditionExpression?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplier?: number;

  @IsOptional()
  @IsUUID()
  scoreCategoryId?: string | null;
}

export class CreateRecommendationRuleDto {
  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsUUID()
  scoreCategoryId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  minScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  maxScore?: number | null;

  @IsOptional()
  @IsObject()
  conditionJson?: Record<string, unknown> | null;
}

export class UpdateRecommendationRuleDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  scoreCategoryId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  minScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  maxScore?: number | null;

  @IsOptional()
  @IsObject()
  conditionJson?: Record<string, unknown> | null;
}

export class CreateRecommendationTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  actionPlan!: string;

  @IsEnum(RecommendationPriority)
  priority!: RecommendationPriority;

  @IsOptional()
  @IsUrl({ require_tld: true })
  serviceLink?: string | null;
}

export class UpdateRecommendationTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  actionPlan?: string;

  @IsOptional()
  @IsEnum(RecommendationPriority)
  priority?: RecommendationPriority;

  @IsOptional()
  @IsUrl({ require_tld: true })
  serviceLink?: string | null;
}
