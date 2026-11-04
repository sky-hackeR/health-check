import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartAssessmentDto {
  @ApiProperty({
    description: 'Unique slug identifying the calculator',
    example: 'hr-health-check',
  })
  @IsString()
  @IsNotEmpty()
  calculatorSlug: string;

  @ApiPropertyOptional({
    description: 'Optional campaign identifier for marketing attribution',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    description: 'UTM source parameter',
    example: 'linkedin',
  })
  @IsOptional()
  @IsString()
  utmSource?: string;

  @ApiPropertyOptional({
    description: 'UTM medium parameter',
    example: 'cpc',
  })
  @IsOptional()
  @IsString()
  utmMedium?: string;

  @ApiPropertyOptional({
    description: 'UTM campaign parameter',
    example: 'q4_enterprise_hr',
  })
  @IsOptional()
  @IsString()
  utmCampaign?: string;
}
