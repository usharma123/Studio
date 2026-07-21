/**
 * In-memory PreviewManager implementation.
 *
 * Sessions are keyed by `(threadId, tabId)`; a single thread can host
 * multiple tabs (browser-style). `open` always creates a new tab — tab
 * lifecycle is owned by the renderer.
 *
 * Events are published via Effect's `PubSub`, so subscriber failures are
 * isolated from the publishing call (a closed WS subscriber queue cannot
 * fail an in-progress `navigate()`).
 */
import {
  AuthPreviewOperateScope,
  EnvironmentAuthorizationError,
  type PreviewCloseInput,
  type PreviewEvent,
  type PreviewError,
  PreviewInvalidUrlError,
  type PreviewListInput,
  type PreviewListResult,
  type PreviewNavigateInput,
  type PreviewOpenInput,
  type PreviewRefreshInput,
  type PreviewReportStatusInput,
  type PreviewResizeInput,
  FILL_PREVIEW_VIEWPORT,
  PreviewSessionLookupError,
  type PreviewSessionSnapshot,
} from "@t3tools/contracts";
import {
  isPreviewUrlNormalizationError,
  newPreviewTabId,
  normalizePreviewUrl,
} from "@t3tools/shared/preview";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

import {
  type PreviewAccessDescriptor,
  type PreviewAccessGrant,
  previewGrantAllows,
} from "./Access.ts";

export interface PreviewEventEnvelope {
  readonly event: PreviewEvent;
  readonly access: PreviewAccessDescriptor;
}

type AuthorizedPreviewError = PreviewError | EnvironmentAuthorizationError;

