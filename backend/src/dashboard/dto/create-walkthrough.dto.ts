import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWalkthroughDto {
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
