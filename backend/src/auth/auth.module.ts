import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_CONFIGURATION } from './auth.config';
import type { AuthConfiguration } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminSessionGuard } from './admin-session.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthConfiguration => ({
        rateLimitSecret: config.get<string>('AUTH_RATE_LIMIT_SECRET'),
        sessionTtlSeconds: config.get<string>('ADMIN_SESSION_TTL_SECONDS'),
        frontendUrl:
          config.get<string>('FRONTEND_URL') || 'http://localhost:3000',
        nodeEnv: config.get<string>('NODE_ENV') || 'development',
      }),
    },
    AuthService,
    AdminSessionGuard,
    PermissionsGuard,
  ],
  exports: [AuthService, AdminSessionGuard, PermissionsGuard],
})
export class AuthModule {}
