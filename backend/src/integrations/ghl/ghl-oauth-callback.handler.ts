import { Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { GhlService } from './ghl.service';

/** Shared GHL OAuth callback — used by /oauth/callback and legacy /integrations/ghl/callback. */
export async function handleGhlOAuthCallback(
  ghl: GhlService,
  query: GhlCallbackQueryDto,
  res: Response,
): Promise<void> {
  const scheme = ghl.getDeepLinkScheme();

  if (query.error) {
    sendDeepLink(res, scheme, 'error', query.error);
    return;
  }

  if (!query.code || !query.state) {
    sendDeepLink(res, scheme, 'error', 'missing_code_or_state');
    return;
  }

  try {
    await ghl.handleCallback(query.code, query.state);
    sendDeepLink(res, scheme, 'ok');
  } catch (err) {
    const reason = (err as Error).message || 'token_exchange';
    sendDeepLink(res, scheme, 'error', reason);
  }
}

function sendDeepLink(res: Response, scheme: string, status: 'ok' | 'error', reason?: string) {
  const params = new URLSearchParams({ status });
  if (reason) params.set('reason', reason);
  const deepLink = `${scheme}://oauth/ghl?${params.toString()}`;
  const safeLink = escapeHtml(deepLink);
  const message =
    status === 'ok'
      ? 'Connection successful. You can close this window.'
      : 'Connection failed. You can close this window and try again.';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Concierge</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F8FAFF;color:#202124;text-align:center;padding:24px;"><div><p style="font-size:18px;margin:0 0 12px;">${escapeHtml(message)}</p><p style="color:#5F6368;font-size:14px;margin:0;">If you are not returned to the app automatically, <a href="${safeLink}">tap here</a>.</p></div><script>setTimeout(function(){window.location.replace(${JSON.stringify(deepLink)});},150);</script></body></html>`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
