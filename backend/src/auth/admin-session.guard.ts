import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { readAdminSessionCookie } from './admin-session-cookie';
import { AdminSessionResponseDto } from './dto/admin-session-response.dto';
import { AuthService } from './auth.service';

export type AdminAuthenticatedRequest = Request & {
  adminUser?: AdminSessionResponseDto;
};

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const token = readAdminSessionCookie(request);
    if (!token) {
      throw new UnauthorizedException('Administrator session is required.');
    }

    request.adminUser = await this.authService.getSession(token);
    return true;
  }

}
