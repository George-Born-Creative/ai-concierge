import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { SupportDeliveryService } from './support-delivery.service';
import {
  sanitizeClientDiagnostics,
  type StoredSupportDiagnostics,
} from './support-diagnostics.policy';
import { SupportDiagnosticsService } from './support-diagnostics.service';

const HOURLY_REQUEST_LIMIT = 5;
const DAILY_REQUEST_LIMIT = 20;
const CASE_REFERENCE_ATTEMPTS = 5;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: SupportDeliveryService,
    private readonly config: ConfigService,
    private readonly diagnostics: SupportDiagnosticsService,
  ) {}

  async createRequest(userId: string, dto: CreateSupportRequestDto) {
    const existing = await this.findExisting(userId, dto.clientRequestId);
    if (existing) {
      const request = await this.delivery.deliverRequest(existing.id);
      return this.toResponse(request ?? existing, existing.user.email);
    }

    if (!this.isIntakeConfigured()) {
      throw new ServiceUnavailableException(
        'Support intake is not available yet. Please try again later.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.enforceRateLimit(userId);
    const diagnostics = dto.includeDiagnostics
      ? await this.createDiagnosticsSnapshot(userId, dto.clientDiagnostics)
      : null;
    const stored = await this.insertRequest(userId, dto, diagnostics);

    // Intake is durable before any SMTP call. Delivery failures are recorded
    // and retried by SupportDeliveryCron; the user still receives a case ID.
    const delivered = await this.delivery.deliverRequest(stored.id);
    return this.toResponse(delivered ?? stored, user.email);
  }

  private async findExisting(userId: string, clientRequestId: string) {
    return this.prisma.supportRequest.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId } },
      include: { user: { select: { email: true } } },
    });
  }

  private async enforceRateLimit(userId: string): Promise<void> {
    const now = Date.now();
    const [lastHour, lastDay] = await this.prisma.$transaction([
      this.prisma.supportRequest.count({
        where: {
          userId,
          createdAt: { gte: new Date(now - 60 * 60 * 1000) },
        },
      }),
      this.prisma.supportRequest.count({
        where: {
          userId,
          createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    if (lastHour >= HOURLY_REQUEST_LIMIT || lastDay >= DAILY_REQUEST_LIMIT) {
      throw new HttpException(
        'Too many support requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async insertRequest(
    userId: string,
    dto: CreateSupportRequestDto,
    diagnostics: StoredSupportDiagnostics | null,
  ) {
    for (let attempt = 0; attempt < CASE_REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.supportRequest.create({
          data: {
            userId,
            clientRequestId: dto.clientRequestId,
            caseReference: this.createCaseReference(),
            category: dto.category,
            subject: dto.subject,
            description: dto.description,
            ...(diagnostics
              ? {
                  diagnostics:
                    diagnostics as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await this.findExisting(
            userId,
            dto.clientRequestId,
          );
          if (existing) return existing;
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate a support case reference. Please retry.',
    );
  }

  private async createDiagnosticsSnapshot(
    userId: string,
    clientDiagnostics: unknown,
  ): Promise<StoredSupportDiagnostics> {
    const server = await this.diagnostics.getDiagnostics(userId);
    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      client: sanitizeClientDiagnostics(clientDiagnostics),
      server,
    };
  }

  private createCaseReference(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    return `AC-${date}-${suffix}`;
  }

  private isIntakeConfigured(): boolean {
    const inbox = this.config.get<string>('SUPPORT_INBOX_EMAIL')?.trim();
    if (!inbox || inbox.toLowerCase().endsWith('@example.com')) return false;

    if (this.config.get<string>('NODE_ENV') !== 'production') return true;
    return Boolean(
      this.config.get<string>('MAIL_USER')?.trim() &&
        this.config.get<string>('MAIL_PASS')?.trim(),
    );
  }

  private toResponse(
    request: {
      caseReference: string;
      deliveryStatus: string;
      createdAt: Date;
    },
    email: string,
  ) {
    return {
      caseReference: request.caseReference,
      email,
      deliveryStatus: request.deliveryStatus,
      createdAt: request.createdAt.toISOString(),
    };
  }
}
