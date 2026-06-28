import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    // Log which database (host/name) this instance is bound to — credentials
    // masked. Makes environment mismatches obvious at a glance (e.g. an OAuth
    // callback server pointed at a different DB than the API that issued the
    // token, which surfaces as a userId foreign-key violation).
    this.logger.log(`Connected to database: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return 'unknown (DATABASE_URL not set)';
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, '') || '(default)';
    return `${parsed.host}/${db}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}
