import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { isIP } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { AppModule } from '../src/app.module';
import { validateInitialAdminPassword } from '../src/auth/initial-admin-password';
import { PrismaService } from '../src/prisma/prisma.service';

function isLoopbackHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === 'localhost') return true;
  if (isIP(normalizedHost) === 4) return normalizedHost.startsWith('127.');
  return normalizedHost === '::1';
}

function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Password recovery requires an interactive local terminal.');
  }

  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let value = '';
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    const finish = (error?: Error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003') {
          finish(new Error('Recovery was cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character >= ' ') {
          value += character;
        }
      }
    };

    input.on('data', onData);
  });
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Password recovery must be run from a local interactive terminal.');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const config = app.get(ConfigService);
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const databaseHost = new URL(databaseUrl).hostname;
    if (!isLoopbackHost(databaseHost)) {
      throw new Error('Recovery is restricted to a local database connection.');
    }

    const rateLimitSecret = config.getOrThrow<string>('AUTH_RATE_LIMIT_SECRET');
    if (!/^[A-Za-z0-9_-]{43}$/u.test(rateLimitSecret)) {
      throw new Error('The configured login-throttle secret is invalid.');
    }

    const prisma = app.get(PrismaService);
    await prisma.$connect();

    const email = (await promptVisible('Administrator email: ')).trim().toLowerCase();
    const matches = await prisma.adminUser.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, isActive: true, deletedAt: true },
      take: 2,
    });
    if (matches.length !== 1 || !matches[0].isActive || matches[0].deletedAt) {
      throw new Error('The specified active administrator account was not found uniquely.');
    }
    const admin = matches[0];
    process.stdout.write(`Selected account: ${admin.email}\n`);

    const clientIp = (await promptVisible(
      'Client IP used for sign-in (127.0.0.1): ',
    )).trim() || '127.0.0.1';
    if (!isIP(clientIp)) {
      throw new Error('The client address must be a valid IP address.');
    }

    const password = validateInitialAdminPassword(
      await readHidden('New password (input hidden): '),
    );
    const confirmation = await readHidden('Confirm new password (input hidden): ');
    if (password !== confirmation) {
      throw new Error('The password entries do not match.');
    }

    const confirmationWord = await promptVisible(
      `Type RECOVER to update this account and clear only its ${clientIp} login lock: `,
    );
    if (confirmationWord !== 'RECOVER') {
      throw new Error('Recovery was not confirmed; no account changes were made.');
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    const keyHash = createHmac('sha256', Buffer.from(rateLimitSecret, 'base64url'))
      .update(`${email}\u0000${clientIp}`)
      .digest('hex');

    const result = await prisma.$transaction(async (transaction) => {
      const currentAdmin = await transaction.adminUser.findUnique({
        where: { id: admin.id },
        select: { email: true, isActive: true, deletedAt: true },
      });
      if (
        !currentAdmin ||
        !currentAdmin.isActive ||
        currentAdmin.deletedAt ||
        currentAdmin.email.toLowerCase() !== email
      ) {
        throw new Error('The administrator account changed during recovery.');
      }

      await transaction.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash },
      });
      const revokedSessions = await transaction.adminSession.updateMany({
        where: { adminUserId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const clearedThrottleRecords = await transaction.adminLoginThrottle.deleteMany({
        where: { keyHash },
      });
      return { revokedSessions: revokedSessions.count, clearedThrottleRecords: clearedThrottleRecords.count };
    });

    process.stdout.write(
      `Recovery completed for ${admin.email}. Revoked sessions: ${result.revokedSessions}. ` +
      `Cleared matching throttle records: ${result.clearedThrottleRecords}.\n`,
    );
  } finally {
    await app.close();
  }
}

function promptVisible(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.once('data', (chunk) => {
      resolve(chunk.toString('utf8').replace(/[\r\n]+$/u, ''));
    });
  });
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected recovery failure.';
  process.stderr.write(`Administrator recovery not completed: ${message}\n`);
  process.exitCode = 1;
});
