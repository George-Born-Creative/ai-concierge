/**
 * Bucket a conversation's `updatedAt` into one of four date groups, computed
 * relative to the user's local "now". The boundaries are local-midnight
 * aligned in the supplied IANA timezone (or the server's tz when omitted),
 * so a conversation touched at 11pm last night is "Yesterday" rather than
 * "Today" for an Eastern-time user even if the server runs in UTC.
 */
export type ConversationBucketKey = 'today' | 'yesterday' | 'last7' | 'older';

export const CONVERSATION_BUCKET_LABELS: Record<ConversationBucketKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Previous 7 Days',
  older: 'Older',
};

export const CONVERSATION_BUCKET_ORDER: ConversationBucketKey[] = [
  'today',
  'yesterday',
  'last7',
  'older',
];

type Boundaries = {
  startOfToday: number;
  startOfYesterday: number;
  startOfLast7: number;
};

function computeBoundaries(now: Date, timeZone?: string): Boundaries {
  // Render `now` as a Y/M/D in the requested tz, then build a UTC ms timestamp
  // for that local midnight. Intl gives us the parts; we round-trip through
  // Date.UTC so DST-shift conversations still bucket correctly.
  let year: number;
  let month: number;
  let day: number;
  if (timeZone) {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      const parts = fmt.formatToParts(now);
      year = Number(parts.find((p) => p.type === 'year')?.value);
      month = Number(parts.find((p) => p.type === 'month')?.value);
      day = Number(parts.find((p) => p.type === 'day')?.value);
    } catch {
      // Bad tz: fall back to server local time.
      year = now.getFullYear();
      month = now.getMonth() + 1;
      day = now.getDate();
    }
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }

  // Use a UTC anchor so day arithmetic doesn't get tripped by DST. The 1-day
  // offsets below are exact 24h offsets which is correct for bucketing
  // (any conversation in the previous local day lands in `yesterday`, etc.).
  const startOfToday = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return {
    startOfToday,
    startOfYesterday: startOfToday - ONE_DAY,
    startOfLast7: startOfToday - 7 * ONE_DAY,
  };
}

export function bucketByDate(
  updatedAt: Date,
  now: Date,
  timeZone?: string,
): ConversationBucketKey {
  const { startOfToday, startOfYesterday, startOfLast7 } = computeBoundaries(now, timeZone);
  const t = updatedAt.getTime();
  if (t >= startOfToday) return 'today';
  if (t >= startOfYesterday) return 'yesterday';
  if (t >= startOfLast7) return 'last7';
  return 'older';
}
