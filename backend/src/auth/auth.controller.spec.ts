import { ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AUTH_CONFIGURATION } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    getSession: jest.Mock;
    logout: jest.Mock;
  };
  let response: {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue({
        token: 'private-session-token',
        expiresAt: new Date(Date.now() + 60_000),
        admin: { id: 'admin-1', permissions: ['leads:read'] },
      }),
      getSession: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    const config = {
      rateLimitSecret: 'unused-in-controller-tests',
      sessionTtlSeconds: '28800',
      nodeEnv: 'production',
      frontendUrl: 'https://app.example.com',
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      config,
    );
  });

  it('sets only a secure, HttpOnly, SameSite=Lax API-path cookie and returns no token', async () => {
    const request = {
      headers: { origin: 'https://app.example.com' },
      ip: '192.0.2.10',
      socket: { remoteAddress: '192.0.2.10' },
    } as Request;

    const result = await controller.login(
      request,
      response as unknown as Response,
      { email: 'admin@example.com', password: 'a sufficiently long password' },
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'goswifthr_admin_session',
      'private-session-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('private-session-token');
  });

  it('rejects login and logout requests from an untrusted or missing Origin', async () => {
    const badRequest = {
      headers: { origin: 'https://attacker.example' },
      ip: '192.0.2.10',
      socket: { remoteAddress: '192.0.2.10' },
    } as Request;

    await expect(
      controller.login(badRequest, response as unknown as Response, {
        email: 'admin@example.com',
        password: 'password',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.logout(
        {
          headers: {},
          ip: '192.0.2.10',
          socket: { remoteAddress: '192.0.2.10' },
        } as Request,
        response as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(authService.login).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('verifies a session using the cookie without requiring administrator guards on public APIs', async () => {
    const request = {
      headers: { cookie: 'other=value; goswifthr_admin_session=opaque-value' },
    } as Request;

    await controller.getSession(request);

    expect(authService.getSession).toHaveBeenCalledWith('opaque-value');
  });

  it('revokes a session and clears the cookie with matching path/security attributes', async () => {
    const request = {
      headers: {
        origin: 'https://app.example.com',
        cookie: 'goswifthr_admin_session=opaque-value',
      },
    } as Request;

    await controller.logout(request, response as unknown as Response);

    expect(authService.logout).toHaveBeenCalledWith('opaque-value');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'goswifthr_admin_session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1',
      }),
    );
  });
});
