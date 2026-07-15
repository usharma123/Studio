import { describe, expect, it } from "vite-plus/test";

import { isDetachedQaAssistantWindow } from "./qaAssistantWindow";

describe("isDetachedQaAssistantWindow", () => {
  it("recognizes the desktop assistant query before a hash route", () => {
    expect(
      isDetachedQaAssistantWindow(
        new URL("codex-studio-dev://app/?qaAssistant=detached#/local/thread-1"),
      ),
    ).toBe(true);
  });

  it("does not treat a regular thread window as detached", () => {
    expect(isDetachedQaAssistantWindow(new URL("codex-studio-dev://app/#/local/thread-1"))).toBe(
      false,
    );
  });
});
