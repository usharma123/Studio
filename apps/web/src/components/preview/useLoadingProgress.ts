import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 120;
const FADE_OUT_DELAY_MS = 220;
const SEED_PERCENT = 4;
const ASYMPTOTE_PERCENT = 90;
const APPROACH_FACTOR = 0.08;
const MIN_INCREMENT = 0.5;

/**
 * Indeterminate progress simulator for the preview chrome's loading bar.
 * Animates 0 → 90% asymptotically while `loading` is true, snaps to 100%
 * on release, then resets after a short pause.
 *
 * The displayed seed and completion values are derived from `loading`; the
 * timer only owns the intermediate progress value. This keeps render pure
 * and lets the effect cleanly own every timer it allocates.
 */
export function useLoadingProgress(loading: boolean): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading) {
      const timer = window.setTimeout(() => setProgress(0), FADE_OUT_DELAY_MS);
      return () => window.clearTimeout(timer);
    }

    const interval = window.setInterval(() => {
      setProgress((value) => {
        const current = value > 0 && value < 95 ? value : SEED_PERCENT;
        if (current >= ASYMPTOTE_PERCENT) return current;
        const remaining = ASYMPTOTE_PERCENT - current;
        const increment = Math.max(MIN_INCREMENT, remaining * APPROACH_FACTOR);
        return Math.min(ASYMPTOTE_PERCENT, current + increment);
      });
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loading]);

  if (loading) {
    return progress === 0 ? SEED_PERCENT : progress;
  }
  return progress === 0 ? 0 : 100;
}
