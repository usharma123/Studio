import { describe, expect, it } from "vite-plus/test";

import {
  createAnimationFrameBatcher,
  createTrailingBatcher,
  type AnimationFrameClock,
  type TimeoutClock,
} from "./eventBatcher";

function createClock() {
  const callbacks: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  const clock: AnimationFrameClock = {
    request(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel(frameId) {
      cancelled.push(frameId);
    },
  };
  return { callbacks, cancelled, clock };
}

describe("createAnimationFrameBatcher", () => {
  it("publishes only the latest value once per frame", () => {
    const { callbacks, clock } = createClock();
    const published: number[] = [];
    const batcher = createAnimationFrameBatcher((value: number) => published.push(value), clock);

    batcher.schedule(1);
    batcher.schedule(2);
    batcher.schedule(3);

    expect(callbacks).toHaveLength(1);
    callbacks[0]?.(0);
    expect(published).toEqual([3]);
  });

  it("flushes the latest value immediately and cancels the queued frame", () => {
    const { callbacks, cancelled, clock } = createClock();
    const published: number[] = [];
    const batcher = createAnimationFrameBatcher((value: number) => published.push(value), clock);

    batcher.schedule(4);
    batcher.schedule(5);
    batcher.flush();

    expect(callbacks).toHaveLength(1);
    expect(cancelled).toEqual([1]);
    expect(published).toEqual([5]);
  });

  it("drops queued work when cancelled", () => {
    const { callbacks, cancelled, clock } = createClock();
    const published: number[] = [];
    const batcher = createAnimationFrameBatcher((value: number) => published.push(value), clock);

    batcher.schedule(6);
    batcher.cancel();
    callbacks[0]?.(0);

    expect(cancelled).toEqual([1]);
    expect(published).toEqual([]);
  });
});

describe("createTrailingBatcher", () => {
  it("resets the delay and publishes only the last value in a burst", () => {
    const callbacks = new Map<number, () => void>();
    const cleared: number[] = [];
    let nextId = 0;
    const clock: TimeoutClock = {
      set(callback) {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      },
      clear(timeoutId) {
        cleared.push(timeoutId);
        callbacks.delete(timeoutId);
      },
    };
    const published: number[] = [];
    const batcher = createTrailingBatcher((value: number) => published.push(value), 100, clock);

    batcher.schedule(1);
    batcher.schedule(2);
    batcher.schedule(3);
    callbacks.get(3)?.();

    expect(cleared).toEqual([1, 2]);
    expect(published).toEqual([3]);
  });

  it("drops a pending trailing value when cancelled", () => {
    const callbacks = new Map<number, () => void>();
    const clock: TimeoutClock = {
      set(callback) {
        callbacks.set(1, callback);
        return 1;
      },
      clear(timeoutId) {
        callbacks.delete(timeoutId);
      },
    };
    const published: number[] = [];
    const batcher = createTrailingBatcher((value: number) => published.push(value), 100, clock);

    batcher.schedule(1);
    const staleCallback = callbacks.get(1);
    batcher.cancel();
    staleCallback?.();

    expect(published).toEqual([]);
  });
});
