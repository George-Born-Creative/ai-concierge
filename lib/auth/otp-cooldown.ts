import {
  clearCacheItem,
  getCacheItem,
  setCacheItem,
} from '@/lib/cache';

export const OTP_RESEND_COOLDOWN_SECONDS = 30;

export type OtpFlow = 'email-verification' | 'password-reset';

function cacheKey(flow: OtpFlow, recipient: string): string {
  return `otp.cooldown.${flow}.${recipient.trim().toLowerCase()}`;
}

export async function getOtpCooldownRemaining(
  flow: OtpFlow,
  recipient: string,
): Promise<number> {
  if (!recipient) return 0;

  const stored = await getCacheItem(cacheKey(flow, recipient));
  const expiresAt = Number(stored);
  if (!Number.isFinite(expiresAt)) return 0;

  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

export async function startOtpCooldown(
  flow: OtpFlow,
  recipient: string,
  seconds = OTP_RESEND_COOLDOWN_SECONDS,
): Promise<void> {
  if (!recipient) return;

  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0
      ? Math.ceil(seconds)
      : OTP_RESEND_COOLDOWN_SECONDS;
  await setCacheItem(
    cacheKey(flow, recipient),
    String(Date.now() + safeSeconds * 1000),
  );
}

export async function clearOtpCooldown(
  flow: OtpFlow,
  recipient: string,
): Promise<void> {
  if (!recipient) return;
  await clearCacheItem(cacheKey(flow, recipient));
}
