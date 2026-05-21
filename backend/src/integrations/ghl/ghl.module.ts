import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../../auth/auth.module';
import { GhlController } from './ghl.controller';
import {
  GhlOAuthCallbackController,
  GhlRootOAuthCallbackController,
} from './ghl-oauth-callback.controller';
import { GhlService } from './ghl.service';

// Reuses the global JWT_SECRET to sign short-lived OAuth `state` tokens.
// Imports AuthModule so JwtStrategy is available for JwtAuthGuard on routes.
@Module({
  imports: [
    AuthModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return { secret };
      },
    }),
  ],
  controllers: [GhlController, GhlRootOAuthCallbackController, GhlOAuthCallbackController],
  providers: [GhlService],
  exports: [GhlService],
})
export class GhlModule {}
