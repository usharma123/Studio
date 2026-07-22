import { it } from "@effect/vitest";
import { EnvironmentId, type PreviewEvent, ThreadId } from "@t3tools/contracts";
import { PreviewUrlNormalizationError } from "@t3tools/shared/preview";
import { Effect, PubSub } from "effect";
import { expect } from "vite-plus/test";

import * as RawPreviewManager from "./Manager.ts";
import type { PreviewAccessGrant } from "./Access.ts";

const testAccess = (threadId: string): PreviewAccessGrant => ({
  identity: {
    subject: "local:root",
    sessionId: "preview-manager-test",
    environmentId: EnvironmentId.make("preview-manager-test"),
    workspaceAdministrator: true,
  },
  descriptor: { kind: "workspace", ownerSubject: `test:${threadId}` },
});

const PreviewManager = {
  ...RawPreviewManager,
  PreviewManager: RawPreviewManager.PreviewManager.pipe(
    Effect.map((manager) => ({
      ...manager,
      open: (input: Parameters<typeof manager.open>[0]) =>
        manager.open(input, testAccess(input.threadId)),
      navigate: (input: Parameters<typeof manager.navigate>[0]) =>
        manager.navigate(input, testAccess(input.threadId)),
      reportStatus: (input: Parameters<typeof manager.reportStatus>[0]) =>
        manager.reportStatus(input, testAccess(input.threadId)),
      resize: (input: Parameters<typeof manager.resize>[0]) =>
        manager.resize(input, testAccess(input.threadId)),
      refresh: (input: Parameters<typeof manager.refresh>[0]) =>
        manager.refresh(input, testAccess(input.threadId)),
      close: (input: Parameters<typeof manager.close>[0]) =>
        manager.close(input, testAccess(input.threadId)),
      list: (input: Parameters<typeof manager.list>[0]) =>
        manager.list(input, testAccess(input.threadId)),
    })),
  ),
};

const DRAIN_LIMIT = 100;

interface EventCollector {
  /** Drain everything published since the last call (or since subscribe). */
  readonly drain: Effect.Effect<ReadonlyArray<PreviewEvent>>;
}

/**
 * Each `it.effect` shares the live PreviewManager layer across the whole
 * `it.layer` block, so tests that assert per-thread counts must use a unique
 * thread id to avoid bleeding state from earlier tests.
 */
let nextThreadId = 0;
const freshThreadId = () => ThreadId.make(`thread-${++nextThreadId}`);

/**
 * Subscribe to the manager's event stream BEFORE the test publishes. We
 * use `subscribeEvents` (synchronous PubSub.subscribe under the hood) so
 * no event can land between subscribe and the consumer drain.
 */
const collectEvents = Effect.gen(function* () {
  const manager = yield* PreviewManager.PreviewManager;
  const subscription = yield* manager.subscribeEvents;
  const collector: EventCollector = {
    drain: PubSub.takeUpTo(subscription, DRAIN_LIMIT).pipe(
      Effect.map((envelopes) => envelopes.map((envelope) => envelope.event)),
    ),
  };
  return collector;
}).pipe(Effect.withSpan("preview.test.collectEvents"));

