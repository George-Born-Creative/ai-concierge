import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

type JwtPayload = { sub: string; email: string };

/**
 * Authenticated socket.io gateway. Mirrors the HTTP JWT model: the client sends
 * its Bearer token in the handshake, we verify it with the same secret, confirm
 * the user still exists, and join the connection to a per-user room so
 * RealtimeService can target it. Unauthenticated sockets are disconnected.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('missing token');

      const secret = this.config.get<string>('JWT_SECRET');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!user) throw new Error('account no longer exists');

      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
    } catch (err) {
      this.logger.debug(`WS auth rejected: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return null;
  }
}
