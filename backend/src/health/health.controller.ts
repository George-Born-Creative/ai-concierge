import { Controller, Get } from '@nestjs/common';

/** Lightweight probe for deploy checks (API vs WordPress on same domain). */
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'ai-concierge-api',
      oauth: {
        ghlRootCallback: 'GET /',
        ghlLegacyCallback: 'GET /oauth/callback',
      },
    };
  }
}
