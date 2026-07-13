import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Thin publish API over the WebSocket gateway. Other modules inject this to
 * push events to a specific user's connected devices without depending on the
 * gateway internals. The gateway hands us the socket.io `Server` on init.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  /** Emit an event to every socket the user has in room `user:<id>`. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) {
      // Sockets not initialised yet (or running in a context without the
      // gateway). Non-fatal — the client reconciles on next fetch/focus.
      return;
    }
    try {
      this.server.to(`user:${userId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(
        `emitToUser failed (${event}): ${(err as Error).message}`,
      );
    }
  }
}
