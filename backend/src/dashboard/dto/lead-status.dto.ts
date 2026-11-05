import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LeadStatus } from '@prisma/client';

export class LeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ValidateIf((dto: LeadStatusDto) => dto.status === LeadStatus.CONVERTED)
  @IsDateString()
  occurredAt?: string;
}
