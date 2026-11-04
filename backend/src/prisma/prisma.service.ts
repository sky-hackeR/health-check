import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Non-blocking asynchronous connection so the HTTP server and health probes boot promptly
    this.$connect()
      .then(() => {
        this.logger.log('PostgreSQL database connected successfully via Prisma.');
      })
      .catch((error: Error) => {
        this.logger.warn(
          `Database connection deferred: ${error.message}. Ensure PostgreSQL is running on port 5432.`,
        );
      });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected successfully.');
  }
}