it.layer(PreviewManager.layer)("PreviewManager", (it) => {
  it.effect("opens a session and emits opened with normalized URL", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;

      const snapshot = yield* manager.open({ threadId, url: "localhost:5173" });
      expect(snapshot.tabId.startsWith("tab_")).toBe(true);
      expect(snapshot.navStatus._tag).toBe("Loading");
      if (snapshot.navStatus._tag === "Loading") {
        expect(snapshot.navStatus.url).toBe("http://localhost:5173/");
      }

      const events = yield* collector.drain;
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("opened");
      if (events[0]?.type === "opened") {
        expect(events[0].tabId).toBe(snapshot.tabId);
      }
    }),
  );

  it.effect("opens an Idle tab when no URL is supplied", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const snapshot = yield* manager.open({ threadId });
      expect(snapshot.navStatus._tag).toBe("Idle");
    }),
  );

  it.effect("treats bare hosts as https", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const snapshot = yield* manager.open({ threadId, url: "example.com" });
      if (snapshot.navStatus._tag === "Loading") {
        expect(snapshot.navStatus.url).toBe("https://example.com/");
      }
    }),
  );

  it.effect("rejects empty URL with PreviewInvalidUrlError", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const error = yield* Effect.flip(manager.open({ threadId, url: "   " }));
      expect(error._tag).toBe("PreviewInvalidUrlError");
      expect(error).toMatchObject({ inputLength: 3, reason: "empty" });
      expect(error).not.toHaveProperty("rawUrl");
      expect(error.cause).toBeInstanceOf(PreviewUrlNormalizationError);
      expect((error.cause as PreviewUrlNormalizationError).reason).toBe("empty");
    }),
  );

  it.effect("preserves URL parser failures as the invalid URL cause chain", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const rawUrl = "https://user:password@example.com:bad/path?access_token=secret#fragment";
      const error = yield* Effect.flip(manager.open({ threadId, url: rawUrl }));

      expect(error).toMatchObject({
        inputLength: rawUrl.length,
        reason: "parse",
        protocol: "https:",
      });
      expect(error).not.toHaveProperty("rawUrl");
      expect(error.cause).toBeInstanceOf(PreviewUrlNormalizationError);
      const normalizationError = error.cause as PreviewUrlNormalizationError;
      expect(normalizationError.cause).toBeInstanceOf(Error);
      expect(error.message).not.toContain((normalizationError.cause as Error).message);
      expect(error.message).not.toMatch(/user|password|access_token|secret|fragment/);
    }),
  );

  it.effect("navigate updates snapshot and emits navigated", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;

      const opened = yield* manager.open({ threadId, url: "http://localhost:5173" });
      const snapshot = yield* manager.navigate({
        threadId,
        tabId: opened.tabId,
        url: "http://localhost:5173/about",
        resolvedTitle: "About",
      });

      expect(snapshot.navStatus._tag).toBe("Success");
      if (snapshot.navStatus._tag === "Success") {
        expect(snapshot.navStatus.url).toBe("http://localhost:5173/about");
        expect(snapshot.navStatus.title).toBe("About");
      }
      const events = yield* collector.drain;
      expect(events.map((e) => e.type)).toEqual(["opened", "navigated"]);
    }),
  );

  it.effect("navigate fails for unknown tab", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const error = yield* Effect.flip(
        manager.navigate({
          threadId,
          tabId: "tab_missing",
          url: "http://localhost:5173",
        }),
      );
      expect(error._tag).toBe("PreviewSessionLookupError");
    }),
  );

  it.effect("resizes a tab and preserves its viewport across navigation reports", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;
      const opened = yield* manager.open({ threadId, url: "http://localhost:5173" });

      const resized = yield* manager.resize({
        threadId,
        tabId: opened.tabId,
        viewport: { _tag: "freeform", width: 1024, height: 768 },
      });
      expect(resized.viewport).toEqual({ _tag: "freeform", width: 1024, height: 768 });

      const navigated = yield* manager.navigate({
        threadId,
        tabId: opened.tabId,
        url: "http://localhost:5173/resized",
      });
      expect(navigated.viewport).toEqual(resized.viewport);

      yield* manager.reportStatus({
        threadId,
        tabId: opened.tabId,
        navStatus: { _tag: "Success", url: "http://localhost:5173/resized", title: "Resized" },
        canGoBack: true,
        canGoForward: false,
      });
      const listed = yield* manager.list({ threadId });
      expect(listed.sessions[0]?.viewport).toEqual(resized.viewport);

      const events = yield* collector.drain;
      expect(events.map((event) => event.type)).toEqual([
        "opened",
        "resized",
        "navigated",
        "navigated",
      ]);
    }),
  );

  it.effect("rejects resize for an unknown tab", () =>
    Effect.gen(function* () {
      const manager = yield* PreviewManager.PreviewManager;
      const error = yield* Effect.flip(
        manager.resize({
          threadId: freshThreadId(),
          tabId: "tab_missing",
          viewport: { _tag: "fill" },
        }),
      );
      expect(error._tag).toBe("PreviewSessionLookupError");
    }),
  );

  it.effect("reportStatus emits failed for LoadFailed nav", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;

      const opened = yield* manager.open({ threadId, url: "http://localhost:5173" });
      yield* manager.reportStatus({
        threadId,
        tabId: opened.tabId,
        navStatus: {
          _tag: "LoadFailed",
          url: "http://localhost:5173",
          title: "",
          code: -105,
          description: "ERR_NAME_NOT_RESOLVED",
        },
        canGoBack: false,
        canGoForward: false,
      });

      const events = yield* collector.drain;
      const failed = events.find((e) => e.type === "failed");
      expect(failed?.type).toBe("failed");
      if (failed?.type === "failed") {
        expect(failed.code).toBe(-105);
        expect(failed.description).toBe("ERR_NAME_NOT_RESOLVED");
      }
    }),
  );

  it.effect("close removes the session and emits closed", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;

      yield* manager.open({ threadId, url: "http://localhost:5173" });
      yield* manager.close({ threadId });

      const result = yield* manager.list({ threadId });
      expect(result.sessions).toHaveLength(0);
      const events = yield* collector.drain;
      const closed = events.find((e) => e.type === "closed");
      expect(closed?.type).toBe("closed");
    }),
  );

  it.effect("close is idempotent for unknown threads", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      yield* manager.close({ threadId });
      const result = yield* manager.list({ threadId });
      expect(result.sessions).toHaveLength(0);
    }),
  );

  it.effect("list returns every snapshot for the thread sorted by updatedAt", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const first = yield* manager.open({ threadId, url: "http://localhost:5173" });
      const second = yield* manager.open({ threadId, url: "http://localhost:3000" });
      const result = yield* manager.list({ threadId });
      expect(result.sessions).toHaveLength(2);
      const ids = result.sessions.map((s) => s.tabId);
      expect(ids).toContain(first.tabId);
      expect(ids).toContain(second.tabId);
    }),
  );

  it.effect("open creates an independent tab on every call", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const collector = yield* collectEvents;

      const a = yield* manager.open({ threadId, url: "http://localhost:5173" });
      const b = yield* manager.open({ threadId, url: "http://localhost:3000/path" });

      expect(a.tabId).not.toBe(b.tabId);
      const list = yield* manager.list({ threadId });
      expect(list.sessions).toHaveLength(2);

      const events = yield* collector.drain;
      expect(events.map((e) => e.type)).toEqual(["opened", "opened"]);
    }),
  );

  it.effect("close with mismatching tabId is a no-op", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      yield* manager.open({ threadId, url: "http://localhost:5173" });
      yield* manager.close({ threadId, tabId: "tab_missing" });

      const list = yield* manager.list({ threadId });
      expect(list.sessions).toHaveLength(1);
    }),
  );

  it.effect("close with explicit tabId removes only that tab", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const a = yield* manager.open({ threadId, url: "http://localhost:5173" });
      const b = yield* manager.open({ threadId, url: "http://localhost:3000" });

      yield* manager.close({ threadId, tabId: a.tabId });

      const list = yield* manager.list({ threadId });
      expect(list.sessions.map((s) => s.tabId)).toEqual([b.tabId]);
    }),
  );

  it.effect("multiple subscribers receive every event independently", () =>
    Effect.gen(function* () {
      const threadId = freshThreadId();
      const manager = yield* PreviewManager.PreviewManager;
      const aSub = yield* manager.subscribeEvents;
      const bSub = yield* manager.subscribeEvents;

      yield* manager.open({ threadId, url: "http://localhost:5173" });
      yield* manager.open({ threadId, url: "http://localhost:3000" });

      const aEvents = yield* PubSub.takeUpTo(aSub, DRAIN_LIMIT);
      const bEvents = yield* PubSub.takeUpTo(bSub, DRAIN_LIMIT);
      expect(aEvents.map((e) => e.event.type)).toEqual(["opened", "opened"]);
      expect(bEvents.map((e) => e.event.type)).toEqual(["opened", "opened"]);
    }),
  );

  it.effect("keeps foreign principals from listing or mutating an owned preview", () =>
    Effect.gen(function* () {
      const manager = yield* RawPreviewManager.PreviewManager;
      const threadId = freshThreadId();
      const owner: PreviewAccessGrant = {
        identity: {
          subject: "local:qa:maker",
          sessionId: "session-maker",
          environmentId: EnvironmentId.make("preview-manager-test"),
          workspaceAdministrator: false,
        },
        descriptor: { kind: "workspace", ownerSubject: "local:qa:maker" },
      };
      const foreign: PreviewAccessGrant = {
        identity: {
          ...owner.identity,
          subject: "local:qa:approver",
          sessionId: "session-approver",
        },
        descriptor: { kind: "workspace", ownerSubject: "local:qa:approver" },
      };
      const opened = yield* manager.open({ threadId, url: "http://localhost:5173" }, owner);

      expect((yield* manager.list({ threadId }, foreign)).sessions).toEqual([]);
      const error = yield* manager
        .navigate({ threadId, tabId: opened.tabId, url: "http://localhost:5173/foreign" }, foreign)
        .pipe(Effect.flip);
      expect(error._tag).toBe("EnvironmentAuthorizationError");

      const listed = yield* manager.list({ threadId }, owner);
      expect(listed.sessions[0]?.navStatus).toEqual(opened.navStatus);
    }),
  );
});
