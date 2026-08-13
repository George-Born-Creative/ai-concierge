import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * Milliseconds between typewriter ticks. Larger = slower. At 55ms each
 * tick takes ~3× longer than the original 18ms, so a 100-char reply
 * settles in roughly 2.5–3 seconds instead of ~300ms — readable
 * "writing in" pace rather than near-instant reveal.
 */
const TICK_INTERVAL_MS = 55;

/**
 * How aggressively each tick "catches up" to the latest target text.
 * Each tick reveals `ceil(lag / CATCH_UP_DIVISOR)` more characters, so
 * a bigger divisor = fewer characters per tick = slower reveal.
 *
 * 20 gives a smooth slow-motion feel: short messages take ~2 seconds,
 * longer ones taper down gracefully without making the user wait an
 * uncomfortable length of time for the bubble to settle.
 */
const CATCH_UP_DIVISOR = 20;

/**
 * Typewriter renderer for a chat bubble. Reveals `text` one chunk at a
 * time so the user sees words *appearing* rather than snapping in all
 * at once when the LLM reply lands. The output renders as plain text
 * inside whatever bubble wraps it — no caret, no extra UI, just a
 * smooth fill-in animation.
 *
 * Design notes:
 *
 * - **Catch-up biased speed.** Each tick advances by a fraction of the
 *   current lag, so a 200-char chunk renders in roughly the same time
 *   as a 10-char chunk — but never instantly, even for a one-shot
 *   reply, because the catch-up divisor caps how many chars land per
 *   tick. Tune via the two constants above.
 * - **Correction-aware.** If the target text changes to something that
 *   doesn't extend what we've already shown, rewind to the longest
 *   common prefix and resume from there — never restart from empty.
 * - **Stops cleanly.** Once displayed === text, the tick loop ends. No
 *   background timers running on a settled bubble.
 */
export function TypewriterText({
  text,
  textStyle,
  onSettled,
}: {
  text: string;
  textStyle: StyleProp<TextStyle>;
  /**
   * Called once when the visible text has fully caught up to `text` and
   * no more updates are pending. Used by the chat screen to swap the
   * typewriter for a plain (selectable) `<Text>` after the reveal
   * animation completes. Fires from a setTimeout, so it's safe to call
   * setState from within.
   */
  onSettled?: () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const displayedRef = useRef('');
  const targetRef = useRef(text);
  // Latest onSettled in a ref so the effect deps stay [text] and we
  // don't re-start the typewriter every time the parent re-renders with
  // a new callback identity.
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    targetRef.current = text;
    if (text === displayedRef.current) return;

    if (!text.startsWith(displayedRef.current)) {
      const common = longestCommonPrefix(text, displayedRef.current);
      displayedRef.current = common;
      setDisplayed(common);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const current = displayedRef.current;
      const target = targetRef.current;
      if (current.length >= target.length) {
        timer = null;
        return;
      }
      const lag = target.length - current.length;
      // Catch-up speed: bigger lag = more chars per tick. Capped by
      // CATCH_UP_DIVISOR so even a one-shot, fully-loaded message still
      // animates instead of snapping in.
      const charsToAdd = Math.max(1, Math.ceil(lag / CATCH_UP_DIVISOR));
      const next = target.slice(0, current.length + charsToAdd);
      displayedRef.current = next;
      setDisplayed(next);
      if (next.length < target.length) {
        timer = setTimeout(tick, TICK_INTERVAL_MS);
      } else {
        timer = null;
        // Just hit the target — fire onSettled so the caller can swap
        // back to a plain (selectable) Text node.
        onSettledRef.current?.();
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [text]);

  return <Text style={textStyle}>{displayed}</Text>;
}

function longestCommonPrefix(a: string, b: string): string {
  let i = 0;
  const max = Math.min(a.length, b.length);
  while (i < max && a[i] === b[i]) i++;
  return a.slice(0, i);
}
