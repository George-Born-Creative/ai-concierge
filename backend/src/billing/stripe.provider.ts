import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

// We pin to a known API version so PaymentSheet ephemeral keys stay compatible
// with the mobile SDK. Bump intentionally when upgrading both client and server.
export const STRIPE_API_VERSION = '2024-11-20.acacia' as Stripe.LatestApiVersion;

@Injectable()
export class StripeProvider implements OnModuleInit {
  client!: Stripe;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    this.client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }

  get publishableKey(): string {
    return this.config.get<string>('STRIPE_PUBLISHABLE_KEY', '');
  }

  get webhookSecret(): string {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    return secret;
  }
}
