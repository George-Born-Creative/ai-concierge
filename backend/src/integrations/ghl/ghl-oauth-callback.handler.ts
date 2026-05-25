import { Logger } from '@nestjs/common';
import { Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { GhlService } from './ghl.service';
import { buildDeepLink } from './oauth-redirect-page';

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
  _requestOrigin?: string,
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

  // Exchange code on the server during this redirect (faster than loading HTML + browser fetch /finish).
  const started = Date.now();
  const result = await handleGhlOAuthFinish(ghl, query);
  logger.log(`GHL OAuth finish completed in ${Date.now() - started}ms (${result.status})`);
  sendResultPage(res, result.deepLink, result.status, result.reason);
}

/** Token exchange + DB save (also used by GET /integrations/ghl/finish). */
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

function sendResultPage(
  res: Response,
  returnBase: string,
  status: 'ok' | 'error',
  reason?: string,
): void {
  const deepLink =
    returnBase.includes('status=') ? returnBase : buildDeepLink(returnBase, status, reason);
  // 302 straight into the app scheme — WebBrowser.openAuthSessionAsync closes without a tap.
  res.redirect(302, deepLink);
}
