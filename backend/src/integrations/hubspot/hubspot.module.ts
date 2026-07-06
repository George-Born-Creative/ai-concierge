import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../../auth/auth.module';
import { HubspotCompaniesController } from './companies/companies.controller';
import { HubspotCompaniesService } from './companies/companies.service';
import { HubspotContactsController } from './contacts/contacts.controller';
import { HubspotContactsService } from './contacts/contacts.service';
import { HubspotDealsController } from './deals/deals.controller';
import { HubspotDealsService } from './deals/deals.service';
import { HubspotApiClient } from './hubspot-api.client';
import { HubspotController } from './hubspot.controller';
import { HubspotService } from './hubspot.service';
import { HubspotProductsController } from './products/products.controller';
import { HubspotProductsService } from './products/products.service';
import { HubspotTicketsController } from './tickets/tickets.controller';
import { HubspotTicketsService } from './tickets/tickets.service';

// Reuses the global JWT_SECRET to sign short-lived OAuth `state` tokens.
// Imports AuthModule so JwtStrategy is available for JwtAuthGuard on routes.
//
// HubspotService owns the OAuth lifecycle (auth URL, callback, refresh,
// status, disconnect/reconnect). HubspotApiClient is the single shared HTTP
// helper for `api.hubapi.com` calls — every resource service injects it
// instead of touching `fetch` directly. Both are exported so a future
// AssistantModule can wire HubSpot into chat/voice without restructuring.
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
  controllers: [
    HubspotController,
    HubspotContactsController,
    HubspotDealsController,
    HubspotCompaniesController,
    HubspotTicketsController,
    HubspotProductsController,
  ],
  providers: [
    HubspotService,
    HubspotApiClient,
    HubspotContactsService,
    HubspotDealsService,
    HubspotCompaniesService,
    HubspotTicketsService,
    HubspotProductsService,
  ],
  exports: [
    HubspotService,
    HubspotApiClient,
    HubspotContactsService,
    HubspotDealsService,
    HubspotCompaniesService,
    HubspotTicketsService,
    HubspotProductsService,
  ],
})
export class HubspotModule {}
