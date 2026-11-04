import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SingleAnswerDto {
  @ApiProperty({
    description: 'Unique identifier of the question being answered',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @ApiPropertyOptional({
    description: 'UUID of the selected QuestionOption (for SINGLE_CHOICE or BOOLEAN)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional({
    description: 'Numeric value response (for NUMERIC_INPUT or SLIDER)',
    example: 45.5,
  })
  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @ApiPropertyOptional({
    description: 'Text string value response',
    example: 'More than 50 employees',
  })
  @IsOptional()
  @IsString()
  textValue?: string;

  @ApiPropertyOptional({
    description: 'Raw structured JSON input (for MULTIPLE_CHOICE or compound responses)',
    example: ['opt_1', 'opt_2'],
  })
  @IsOptional()
  rawInput?: any;
}

export class SaveAnswersDto {
  @ApiProperty({
    description: 'List of answers to persist or update idempotently',
    type: [SingleAnswerDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SingleAnswerDto)
  answers: SingleAnswerDto[];
}