export class PreviewManager extends Context.Service<
  PreviewManager,
  {
    readonly open: (
      input: PreviewOpenInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<PreviewSessionSnapshot, AuthorizedPreviewError>;
    readonly navigate: (
      input: PreviewNavigateInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<PreviewSessionSnapshot, AuthorizedPreviewError>;
    readonly reportStatus: (
      input: PreviewReportStatusInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<void, AuthorizedPreviewError>;
    readonly resize: (
      input: PreviewResizeInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<PreviewSessionSnapshot, AuthorizedPreviewError>;
    readonly refresh: (
      input: PreviewRefreshInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<void, AuthorizedPreviewError>;
    readonly close: (
      input: PreviewCloseInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<void, AuthorizedPreviewError>;
    readonly list: (
      input: PreviewListInput,
      access: PreviewAccessGrant,
    ) => Effect.Effect<PreviewListResult, EnvironmentAuthorizationError>;
    readonly getAccessDescriptor: (
      threadId: string,
    ) => Effect.Effect<Option.Option<PreviewAccessDescriptor>>;
    readonly events: Stream.Stream<PreviewEventEnvelope>;
    readonly subscribeEvents: Effect.Effect<
      PubSub.Subscription<PreviewEventEnvelope>,
      never,
      Scope.Scope
    >;
  }
>()("t3/preview/Manager/PreviewManager") {}

interface PreviewSessionState {
  readonly threadId: string;
  readonly tabId: string;
  readonly snapshot: PreviewSessionSnapshot;
  readonly access: PreviewAccessDescriptor;
}

interface ManagerState {
  /** All sessions across every thread, keyed by `${threadId}\u0000${tabId}`. */
  readonly sessions: ReadonlyMap<string, PreviewSessionState>;
}

const initialState: ManagerState = { sessions: new Map() };

const compositeKey = (threadId: string, tabId: string): string => `${threadId}\u0000${tabId}`;

const sessionsForThread = (
  state: ManagerState,
  threadId: string,
): ReadonlyArray<PreviewSessionState> => {
  const out: PreviewSessionState[] = [];
  for (const session of state.sessions.values()) {
    if (session.threadId === threadId) out.push(session);
  }
  return out;
};

const normalizeUrl = (rawUrl: string): Effect.Effect<string, PreviewInvalidUrlError> =>
  Effect.try({
    try: () => normalizePreviewUrl(rawUrl),
    catch: (cause) => {
      if (isPreviewUrlNormalizationError(cause)) {
        return new PreviewInvalidUrlError({
          inputLength: cause.inputLength,
          reason: cause.reason,
          protocol: cause.protocol,
          cause,
        });
      }

      return new PreviewInvalidUrlError({
        inputLength: rawUrl.length,
        reason: "unexpected",
        cause,
      });
    },
  });

const currentIsoTimestamp = DateTime.now.pipe(Effect.map(DateTime.formatIso));

const accessDenied = () =>
  new EnvironmentAuthorizationError({
    message: "The authenticated principal cannot access this preview resource.",
    requiredScope: AuthPreviewOperateScope,
  });

const buildLoadingSnapshot = (input: {
  readonly threadId: string;
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
  readonly updatedAt: string;
}): PreviewSessionSnapshot => ({
  threadId: input.threadId,
  tabId: input.tabId,
  navStatus: { _tag: "Loading", url: input.url, title: input.title },
  canGoBack: false,
  canGoForward: false,
  viewport: FILL_PREVIEW_VIEWPORT,
  updatedAt: input.updatedAt,
});

const buildIdleSnapshot = (input: {
  readonly threadId: string;
  readonly tabId: string;
  readonly updatedAt: string;
}): PreviewSessionSnapshot => ({
  threadId: input.threadId,
  tabId: input.tabId,
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  viewport: FILL_PREVIEW_VIEWPORT,
  updatedAt: input.updatedAt,
});

export const make = Effect.gen(function* PreviewManagerMake() {
  const stateRef = yield* SynchronizedRef.make<ManagerState>(initialState);
  // Unbounded PubSub is fine here — events are tiny and we don't want to
  // block publishers if a subscriber is slow. WS clients backpressure on
  // their own queues downstream.
  const eventsPubSub = yield* PubSub.unbounded<PreviewEventEnvelope>();
  const events: Stream.Stream<PreviewEventEnvelope> = Stream.fromPubSub(eventsPubSub);

  /**
   * Atomic read-modify-write over the session for `(threadId, tabId)`. The
   * mutator runs under the SynchronizedRef so concurrent writers cannot
   * interleave. Lookup failures travel through the modify result so both
   * branches yield the same `[A, S]` shape `modifyEffect` requires.
   *
   * The event is published INSIDE the lock so observers see events in the
   * same order as the underlying state transitions. Publishing an unbounded
   * PubSub is non-blocking, so this is cheap.
   */
  const mutateExistingSession = <R, E>(
    threadId: string,
    tabId: string,
    access: PreviewAccessGrant,
    mutator: (
      session: PreviewSessionState,
    ) => Effect.Effect<{ next: PreviewSessionState; emit: PreviewEvent | null; result: R }, E>,
  ): Effect.Effect<R, E | PreviewSessionLookupError | EnvironmentAuthorizationError> => {
    type ModifyResult =
      | { kind: "fail"; error: PreviewSessionLookupError | EnvironmentAuthorizationError }
      | { kind: "ok"; result: R };

    return SynchronizedRef.modifyEffect(stateRef, (state) => {
      const session = state.sessions.get(compositeKey(threadId, tabId));
      if (!session) {
        return Effect.succeed([
          { kind: "fail", error: new PreviewSessionLookupError({ threadId, tabId }) },
          state,
        ] as readonly [ModifyResult, ManagerState]);
      }
      if (!previewGrantAllows(access, session.access)) {
        return Effect.succeed([{ kind: "fail", error: accessDenied() }, state] as const);
      }
      return mutator(session).pipe(
        Effect.flatMap(
          Effect.fn("PreviewManager.commitMutation")(function* ({ next, emit, result }) {
            if (emit) yield* PubSub.publish(eventsPubSub, { event: emit, access: session.access });
            const sessions = new Map(state.sessions);
            sessions.set(compositeKey(threadId, tabId), next);
            return [{ kind: "ok", result } as ModifyResult, { sessions }] as readonly [
              ModifyResult,
              ManagerState,
            ];
          }),
        ),
      );
    }).pipe(
      Effect.flatMap((modify) =>
        modify.kind === "fail" ? Effect.fail(modify.error) : Effect.succeed(modify.result),
      ),
    );
  };

  const open: PreviewManager["Service"]["open"] = Effect.fn("PreviewManager.open")(
    function* (input, access) {
      const tabId = newPreviewTabId();
      const updatedAt = yield* currentIsoTimestamp;
      const snapshot = input.url
        ? buildLoadingSnapshot({
            threadId: input.threadId,
            tabId,
            url: yield* normalizeUrl(input.url),
            title: "",
            updatedAt,
          })
        : buildIdleSnapshot({ threadId: input.threadId, tabId, updatedAt });
      const effectiveAccess = yield* SynchronizedRef.modify(stateRef, (state) => {
        const existing = sessionsForThread(state, input.threadId)[0]?.access;
        if (existing && !previewGrantAllows(access, existing)) {
          return [Option.none<PreviewAccessDescriptor>(), state] as const;
        }
        const descriptor = existing ?? access.descriptor;
        const sessions = new Map(state.sessions);
        sessions.set(compositeKey(input.threadId, tabId), {
          threadId: input.threadId,
          tabId,
          snapshot,
          access: descriptor,
        });
        return [Option.some(descriptor), { sessions }] as const;
      });
      if (Option.isNone(effectiveAccess)) return yield* accessDenied();
      yield* PubSub.publish(eventsPubSub, {
        access: effectiveAccess.value,
        event: {
          type: "opened",
          threadId: input.threadId,
          tabId,
          createdAt: snapshot.updatedAt,
          snapshot,
        },
      });
      return snapshot;
    },
  );

  const navigate: PreviewManager["Service"]["navigate"] = Effect.fn("PreviewManager.navigate")(
    function* (input, access) {
      const url = yield* normalizeUrl(input.url);
      return yield* mutateExistingSession(
        input.threadId,
        input.tabId,
        access,
        Effect.fn("PreviewManager.navigateSession")(function* (session) {
          const updatedAt = yield* currentIsoTimestamp;
          const previousTitle =
            session.snapshot.navStatus._tag === "Idle" ? "" : session.snapshot.navStatus.title;
          const resolvedTitle = input.resolvedTitle ?? previousTitle;
          const snapshot: PreviewSessionSnapshot = {
            threadId: session.threadId,
            tabId: session.tabId,
            navStatus: { _tag: "Success", url, title: resolvedTitle },
            canGoBack: session.snapshot.canGoBack,
            canGoForward: session.snapshot.canGoForward,
            viewport: session.snapshot.viewport ?? FILL_PREVIEW_VIEWPORT,
            updatedAt,
          };
          return {
            next: { ...session, snapshot },
            emit: {
              type: "navigated",
              threadId: session.threadId,
              tabId: session.tabId,
              createdAt: snapshot.updatedAt,
              snapshot,
            },
            result: snapshot,
          };
        }),
      );
    },
  );

  const reportStatus: PreviewManager["Service"]["reportStatus"] = Effect.fn(
    "PreviewManager.reportStatus",
  )(function* (input, access) {
    yield* mutateExistingSession(
      input.threadId,
      input.tabId,
      access,
      Effect.fn("PreviewManager.reportSessionStatus")(function* (session) {
        const updatedAt = yield* currentIsoTimestamp;
        const snapshot: PreviewSessionSnapshot = {
          threadId: session.threadId,
          tabId: session.tabId,
          navStatus: input.navStatus,
          canGoBack: input.canGoBack,
          canGoForward: input.canGoForward,
          viewport: session.snapshot.viewport ?? FILL_PREVIEW_VIEWPORT,
          updatedAt,
        };
        const emit: PreviewEvent =
          input.navStatus._tag === "LoadFailed"
            ? {
                type: "failed",
                threadId: session.threadId,
                tabId: session.tabId,
                createdAt: snapshot.updatedAt,
                url: input.navStatus.url,
                title: input.navStatus.title,
                code: input.navStatus.code,
                description: input.navStatus.description,
              }
            : {
                type: "navigated",
                threadId: session.threadId,
                tabId: session.tabId,
                createdAt: snapshot.updatedAt,
                snapshot,
              };
        return {
          next: { ...session, snapshot },
          emit,
          result: undefined as void,
        };
      }),
    );
  });

  const resize: PreviewManager["Service"]["resize"] = Effect.fn("PreviewManager.resize")(
    function* (input, access) {
      return yield* mutateExistingSession(
        input.threadId,
        input.tabId,
        access,
        Effect.fn("PreviewManager.resizeSession")(function* (session) {
          const updatedAt = yield* currentIsoTimestamp;
          const snapshot: PreviewSessionSnapshot = {
            ...session.snapshot,
            viewport: input.viewport,
            updatedAt,
          };
          return {
            next: { ...session, snapshot },
            emit: {
              type: "resized",
              threadId: session.threadId,
              tabId: session.tabId,
              createdAt: snapshot.updatedAt,
              snapshot,
            },
            result: snapshot,
          };
        }),
      );
    },
  );

  const refresh: PreviewManager["Service"]["refresh"] = Effect.fn("PreviewManager.refresh")(
    function* (input, access) {
      // Verify the session exists; the desktop bridge handles the actual reload
      // and will report progress back via `reportStatus`. No event emitted.
      yield* mutateExistingSession(input.threadId, input.tabId, access, (session) =>
        Effect.succeed({ next: session, emit: null, result: undefined as void }),
      );
    },
  );

  const close: PreviewManager["Service"]["close"] = Effect.fn("PreviewManager.close")(
    function* (input, access) {
      const createdAt = yield* currentIsoTimestamp;
      const events = yield* SynchronizedRef.modify(stateRef, (state) => {
        const sessions = new Map(state.sessions);
        const candidates = input.tabId
          ? [state.sessions.get(compositeKey(input.threadId, input.tabId))].filter(
              (entry): entry is PreviewSessionState => entry !== undefined,
            )
          : sessionsForThread(state, input.threadId);
        const targets = candidates.filter((target) => previewGrantAllows(access, target.access));
        if (candidates.length > 0 && targets.length !== candidates.length) {
          return [Option.none<ReadonlyArray<PreviewEventEnvelope>>(), state] as const;
        }
        const envelopes: PreviewEventEnvelope[] = [];
        for (const target of targets) {
          sessions.delete(compositeKey(target.threadId, target.tabId));
          const event: PreviewEvent = {
            type: "closed",
            threadId: target.threadId,
            tabId: target.tabId,
            createdAt,
          };
          envelopes.push({
            event,
            access: target.access,
          });
        }
        if (envelopes.length === 0) {
          return [Option.some(envelopes), state] as const;
        }
        return [Option.some(envelopes), { sessions }] as const;
      });
      if (Option.isNone(events)) return yield* accessDenied();
      if (events.value.length > 0) {
        yield* Effect.forEach(events.value, (event) => PubSub.publish(eventsPubSub, event), {
          discard: true,
        });
      }
    },
  );

  const list: PreviewManager["Service"]["list"] = Effect.fn("PreviewManager.list")(
    function* (input, access) {
      return yield* SynchronizedRef.get(stateRef).pipe(
        Effect.map(
          (state): PreviewListResult => ({
            sessions: sessionsForThread(state, input.threadId)
              .filter((session) => previewGrantAllows(access, session.access))
              .map((s) => s.snapshot)
              .toSorted((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
          }),
        ),
      );
    },
  );

  const getAccessDescriptor: PreviewManager["Service"]["getAccessDescriptor"] = Effect.fn(
    "PreviewManager.getAccessDescriptor",
  )((threadId) =>
    SynchronizedRef.get(stateRef).pipe(
      Effect.map((state) => Option.fromNullishOr(sessionsForThread(state, threadId)[0]?.access)),
    ),
  );

  return PreviewManager.of({
    open,
    navigate,
    reportStatus,
    resize,
    refresh,
    close,
    list,
    getAccessDescriptor,
    events,
    subscribeEvents: PubSub.subscribe(eventsPubSub),
  });
}).pipe(Effect.withSpan("PreviewManager.make"));

export const layer = Layer.effect(PreviewManager, make);
