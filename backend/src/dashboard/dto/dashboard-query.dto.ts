import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Timeframe filter window',
    enum: ['today', 'last_7_days', 'last_30_days', 'this_quarter', 'year_to_date', 'all_time'],
    default: 'last_30_days',
  })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'last_7_days', 'last_30_days', 'this_quarter', 'year_to_date', 'all_time'])
  timeframe?: string = 'last_30_days';

  @ApiPropertyOptional({ description: 'Custom start date (ISO string)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Custom end date (ISO string)' })
  @IsOptional()
  @IsString()
  to?: string;
}
