import {
  Controller,
  Body,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AUTH_CONFIGURATION } from './auth.config';
import type { AuthConfiguration } from './auth.config';
import { AdminSessionResponseDto } from './dto/admin-session-response.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { getAllowedOrigins } from './auth-origin';
import {
  ADMIN_SESSION_COOKIE_NAME,
  readAdminSessionCookie,
} from './admin-session-cookie';

const SESSION_COOKIE_PATH = '/api/v1';

@ApiTags('Admin Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIGURATION) private readonly config: AuthConfiguration,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate an administrator',
    description:
      'Creates an opaque server-side session and sets it in an HttpOnly cookie.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminSessionResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid email or password',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Login temporarily blocked',
  })
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: LoginDto,
  ): Promise<AdminSessionResponseDto> {
    this.assertAllowedOrigin(request);
    const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
    const session = await this.authService.login(
      body.email,
      body.password,
      clientIp,
    );

    response.cookie(ADMIN_SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'lax',
      path: SESSION_COOKIE_PATH,
      expires: session.expiresAt,
    });
    return session.admin;
  }

  @Get('session')
  @ApiCookieAuth('admin-session')
  @ApiOperation({ summary: 'Verify the current administrator session' })
  @ApiResponse({ status: HttpStatus.OK, type: AdminSessionResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Session is missing or invalid',
  })
  async getSession(@Req() request: Request): Promise<AdminSessionResponseDto> {
    return this.authService.getSession(readAdminSessionCookie(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('admin-session')
  @ApiOperation({ summary: 'Revoke the current administrator session' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Session revoked and cookie cleared',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertAllowedOrigin(request);
    await this.authService.logout(readAdminSessionCookie(request));
    response.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'lax',
      path: SESSION_COOKIE_PATH,
    });
  }

  private assertAllowedOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (
      !origin ||
      !getAllowedOrigins(this.config.frontendUrl, this.config.nodeEnv).has(
        origin,
      )
    ) {
      throw new ForbiddenException('Request origin is not allowed.');
    }
  }
}
