import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ColdEmailTemplateStatus } from '@prisma/client';

export class ColdEmailTemplateDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(998)
  subject: string;

  @IsString()
  @MaxLength(30000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string | null;

  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  applicablePainPointCategories: string[];
}

export class UpdateColdEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(998)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  applicablePainPointCategories?: string[];
}

export class ColdEmailTemplateListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ColdEmailTemplateStatus)
  status?: ColdEmailTemplateStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ColdEmailPreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderCompany?: string;
}
