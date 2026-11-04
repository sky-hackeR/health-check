import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'System health check' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and responding',
    schema: {
      example: {
        status: 'ok',
        service: 'goswifthr-intelligence-api',
        version: '1.0.0',
        timestamp: '2026-11-03T13:00:00.000Z',
        uptimeSeconds: 42.5,
      },
    },
  })
  check() {
    return {
      status: 'ok',
      service: 'goswifthr-intelligence-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    };
  }
}
