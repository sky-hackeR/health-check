import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DashboardController } from '../dashboard/dashboard.controller';
import { AdminSessionGuard } from './admin-session.guard';
import { PermissionsGuard } from './permissions.guard';
import { REQUIRED_PERMISSIONS } from './permissions.decorator';
import { AuthService } from './auth.service';

function createContext(cookie?: string): ExecutionContext {
  const request = {
    headers: cookie ? { cookie } : {},
    adminUser: undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'controller',
  } as unknown as ExecutionContext;
}

describe('administrator guards', () => {
  it('rejects requests without an administrator session cookie', async () => {
    const authService = { getSession: jest.fn() };
    const guard = new AdminSessionGuard(authService as unknown as AuthService);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authService.getSession).not.toHaveBeenCalled();
  });

  it('authenticates a cookie session and attaches the administrator identity', async () => {
    const identity = {
      id: 'admin-1',
      email: 'admin@example.com',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ANALYST',
      permissions: ['leads:read'],
    };
    const authService = { getSession: jest.fn().mockResolvedValue(identity) };
    const guard = new AdminSessionGuard(authService as unknown as AuthService);
    const context = createContext('other=value; goswifthr_admin_session=opaque');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.getSession).toHaveBeenCalledWith('opaque');
    expect(
      context.switchToHttp().getRequest<{ adminUser?: typeof identity }>()
        .adminUser,
    ).toEqual(identity);
  });

  it('rejects a valid session that lacks a required permission', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['leads:write']);
    const guard = new PermissionsGuard(reflector);
    const context = createContext();
    context.switchToHttp().getRequest<{
      adminUser: { permissions: string[] };
    }>().adminUser = { permissions: ['leads:read'] };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an administrator with every required permission', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      'leads:read',
      'assessments:read',
      'calculators:read',
    ]);
    const guard = new PermissionsGuard(reflector);
    const context = createContext();
    context.switchToHttp().getRequest<{
      adminUser: { permissions: string[] };
    }>().adminUser = {
      permissions: ['leads:read', 'assessments:read', 'calculators:read'],
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('protects dashboard endpoints with their explicit read permissions', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.getLeads,
      ),
    ).toEqual(['leads:read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.getDashboard,
      ),
    ).toEqual(['leads:read', 'assessments:read', 'calculators:read']);
    expect(Reflect.getMetadata(GUARDS_METADATA, DashboardController)).toEqual([
      AdminSessionGuard,
      PermissionsGuard,
    ]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.getLeadDetail,
      ),
    ).toEqual(['leads:read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.transitionLead,
      ),
    ).toEqual(['leads:write']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.getCalculatorWorkspace,
      ),
    ).toEqual(['calculators:read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        DashboardController.prototype.getCalculatorSubmissions,
      ),
    ).toEqual(['calculators:read', 'assessments:read']);
  });
});
