import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CalculatorSettingsDto {
  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
