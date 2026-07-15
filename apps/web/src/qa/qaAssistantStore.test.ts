import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "~/lib/storage";

import { createQaAssistantStore, selectQaAssistantPresentation } from "./qaAssistantStore";

const threadRef = scopeThreadRef("local" as EnvironmentId, ThreadId.make("thread-release-1"));

describe("qaAssistantStore", () => {
  it("keeps presentation state scoped to the release thread", () => {
    const store = createQaAssistantStore(createMemoryStorage());

    expect(selectQaAssistantPresentation(store.getState().byThreadKey, threadRef)).toBe("closed");
    store.getState().open(threadRef);
    expect(selectQaAssistantPresentation(store.getState().byThreadKey, threadRef)).toBe("open");
    store.getState().minimize(threadRef);
    expect(selectQaAssistantPresentation(store.getState().byThreadKey, threadRef)).toBe(
      "minimized",
    );
    store.getState().markDetached(threadRef);
    expect(selectQaAssistantPresentation(store.getState().byThreadKey, threadRef)).toBe("detached");
    store.getState().close(threadRef);
    expect(selectQaAssistantPresentation(store.getState().byThreadKey, threadRef)).toBe("closed");
  });
});
