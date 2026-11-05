import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CalculatorQuestionOptionDto {
  @IsString()
  @MaxLength(500)
  label: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  @MaxLength(120)
  value: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  scoreValue?: number;
}

export class CalculatorQuestionDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  code: string;

  @IsString()
  @MaxLength(2000)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  helpText?: string | null;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  weight?: number;

  @IsBoolean()
  isRequired: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  calculationKey?: string | null;

  @IsOptional()
  @IsObject()
  validationRules?: Record<string, unknown> | null;

  @IsOptional()
  defaultValue?: unknown;

  @IsOptional()
  displayConditions?: unknown;

  @IsOptional()
  @IsString()
  scoreCategoryId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculatorQuestionOptionDto)
  options: CalculatorQuestionOptionDto[];
}

export class ReorderCalculatorQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  questionIds: string[];
}
