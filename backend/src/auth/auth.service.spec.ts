import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_CONFIGURATION } from './auth.config';
import { AuthService } from './auth.service';

const SESSION_TOKEN = randomBytes(32).toString('base64url');
const rateLimitSecret = randomBytes(32).toString('base64url');

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function adminRecord(
  passwordHash = hashPassword('a sufficiently long password'),
) {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    isActive: true,
    deletedAt: null,
    passwordHash,
    role: {
      name: 'ADMIN',
      permissions: [{ permission: { slug: 'leads:read' } }],
    },
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    adminUser: { findFirst: jest.Mock; update: jest.Mock };
    adminSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    adminLoginThrottle: { findUnique: jest.Mock; deleteMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let transaction: {
    adminSession: { create: jest.Mock; deleteMany: jest.Mock };
    adminUser: { update: jest.Mock };
    adminLoginThrottle: { deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    transaction = {
      adminSession: {
        create: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      adminUser: { update: jest.fn().mockResolvedValue(undefined) },
      adminLoginThrottle: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      adminUser: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
      },
      adminSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminLoginThrottle: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          failedAttempts: 1,
          windowStartedAt: new Date(),
          blockedUntil: null,
        },
      ]),
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
    };

    const configValues: Record<string, string> = {
      AUTH_RATE_LIMIT_SECRET: rateLimitSecret,
      ADMIN_SESSION_TTL_SECONDS: '28800',
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AUTH_CONFIGURATION,
          useValue: {
            rateLimitSecret: configValues.AUTH_RATE_LIMIT_SECRET,
            sessionTtlSeconds: configValues.ADMIN_SESSION_TTL_SECONDS,
            frontendUrl: 'http://localhost:3000',
            nodeEnv: 'test',
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rejects unknown accounts with a generic error and performs a dummy hash verification', async () => {
    await expect(
      service.login('unknown@example.com', 'incorrect password', '192.0.2.10'),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));

    expect(prisma.adminUser.findFirst).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (
      prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray
    ).join('');
    expect(sql).toContain('ON CONFLICT ("keyHash") DO UPDATE');
  });

  it('refuses to start without a valid 32-byte HMAC secret', async () => {
    const configModule = Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AUTH_CONFIGURATION,
          useValue: {
            rateLimitSecret: 'hardcoded-or-weak',
            sessionTtlSeconds: '28800',
            frontendUrl: 'http://localhost:3000',
            nodeEnv: 'test',
          },
        },
      ],
    });

    await expect(configModule.compile()).rejects.toThrow(
      'AUTH_RATE_LIMIT_SECRET must be a base64url-encoded 32-byte random key.',
    );
  });

  it('returns the same generic login failure for inactive accounts', async () => {
    prisma.adminUser.findFirst.mockResolvedValue({
      ...adminRecord(),
      isActive: false,
    });

    await expect(
      service.login(
        'admin@example.com',
        'a sufficiently long password',
        '192.0.2.10',
      ),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
  });

  it('creates a hashed opaque session and returns only the safe administrator profile', async () => {
    prisma.adminUser.findFirst.mockResolvedValue(adminRecord());

    const session = await service.login(
      'admin@example.com',
      'a sufficiently long password',
      '192.0.2.10',
    );

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(session.admin).toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
      permissions: ['leads:read'],
    });
    expect(JSON.stringify(session.admin)).not.toContain(session.token);
    const createCall = transaction.adminSession.create.mock.calls[0][0];
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(createCall.data.tokenHash).not.toBe(session.token);
    expect(createCall.data.adminUserId).toBe('admin-1');
    expect(transaction.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' } }),
    );
    expect(transaction.adminSession.deleteMany).toHaveBeenCalled();
    expect(transaction.adminLoginThrottle.deleteMany).toHaveBeenCalled();
  });

  it('blocks the fifth concurrent failure and uses atomic upserts for bucket creation', async () => {
    let failedAttempts = 0;
    prisma.$queryRaw.mockImplementation(() => {
      failedAttempts += 1;
      return Promise.resolve([
        {
          failedAttempts,
          windowStartedAt: new Date(),
          blockedUntil:
            failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      ]);
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.login('unknown@example.com', 'wrong password', '192.0.2.10'),
      ),
    );

    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      5,
    );
    expect(
      attempts.filter(
        (attempt) =>
          attempt.status === 'rejected' &&
          attempt.reason instanceof HttpException &&
          attempt.reason.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
      ),
    ).toHaveLength(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    for (const [template] of prisma.$queryRaw.mock.calls) {
      const sql = (template as TemplateStringsArray).join('');
      expect(sql).toContain('INSERT INTO "admin_login_throttles"');
      expect(sql).toContain('ON CONFLICT ("keyHash") DO UPDATE');
      expect(sql).toContain("INTERVAL '15 minutes'");
    }
  });

  it('rejects a login while its database-backed throttle bucket is blocked', async () => {
    prisma.adminLoginThrottle.findUnique.mockResolvedValue({
      blockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(
      service.login('admin@example.com', 'password', '192.0.2.10'),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(prisma.adminUser.findFirst).not.toHaveBeenCalled();
  });

  it('verifies a non-expired session without returning its bearer token', async () => {
    prisma.adminSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      adminUser: adminRecord(),
    });

    const result = await service.getSession(SESSION_TOKEN);

    expect(result.id).toBe('admin-1');
    expect(JSON.stringify(result)).not.toContain(SESSION_TOKEN);
    const query = prisma.adminSession.findUnique.mock.calls[0][0];
    expect(query.where.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(query.where.tokenHash).not.toBe(SESSION_TOKEN);
  });

  it('rejects expired, revoked, and malformed sessions', async () => {
    prisma.adminSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
      adminUser: adminRecord(),
    });
    await expect(service.getSession(SESSION_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.getSession('bad-token')).rejects.toThrow(
      UnauthorizedException,
    );

    prisma.adminSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      adminUser: adminRecord(),
    });
    await expect(service.getSession(SESSION_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokes a valid session token and ignores malformed tokens', async () => {
    await service.logout(SESSION_TOKEN);
    expect(prisma.adminSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );

    prisma.adminSession.updateMany.mockClear();
    await service.logout('bad-token');
    expect(prisma.adminSession.updateMany).not.toHaveBeenCalled();
  });
});
