import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlansService } from './plans.service';

// Plans are part of the onboarding funnel and only fetched after the user
// signs up / signs in. Gating behind JwtAuthGuard prevents anonymous
// scraping of pricing data and ensures every request to /plans is tied to
// a known account (useful for rate-limit and abuse signals later). The
// mobile app caches the response locally so this endpoint is cold-pathed
// for most sessions.
@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }
}
