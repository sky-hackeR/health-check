import {
  IsDateString,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource, LeadStatus, LeadQualificationTier } from '@prisma/client';

export class LeadsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Search by lead name, email, or company name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by lead status (e.g. NEW, CONTACTED, QUALIFIED)',
  })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({
    description: 'Filter by qualification tier (e.g. HOT, WARM, COLD)',
  })
  @IsOptional()
  @IsEnum(LeadQualificationTier)
  tier?: LeadQualificationTier;

  @ApiPropertyOptional({ description: 'Filter by lead source' })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Filter by associated company ID' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by calculator slug' })
  @IsOptional()
  @IsString()
  calculatorSlug?: string;

  @ApiPropertyOptional({
    description: 'Filter created on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter created on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
