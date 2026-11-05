import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WalkthroughStatus } from '@prisma/client';

export class UpdateWalkthroughDto {
  @IsEnum(WalkthroughStatus)
  status!: WalkthroughStatus;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outcome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
