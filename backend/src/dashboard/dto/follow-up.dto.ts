import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FollowUpMethod, FollowUpStatus } from '@prisma/client';

export class CreateFollowUpDto {
  @IsDateString()
  dueAt!: string;

  @IsEnum(FollowUpMethod)
  method!: FollowUpMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  notes!: string;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string | null;
}
