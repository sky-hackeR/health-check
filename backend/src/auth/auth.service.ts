import {
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_CONFIGURATION } from './auth.config';
import type { AuthConfiguration } from './auth.config';
import { AdminSessionResponseDto } from './dto/admin-session-response.dto';

const MAX_FAILED_ATTEMPTS = 5;
const SCRYPT_KEY_LENGTH = 64;
const THROTTLE_RETENTION_MS = 24 * 60 * 60 * 1000;
const scryptAsync = promisify(scrypt);

const adminIdentitySelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  deletedAt: true,
  role: {
    select: {
      name: true,
      permissions: {
        select: {
          permission: { select: { slug: true } },
        },
      },
    },
  },
} satisfies Prisma.AdminUserSelect;

const adminAuthSelect = {
  ...adminIdentitySelect,
  passwordHash: true,
} satisfies Prisma.AdminUserSelect;

type AdminIdentity = Prisma.AdminUserGetPayload<{
  select: typeof adminIdentitySelect;
}>;
type AdminWithAuth = Prisma.AdminUserGetPayload<{
  select: typeof adminAuthSelect;
}>;
type ThrottleState = {
  failedAttempts: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

@Injectable()
export class AuthService {
  private readonly rateLimitSecret: Buffer;
  private readonly sessionTtlSeconds: number;
  private readonly dummySalt = randomBytes(16);
  private readonly dummyHash = randomBytes(SCRYPT_KEY_LENGTH);
  private lastThrottleCleanupAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIGURATION) config: AuthConfiguration,
  ) {
    const secret = config.rateLimitSecret;
    if (!secret || !/^[A-Za-z0-9_-]{43}$/u.test(secret)) {
      throw new Error(
        'AUTH_RATE_LIMIT_SECRET must be a base64url-encoded 32-byte random key.',
      );
    }

    this.rateLimitSecret = Buffer.from(secret, 'base64url');
    if (
      this.rateLimitSecret.length !== 32 ||
      this.rateLimitSecret.toString('base64url') !== secret
    ) {
      throw new Error(
        'AUTH_RATE_LIMIT_SECRET must be a base64url-encoded 32-byte random key.',
      );
    }

    const ttl = Number(config.sessionTtlSeconds ?? '28800');
    if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86400) {
      throw new Error(
        'ADMIN_SESSION_TTL_SECONDS must be an integer between 300 and 86400.',
      );
    }
    this.sessionTtlSeconds = ttl;
  }

  async login(
    email: string,
    password: string,
    clientIp: string,
  ): Promise<{
    token: string;
    expiresAt: Date;
    admin: AdminSessionResponseDto;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const throttleKey = this.createThrottleKey(normalizedEmail, clientIp);
    await this.rejectIfBlocked(throttleKey);

    const admin = await this.prisma.adminUser.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: adminAuthSelect,
    });

    const passwordMatches = await this.verifyPassword(
      password,
      admin?.passwordHash,
    );
    if (!admin || !passwordMatches || !admin.isActive || admin.deletedAt) {
      const state = await this.recordFailedAttempt(throttleKey);
      if (state.blockedUntil && state.blockedUntil > new Date()) {
        throw new HttpException(
          'Too many login attempts. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid email or password.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashSessionToken(token);
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.adminSession.create({
        data: { tokenHash, adminUserId: admin.id, expiresAt },
      });
      await transaction.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: now },
      });
      await transaction.adminSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: now } }],
        },
      });
      await transaction.adminLoginThrottle.deleteMany({
        where: { keyHash: throttleKey },
      });
    });

    return {
      token,
      expiresAt,
      admin: this.toResponse(admin),
    };
  }

  async getSession(
    token: string | undefined,
  ): Promise<AdminSessionResponseDto> {
    if (!this.isSessionToken(token)) {
      throw new UnauthorizedException('Administrator session is not valid.');
    }

    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: this.hashSessionToken(token) },
      include: { adminUser: { select: adminIdentitySelect } },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.adminUser.isActive ||
      session.adminUser.deletedAt
    ) {
      throw new UnauthorizedException('Administrator session is not valid.');
    }

    return this.toResponse(session.adminUser);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!this.isSessionToken(token)) {
      return;
    }

    await this.prisma.adminSession.updateMany({
      where: {
        tokenHash: this.hashSessionToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async rejectIfBlocked(keyHash: string): Promise<void> {
    const throttle = await this.prisma.adminLoginThrottle.findUnique({
      where: { keyHash },
      select: { blockedUntil: true },
    });
    if (throttle?.blockedUntil && throttle.blockedUntil > new Date()) {
      throw new HttpException(
        'Too many login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedAttempt(keyHash: string): Promise<ThrottleState> {
    const now = Date.now();
    if (now - this.lastThrottleCleanupAt >= 60 * 60 * 1000) {
      await this.prisma.adminLoginThrottle.deleteMany({
        where: { updatedAt: { lt: new Date(now - THROTTLE_RETENTION_MS) } },
      });
      this.lastThrottleCleanupAt = now;
    }

    const rows = await this.prisma.$queryRaw<ThrottleState[]>`
      INSERT INTO "admin_login_throttles"
        ("keyHash", "failedAttempts", "windowStartedAt", "blockedUntil", "updatedAt")
      VALUES
        (${keyHash}, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT ("keyHash") DO UPDATE SET
        "failedAttempts" = CASE
          WHEN admin_login_throttles."blockedUntil" > CURRENT_TIMESTAMP
            THEN admin_login_throttles."failedAttempts"
          WHEN admin_login_throttles."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            THEN 1
          ELSE admin_login_throttles."failedAttempts" + 1
        END,
        "windowStartedAt" = CASE
          WHEN admin_login_throttles."blockedUntil" > CURRENT_TIMESTAMP
            THEN admin_login_throttles."windowStartedAt"
          WHEN admin_login_throttles."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            THEN CURRENT_TIMESTAMP
          ELSE admin_login_throttles."windowStartedAt"
        END,
        "blockedUntil" = CASE
          WHEN admin_login_throttles."blockedUntil" > CURRENT_TIMESTAMP
            THEN admin_login_throttles."blockedUntil"
          WHEN admin_login_throttles."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            THEN NULL
          WHEN admin_login_throttles."failedAttempts" + 1 >= ${MAX_FAILED_ATTEMPTS}
            THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
          ELSE NULL
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "failedAttempts", "windowStartedAt", "blockedUntil"
    `;

    const state = rows[0];
    if (!state) {
      throw new InternalServerErrorException(
        'Unable to update login throttling state.',
      );
    }
    return state;
  }

  private createThrottleKey(email: string, clientIp: string): string {
    return createHmac('sha256', this.rateLimitSecret)
      .update(`${email}\u0000${clientIp}`)
      .digest('hex');
  }

  private async verifyPassword(
    password: string,
    encodedHash: string | undefined,
  ): Promise<boolean> {
    const match = encodedHash?.match(
      /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/u,
    );
    if (!match) {
      const dummyDerived = (await scryptAsync(
        password,
        this.dummySalt,
        SCRYPT_KEY_LENGTH,
      )) as Buffer;
      timingSafeEqual(dummyDerived, this.dummyHash);
      return false;
    }

    const expectedHash = Buffer.from(match[2], 'hex');
    const actualHash = (await scryptAsync(
      password,
      match[1],
      SCRYPT_KEY_LENGTH,
    )) as Buffer;
    return timingSafeEqual(actualHash, expectedHash);
  }

  private hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isSessionToken(token: string | undefined): token is string {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token);
  }

  private toResponse(
    admin: AdminIdentity | AdminWithAuth,
  ): AdminSessionResponseDto {
    const { id, email, firstName, lastName, role } = admin;
    return {
      id,
      email,
      firstName,
      lastName,
      role: role.name,
      permissions: role.permissions.map(({ permission }) => permission.slug),
    };
  }
}
