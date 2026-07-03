import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { HubspotService } from './hubspot.service';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

type HubspotErrorBody = {
  category?: string;
  message?: string;
  errors?: { message?: string }[];
  status?: string;
};

export type HubspotRequestInit = {
  /**
   * Query string params. `undefined` / empty values are skipped so callers
   * can spread optional inputs without manually filtering.
   */
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

/**
 * Thin HTTP helper for `api.hubapi.com`. Resolves a fresh access token via
 * `HubspotService.getValidAccessToken`, signs the request, and maps HubSpot's
 * error shape to friendly Nest exceptions in the same style as `ghlRequest`
 * (see `backend/src/integrations/ghl/ghl.service.ts#throwGhlHttpError`).
 *
 * Resource services (contacts/deals/companies) inject this and never talk to
 * `fetch` directly — keeping authorisation, retry, and error UX in one place.
 */
@Injectable()
export class HubspotApiClient {
  private readonly logger = new Logger(HubspotApiClient.name);

  constructor(private readonly hubspot: HubspotService) {}

  async request<T>(
    userId: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    init?: HubspotRequestInit,
  ): Promise<T> {
    const { accessToken } = await this.hubspot.getValidAccessToken(userId);

    const url = this.buildUrl(path, init?.query);

    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(
        `HubSpot ${method} ${path} ${res.status}: ${text.slice(0, 300)}`,
      );
      this.throwHubspotHttpError(res.status, text, path);
    }

    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // HubSpot occasionally returns 204 / empty bodies; treat unparseable as empty.
      return {} as T;
    }
  }

  private buildUrl(
    path: string,
    query?: HubspotRequestInit['query'],
  ): string {
    const base = `${HUBSPOT_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
  }

  // ── Error mapping ──────────────────────────────────────────────────────────
  // HubSpot returns either { category, message, errors[], status } or, for some
  // older endpoints, plain text. We extract a usable message and bucket common
  // failure modes (auth / scopes / validation) into Nest exceptions so the
  // mobile app can show actionable copy.

  private throwHubspotHttpError(
    status: number,
    text: string,
    path?: string,
  ): never {
    const message = this.extractMessage(text);
    const lower = message.toLowerCase();

    if (status === 401) {
      throw new UnauthorizedException(
        'HubSpot session expired — please reconnect in Settings.',
      );
    }
    if (status === 403 && /scope|permission/.test(lower)) {
      throw new ForbiddenException(this.scopeMismatchMessage(path));
    }
    if (status === 403) {
      throw new ForbiddenException(
        `HubSpot refused the request: ${message}`,
      );
    }
    if (status === 404) {
      throw new BadRequestException(
        `HubSpot returned 404 for ${path ?? 'request'}: ${message}`,
      );
    }
    if (status === 429) {
      throw new BadRequestException(
        'HubSpot rate limit hit — try again in a moment.',
      );
    }
    throw new BadRequestException(`HubSpot API error (${status}): ${message}`);
  }

  /**
   * Mirrors `GhlService.scopeMismatchMessage`: pick a reconnect message based
   * on which CRM surface the failing call hit so users know which scopes to
   * approve when they reconnect.
   */
  private scopeMismatchMessage(path?: string): string {
    if (!path) return this.genericReconnectMessage();
    if (/contacts/i.test(path)) {
      return (
        'Your HubSpot connection is missing contact scopes. ' +
        'Go to Profile → Settings → Reconnect HubSpot and approve contact access.'
      );
    }
    if (/deals/i.test(path)) {
      return (
        'Your HubSpot connection is missing deal scopes. ' +
        'Go to Profile → Settings → Reconnect HubSpot and approve deal access.'
      );
    }
    if (/companies/i.test(path)) {
      return (
        'Your HubSpot connection is missing company scopes. ' +
        'Go to Profile → Settings → Reconnect HubSpot and approve company access.'
      );
    }
    if (/tickets/i.test(path)) {
      return (
        'Your HubSpot connection is missing ticket scopes. ' +
        'Go to Profile → Settings → Reconnect HubSpot and approve ticket access.'
      );
    }
    return this.genericReconnectMessage();
  }

  private genericReconnectMessage(): string {
    return (
      'Your HubSpot connection is missing a scope this action needs. ' +
      'Go to Profile → Settings → Reconnect HubSpot and approve all the requested permissions, then try again.'
    );
  }

  private extractMessage(text: string): string {
    if (!text) return '';
    try {
      const body = JSON.parse(text) as HubspotErrorBody;
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        const joined = body.errors
          .map((e) => e?.message)
          .filter((m): m is string => Boolean(m))
          .join(', ');
        if (joined) return joined;
      }
      if (typeof body.message === 'string' && body.message) return body.message;
    } catch {
      // Fall through to raw text.
    }
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }
}
