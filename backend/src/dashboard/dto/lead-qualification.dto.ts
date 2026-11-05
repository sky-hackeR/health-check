import { IsEnum } from 'class-validator';
import { LeadQualificationTier } from '@prisma/client';

export class LeadQualificationDto {
  @IsEnum(LeadQualificationTier)
  qualificationTier!: LeadQualificationTier;
}
