import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import { PrismaService } from '../prisma/prisma.service';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
};

export type PushResult =
  | { sent: true; ticketId: string }
  | { sent: false; reason: 'no_token' | 'invalid_token' | 'send_failed'; error?: string };

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(userId: string, payload: PushPayload): Promise<PushResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) {
      return { sent: false, reason: 'no_token' };
    }

    if (!Expo.isExpoPushToken(user.expoPushToken)) {
      await this.clearToken(userId, 'malformed token at send time');
      return { sent: false, reason: 'invalid_token' };
    }

    const message: ExpoPushMessage = {
      to: user.expoPushToken,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      channelId: payload.channelId ?? 'reminders',
      priority: 'high',
    };

    try {
      const chunks = this.expo.chunkPushNotifications([message]);
      const tickets: ExpoPushTicket[] = [];
      for (const chunk of chunks) {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      }
      const ticket = tickets[0];

      if (ticket.status === 'ok') {
        return { sent: true, ticketId: ticket.id };
      }

      if (ticket.details?.error === 'DeviceNotRegistered') {
        await this.clearToken(userId, 'Expo returned DeviceNotRegistered');
        return { sent: false, reason: 'invalid_token', error: ticket.message };
      }

      this.logger.error(`Expo push failed: ${ticket.message}`);
      return { sent: false, reason: 'send_failed', error: ticket.message };
    } catch (err) {
      const error = err as Error;
      this.logger.error('Expo push threw', error.stack);
      return { sent: false, reason: 'send_failed', error: error.message };
    }
  }

  private async clearToken(userId: string, reason: string): Promise<void> {
    this.logger.warn(`Clearing push token for user ${userId}: ${reason}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: null },
    });
  }
}
