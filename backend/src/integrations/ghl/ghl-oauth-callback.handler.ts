import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { GhlService } from './ghl.service';
import { buildDeepLink, renderOAuthRedirectPage } from './oauth-redirect-page';

const logger = new Logger('GhlOAuthCallback');

export type GhlOAuthFinishResult = {
  status: 'ok' | 'error';
  deepLink: string;
  reason?: string;
};

/** Shared GHL OAuth callback — used by site root and /oauth/callback. */
export async function handleGhlOAuthCallback(
  ghl: GhlService,
  query: GhlCallbackQueryDto,
  res: Response,
): Promise<void> {
  const fallbackReturn = `${ghl.getDeepLinkScheme()}://oauth/ghl`;
  const returnBase = query.state ? ghl.resolveReturnUrl(query.state) : fallbackReturn;

  if (query.error) {
    const reason = query.error_description ?? query.error;
    sendResultPage(res, returnBase, 'error', reason);
    return;
  }

  if (!query.code || !query.state) {
    sendResultPage(res, returnBase, 'error', 'missing_code_or_state');
    return;
  }

  sendLoadingPage(res, query);
}

/** Token exchange + DB save; called from the redirect page via fetch. */
export async function handleGhlOAuthFinish(
  ghl: GhlService,
  query: GhlCallbackQueryDto,
): Promise<GhlOAuthFinishResult> {
  const fallbackReturn = `${ghl.getDeepLinkScheme()}://oauth/ghl`;
  const returnBase = query.state ? ghl.resolveReturnUrl(query.state) : fallbackReturn;

  if (query.error) {
    const reason = query.error_description ?? query.error;
    return {
      status: 'error',
      deepLink: buildDeepLink(returnBase, 'error', reason),
      reason,
    };
  }

  if (!query.code || !query.state) {
    return {
      status: 'error',
      deepLink: buildDeepLink(returnBase, 'error', 'missing_code_or_state'),
      reason: 'missing_code_or_state',
    };
  }

  try {
    const { userId, returnUrl } = await ghl.handleCallback(query.code, query.state);
    logger.log(`GHL OAuth success for user ${userId}`);
    return {
      status: 'ok',
      deepLink: buildDeepLink(returnUrl, 'ok'),
    };
  } catch (err) {
    const reason = (err as Error).message || 'token_exchange';
    logger.warn(`GHL OAuth callback failed: ${reason}`);
    return {
      status: 'error',
      deepLink: buildDeepLink(returnBase, 'error', reason),
      reason,
    };
  }
}

function sendLoadingPage(res: Response, query: GhlCallbackQueryDto): void {
  const params = new URLSearchParams();
  if (query.code) params.set('code', query.code);
  if (query.state) params.set('state', query.state);
  if (query.locationId) params.set('locationId', query.locationId);

  const finishUrl = `/integrations/ghl/finish?${params.toString()}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderOAuthRedirectPage({
      status: 'loading',
      finishUrl,
    }),
  );
}

function sendResultPage(
  res: Response,
  returnBase: string,
  status: 'ok' | 'error',
  reason?: string,
): void {
  const deepLink = buildDeepLink(returnBase, status, reason);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderOAuthRedirectPage({
      status,
      deepLink,
      reason,
    }),
  );
}
