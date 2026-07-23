import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SupportDeliveryStatus,
  type SupportRequest,
} from '@prisma/client';

import {
  MailService,
  type SupportMailRequest,
  type SupportMailUser,
} from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;
const CLAIM_LEASE_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class SupportDeliveryService {
  private readonly logger = new Logger(SupportDeliveryService.name);
  private readonly maxAttempts: number;
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.maxAttempts = this.readPositiveInt(
      config.get<string>('SUPPORT_DELIVERY_MAX_ATTEMPTS'),
      DEFAULT_MAX_ATTEMPTS,
    );
    this.batchSize = this.readPositiveInt(
      config.get<string>('SUPPORT_DELIVERY_BATCH_SIZE'),
      DEFAULT_BATCH_SIZE,
    );
  }

  async deliverRequest(id: string): Promise<SupportRequest | null> {
    const request = await this.findDeliverable(id);
    if (!request) return null;

    if (request.deliveryStatus === SupportDeliveryStatus.SENT) {
      await this.sendConfirmationIfNeeded(id);
      return request;
    }
    if (request.deliveryAttempts >= this.maxAttempts) return request;
    if (
      request.nextDeliveryAttemptAt &&
      request.nextDeliveryAttemptAt.getTime() > Date.now()
    ) {
      return request;
    }

    // Compare-and-swap on the attempt counter so an immediate request and cron
    // tick cannot claim the same delivery at once.
    const claimed = await this.prisma.supportRequest.updateMany({
      where: {
        id,
        deliveryStatus: {
          in: [SupportDeliveryStatus.PENDING, SupportDeliveryStatus.FAILED],
        },
        deliveryAttempts: request.deliveryAttempts,
      },
      data: {
        deliveryAttempts: { increment: 1 },
        nextDeliveryAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS),
      },
    });
    if (claimed.count === 0) {
      return this.prisma.supportRequest.findUnique({ where: { id } });
    }

    const current = await this.findDeliverable(id);
    if (!current) return null;

    try {
      await this.mail.sendSupportRequestToTeam(
        this.toMailRequest(current),
        this.toMailUser(current.user),
      );
      const sent = await this.prisma.supportRequest.update({
        where: { id },
        data: {
          deliveryStatus: SupportDeliveryStatus.SENT,
          deliveredAt: new Date(),
          lastDeliveryError: null,
          nextDeliveryAttemptAt: null,
        },
      });
      await this.sendConfirmationIfNeeded(id);
      return sent;
    } catch (error) {
      const category = this.errorCategory(error);
      const exhausted = current.deliveryAttempts >= this.maxAttempts;
      const failed = await this.prisma.supportRequest.update({
        where: { id },
        data: {
          deliveryStatus: SupportDeliveryStatus.FAILED,
          lastDeliveryError: category,
          nextDeliveryAttemptAt: exhausted
            ? null
            : this.nextAttemptAt(current.deliveryAttempts),
        },
      });
      const message = `support_delivery_${
        exhausted ? 'exhausted' : 'failed'
      } case=${current.caseReference} category=${category}`;
      if (exhausted) this.logger.error(message);
      else this.logger.warn(message);
      return failed;
    }
  }

  async retryOutstanding(): Promise<{
    delivered: number;
    confirmed: number;
    failed: number;
  }> {
    const now = new Date();
    const pending = await this.prisma.supportRequest.findMany({
      where: {
        deliveryStatus: {
          in: [SupportDeliveryStatus.PENDING, SupportDeliveryStatus.FAILED],
        },
        deliveryAttempts: { lt: this.maxAttempts },
        OR: [
          { nextDeliveryAttemptAt: null },
          { nextDeliveryAttemptAt: { lte: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
      select: { id: true },
    });

    let delivered = 0;
    let failed = 0;
    for (const item of pending) {
      const result = await this.deliverRequest(item.id);
      if (result?.deliveryStatus === SupportDeliveryStatus.SENT) delivered += 1;
      else if (result?.deliveryStatus === SupportDeliveryStatus.FAILED) {
        failed += 1;
      }
    }

    const awaitingConfirmation = await this.prisma.supportRequest.findMany({
      where: {
        deliveryStatus: SupportDeliveryStatus.SENT,
        confirmationSentAt: null,
        confirmationAttempts: { lt: this.maxAttempts },
        OR: [
          { nextConfirmationAttemptAt: null },
          { nextConfirmationAttemptAt: { lte: now } },
        ],
      },
      orderBy: { deliveredAt: 'asc' },
      take: this.batchSize,
      select: { id: true },
    });

    let confirmed = 0;
    for (const item of awaitingConfirmation) {
      if (await this.sendConfirmationIfNeeded(item.id)) confirmed += 1;
    }

    return { delivered, confirmed, failed };
  }

  private async sendConfirmationIfNeeded(id: string): Promise<boolean> {
    const request = await this.findDeliverable(id);
    if (
      !request ||
      request.deliveryStatus !== SupportDeliveryStatus.SENT ||
      request.confirmationSentAt ||
      request.confirmationAttempts >= this.maxAttempts ||
      (request.nextConfirmationAttemptAt &&
        request.nextConfirmationAttemptAt.getTime() > Date.now())
    ) {
      return false;
    }

    const claimed = await this.prisma.supportRequest.updateMany({
      where: {
        id,
        deliveryStatus: SupportDeliveryStatus.SENT,
        confirmationSentAt: null,
        confirmationAttempts: request.confirmationAttempts,
      },
      data: {
        confirmationAttempts: { increment: 1 },
        nextConfirmationAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS),
      },
    });
    if (claimed.count === 0) return false;

    const current = await this.findDeliverable(id);
    if (!current) return false;

    try {
      await this.mail.sendSupportRequestConfirmation(
        this.toMailRequest(current),
        this.toMailUser(current.user),
      );
      await this.prisma.supportRequest.update({
        where: { id },
        data: {
          confirmationSentAt: new Date(),
          lastConfirmationError: null,
          nextConfirmationAttemptAt: null,
        },
      });
      return true;
    } catch (error) {
      const category = this.errorCategory(error);
      const exhausted = current.confirmationAttempts >= this.maxAttempts;
      await this.prisma.supportRequest.update({
        where: { id },
        data: {
          lastConfirmationError: category,
          nextConfirmationAttemptAt: exhausted
            ? null
            : this.nextAttemptAt(current.confirmationAttempts),
        },
      });
      const message = `support_confirmation_${
        exhausted ? 'exhausted' : 'failed'
      } case=${current.caseReference} category=${category}`;
      if (exhausted) this.logger.error(message);
      else this.logger.warn(message);
      return false;
    }
  }

  private findDeliverable(id: string) {
    return this.prisma.supportRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            subscription: {
              select: {
                status: true,
                plan: { select: { provider: true } },
              },
            },
          },
        },
      },
    });
  }

  private toMailRequest(request: SupportRequest): SupportMailRequest {
    return {
      caseReference: request.caseReference,
      category: request.category,
      subject: request.subject,
      description: request.description,
      diagnostics: request.diagnostics,
      createdAt: request.createdAt,
    };
  }

  private toMailUser(user: {
    id: string;
    email: string;
    name: string;
    subscription: {
      status: string;
      plan: { provider: string };
    } | null;
  }): SupportMailUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.subscription?.plan.provider.toLowerCase() ?? null,
      subscriptionStatus: user.subscription?.status.toLowerCase() ?? null,
    };
  }

  private nextAttemptAt(attempts: number): Date {
    const backoff = Math.min(
      60_000 * 2 ** Math.max(0, attempts - 1),
      MAX_BACKOFF_MS,
    );
    return new Date(Date.now() + backoff);
  }

  private errorCategory(error: unknown): string {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('not configured')) return 'mail_not_configured';
    if (message.includes('auth') || message.includes('credential')) {
      return 'mail_authentication_failed';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'mail_timeout';
    }
    if (message.includes('recipient') || message.includes('address')) {
      return 'mail_recipient_rejected';
    }
    return 'mail_delivery_failed';
  }

  private readPositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : fallback;
  }
}
