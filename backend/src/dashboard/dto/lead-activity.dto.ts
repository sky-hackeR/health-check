import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum AdminLeadActivityType {
  NOTE_ADDED = 'NOTE_ADDED',
  CALL_RECORDED = 'CALL_RECORDED',
  EMAIL_RECORDED = 'EMAIL_RECORDED',
  MEETING_RECORDED = 'MEETING_RECORDED',
}

export class CreateLeadActivityDto {
  @IsEnum(AdminLeadActivityType)
  type!: AdminLeadActivityType;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
