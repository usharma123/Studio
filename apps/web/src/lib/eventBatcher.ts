export interface AnimationFrameClock {
  readonly request: (callback: FrameRequestCallback) => number;
  readonly cancel: (frameId: number) => void;
}

export interface AnimationFrameBatcher<T> {
  readonly schedule: (value: T) => void;
  readonly flush: () => void;
  readonly cancel: () => void;
}

export interface TimeoutClock {
  readonly set: (callback: () => void, delayMs: number) => number;
  readonly clear: (timeoutId: number) => void;
}

export interface TrailingBatcher<T> {
  readonly schedule: (value: T) => void;
  readonly flush: () => void;
  readonly cancel: () => void;
}

const browserAnimationFrameClock: AnimationFrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (frameId) => cancelAnimationFrame(frameId),
};

const browserTimeoutClock: TimeoutClock = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (timeoutId) => window.clearTimeout(timeoutId),
};

/**
 * Coalesces high-frequency input into at most one callback per animation frame.
 * The most recently scheduled value wins, while flush/cancel make drag-end and
 * teardown behavior deterministic.
 */
export function createAnimationFrameBatcher<T>(
  onFrame: (value: T) => void,
  clock: AnimationFrameClock = browserAnimationFrameClock,
): AnimationFrameBatcher<T> {
  let frameId: number | null = null;
  let hasPendingValue = false;
  let pendingValue: T | undefined;

  const runPending = () => {
    frameId = null;
    if (!hasPendingValue) return;
    const value = pendingValue as T;
    hasPendingValue = false;
    pendingValue = undefined;
    onFrame(value);
  };

  return {
    schedule(value) {
      pendingValue = value;
      hasPendingValue = true;
      if (frameId !== null) return;
      frameId = clock.request(runPending);
    },
    flush() {
      if (!hasPendingValue) return;
      if (frameId !== null) {
        clock.cancel(frameId);
      }
      runPending();
    },
    cancel() {
      if (frameId !== null) {
        clock.cancel(frameId);
        frameId = null;
      }
      hasPendingValue = false;
      pendingValue = undefined;
    },
  };
}

/** Runs once after a burst of work settles, using the most recent value. */
export function createTrailingBatcher<T>(
  onSettle: (value: T) => void,
  delayMs: number,
  clock: TimeoutClock = browserTimeoutClock,
): TrailingBatcher<T> {
  let timeoutId: number | null = null;
  let hasPendingValue = false;
  let pendingValue: T | undefined;

  const runPending = () => {
    timeoutId = null;
    if (!hasPendingValue) return;
    const value = pendingValue as T;
    hasPendingValue = false;
    pendingValue = undefined;
    onSettle(value);
  };

  return {
    schedule(value) {
      pendingValue = value;
      hasPendingValue = true;
      if (timeoutId !== null) {
        clock.clear(timeoutId);
      }
      timeoutId = clock.set(runPending, delayMs);
    },
    flush() {
      if (!hasPendingValue) return;
      if (timeoutId !== null) {
        clock.clear(timeoutId);
      }
      runPending();
    },
    cancel() {
      if (timeoutId !== null) {
        clock.clear(timeoutId);
        timeoutId = null;
      }
      hasPendingValue = false;
      pendingValue = undefined;
    },
  };
}
