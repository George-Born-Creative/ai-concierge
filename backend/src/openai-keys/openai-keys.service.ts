import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CrmProvider } from '@prisma/client';
import OpenAI, { APIError } from 'openai';

import { decryptSecret, encryptSecret } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

export type OpenAIKeyStatus = {
  exists: boolean;
  last4: string | null;
  createdAt: string | null;
  /** True when the key is valid but the OpenAI account has no quota/billing. */
  quotaWarning?: boolean;
};

@Injectable()
export class OpenAIKeysService {
  private readonly logger = new Logger(OpenAIKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Encrypts the raw key with AES-256-GCM and upserts it. Returns only the
  // last 4 chars so the client can show a masked preview. The plaintext key
  // never leaves the backend after this point.
  async saveKey(userId: string, rawKey: string): Promise<OpenAIKeyStatus> {
    const trimmed = rawKey.trim();
    const check = await this.checkKeyWithOpenAI(trimmed);

    const last4 = trimmed.slice(-4);
    const encryptedKey = encryptSecret(trimmed);

    const row = await this.prisma.openAIKey.upsert({
      where: { userId },
      update: { encryptedKey, last4 },
      create: { userId, encryptedKey, last4 },
    });

    await this.audit(userId, 'openai_key.save', 'success', {
      last4,
      quotaWarning: check.quotaExceeded,
    });

    return {
      exists: true,
      last4: row.last4,
      createdAt: row.createdAt.toISOString(),
      quotaWarning: check.quotaExceeded || undefined,
    };
  }

  async getStatus(userId: string): Promise<OpenAIKeyStatus> {
    const row = await this.prisma.openAIKey.findUnique({ where: { userId } });
    if (!row) {
      return { exists: false, last4: null, createdAt: null };
    }
    return {
      exists: true,
      last4: row.last4,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteKey(userId: string): Promise<{ ok: true }> {
    const row = await this.prisma.openAIKey.findUnique({ where: { userId } });
    if (row) {
      await this.prisma.openAIKey.delete({ where: { userId } });
      await this.audit(userId, 'openai_key.delete', 'success');
    }
    return { ok: true };
  }

  private async checkKeyWithOpenAI(rawKey: string): Promise<{ quotaExceeded: boolean }> {
    const openai = new OpenAI({ apiKey: rawKey });
    try {
      // models.list is often allowed without billing; a tiny completion matches Whisper billing.
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { quotaExceeded: false };
    } catch (err) {
      if (err instanceof APIError) {
        if (err.status === 401) {
          throw new BadRequestException('That OpenAI API key is invalid or revoked.');
        }
        if (err.status === 429) {
          return { quotaExceeded: true };
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/429|quota|rate limit|insufficient/i.test(message)) {
        return { quotaExceeded: true };
      }
      return { quotaExceeded: false };
    }
  }

  // Returns the decrypted key for server-side use (Whisper, Chat Completions).
  // Never exposed via HTTP.
  async getDecryptedKey(userId: string): Promise<string> {
    const row = await this.prisma.openAIKey.findUnique({ where: { userId } });
    if (!row) {
      throw new NotFoundException('OpenAI API key is not set');
    }
    try {
      return decryptSecret(row.encryptedKey);
    } catch (err) {
      this.logger.error(`Failed to decrypt OpenAI key for ${userId}: ${(err as Error).message}`);
      throw new ForbiddenException('Stored OpenAI key is corrupt — re-add it.');
    }
  }

  private async audit(
    userId: string,
    action: string,
    status: 'success' | 'failure',
    payload?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          provider: null as CrmProvider | null,
          status,
          payload: payload ? (payload as object) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log ${action}: ${(err as Error).message}`);
    }
  }
}
