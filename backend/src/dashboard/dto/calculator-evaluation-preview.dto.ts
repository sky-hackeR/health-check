import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CalculatorPreviewAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  numericValue?: number;

  @IsOptional()
  @IsString()
  textValue?: string;
}

/** A read-only, non-persistent calculator simulation. */
export class CalculatorEvaluationPreviewDto {
  @IsUUID()
  versionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculatorPreviewAnswerDto)
  answers!: CalculatorPreviewAnswerDto[];
}
