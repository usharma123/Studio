"use client";

import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  FILL_PREVIEW_VIEWPORT,
  type PreviewViewportSetting,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useComposerDraftStore } from "~/composerDraftStore";
import { previewAnnotationScreenshotFile } from "~/lib/previewAnnotation";
import { ensureLocalApi } from "~/localApi";
import {
  rememberPreviewUrl,
  updatePreviewServerSnapshot,
  useThreadPreviewState,
} from "~/previewStateStore";
import { resolveDiscoveredServerUrl } from "~/browser/browserTargetResolver";
import { useEnvironment, useEnvironmentHttpBaseUrl } from "~/state/environments";
import { previewEnvironment } from "~/state/preview";
import { useAtomCommand } from "~/state/use-atom-command";
import { previewBridge } from "./previewBridge";
import { subscribePreviewAction, type PreviewAction } from "./previewActionBus";
import { openPreviewSession } from "./openPreviewSession";
import { PreviewChromeRow } from "./PreviewChromeRow";
import { formatPreviewUrl } from "./previewUrlPresentation";
import { PreviewEmptyState } from "./PreviewEmptyState";
import { PreviewMoreMenu } from "./PreviewMoreMenu";
import {
  commitBrowserViewportChange,
  subscribeBrowserViewportChange,
} from "~/browser/browserViewportActions";
import { resolveResponsiveBrowserViewportSize } from "~/browser/browserViewportLayout";
import { PreviewUnreachable } from "./PreviewUnreachable";
import { revealInFileExplorerLabel } from "./fileExplorerLabel";
import { shouldShowPreviewEmptyState } from "./previewEmptyStateLogic";
import { BrowserSurfaceSlot } from "~/browser/BrowserSurfaceSlot";
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import { useLoadingProgress } from "./useLoadingProgress";
import { usePreviewSession } from "./usePreviewSession";
import { ZoomIndicator } from "./ZoomIndicator";
import { AgentBrowserCursor } from "./AgentBrowserCursor";
import {
  startBrowserRecording,
  stopBrowserRecording,
  useActiveBrowserRecordingTabId,
} from "~/browser/browserRecording";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
interface Props {
  threadRef: ScopedThreadRef;
  tabId?: string | null;
  configuredUrls?: ReadonlyArray<string> | undefined;
  visible: boolean;
}
const localApi = typeof window === "undefined" ? null : ensureLocalApi();
async function pickPreviewElementWithScreenshot(
  bridge: NonNullable<typeof previewBridge>,
  tabId: string,
) {
  try {
    const annotation = await bridge.pickElement(tabId);
    if (!annotation) return null;
    const screenshotFile = await previewAnnotationScreenshotFile(annotation);
    return {
      annotation,
      screenshotFile,
    };
  } catch {
    // The guest may navigate or close while the picker is active.
    return null;
  }
}
function restorePreviewFocus(element: HTMLElement | null): void {
  if (!element?.isConnected || typeof element.focus !== "function") return;
  try {
    element.focus({
      preventScroll: true,
    });
  } catch {
    // Detached iframes and some custom elements can reject focus.
  }
}

/**
 * Single-tab preview surface: chrome row on top, one webview below, empty
 * state when no session exists for the thread.
 */
function usePreviewViewContent({
  threadRef,
  tabId: requestedTabId,
  configuredUrls,
  visible,
}: Props) {
  const [focusUrlNonce, setFocusUrlNonce] = useState<number | undefined>(undefined);
  const [pickActive, setPickActive] = useState(false);
  const activeRecordingTabId = useActiveBrowserRecordingTabId();
  const pickActiveRef = useRef(false);
  const isMountedRef = useRef(true);
  const previewState = useThreadPreviewState(threadRef);
  const addPreviewAnnotation = useComposerDraftStore((store) => store.addPreviewAnnotation);
  const addImage = useComposerDraftStore((store) => store.addImage);
  const environment = useEnvironment(threadRef.environmentId);
  const environmentHttpBaseUrl = useEnvironmentHttpBaseUrl(threadRef.environmentId);
  const open = useAtomCommand(previewEnvironment.open);
  const resize = useAtomCommand(previewEnvironment.resize, "preview viewport resize");
  usePreviewSession(threadRef);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const tabId = requestedTabId ?? previewState.activeTabId;
  const snapshot = tabId ? (previewState.sessions[tabId] ?? null) : null;
  const desktopOverlay = tabId ? (previewState.desktopByTabId[tabId] ?? null) : null;
  const navStatus = snapshot?.navStatus ?? {
    _tag: "Idle" as const,
  };
  const url = navStatus._tag === "Idle" ? "" : navStatus.url;
  const loading = desktopOverlay?.loading ?? navStatus._tag === "Loading";
  const canGoBack = desktopOverlay?.canGoBack ?? snapshot?.canGoBack ?? false;
  const canGoForward = desktopOverlay?.canGoForward ?? snapshot?.canGoForward ?? false;
  const refreshDisabled = navStatus._tag === "Idle";
  const isUnreachable = navStatus._tag === "LoadFailed";
  const showEmptyState = shouldShowPreviewEmptyState(snapshot);
  const controller = desktopOverlay?.controller ?? "none";
  const loadProgress = useLoadingProgress(loading);
  const displayUrl =
    url && environment && environmentHttpBaseUrl
      ? (formatPreviewUrl({
          url,
          environmentLabel: environment.label,
          environmentHttpBaseUrl,
        }) ?? undefined)
      : undefined;
  const viewport = snapshot?.viewport ?? FILL_PREVIEW_VIEWPORT;
  const panelRect = useBrowserSurfaceStore((state) =>
    tabId ? (state.byTabId[tabId]?.rect ?? null) : null,
  );
  const handleSubmitUrl = async (next: string) => {
    try {
      const resolvedUrl = resolveDiscoveredServerUrl(threadRef.environmentId, next);
      if (tabId && previewBridge) {
        // Drive the webview imperatively; `usePreviewBridge` mirrors the
        // resolved URL back to the server so other clients stay in sync.
        await previewBridge.navigate(tabId, resolvedUrl);
        rememberPreviewUrl(threadRef, resolvedUrl);
      } else {
        await openPreviewSession({
          openPreview: open,
          threadRef,
          url: resolvedUrl,
        });
      }
    } catch {
      // Server-side `failed` event renders the unreachable view.
    }
  };
  const handleRefresh = () => {
    if (previewBridge && tabId) void previewBridge.refresh(tabId);
  };
  const handleZoomIn = () => {
    if (previewBridge && tabId) void previewBridge.zoomIn(tabId);
  };
  const handleZoomOut = () => {
    if (previewBridge && tabId) void previewBridge.zoomOut(tabId);
  };
  const handleResetZoom = () => {
    if (previewBridge && tabId) void previewBridge.resetZoom(tabId);
  };
  const handleViewportChange = async (nextViewport: PreviewViewportSetting) => {
    if (!tabId) return;
    const result = await resize({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        tabId,
        viewport: nextViewport,
      },
    });
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Unable to resize browser viewport",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
      throw error;
    }
    updatePreviewServerSnapshot(threadRef, result.value);
  };
  const handleToggleDeviceToolbar = () => {
    if (!tabId) return;
    if (viewport._tag !== "fill") {
      void commitBrowserViewportChange(tabId, FILL_PREVIEW_VIEWPORT).catch(() => undefined);
      return;
    }
    const responsiveSize = panelRect
      ? resolveResponsiveBrowserViewportSize(panelRect, desktopOverlay?.zoomFactor)
      : {
          width: 1024,
          height: 768,
        };
    void commitBrowserViewportChange(tabId, {
      _tag: "freeform",
      ...responsiveSize,
    }).catch(() => undefined);
  };
  const handleViewportChangeFromEffect = useEffectEvent(
    (
      nextViewport: PreviewViewportSetting,
      resolve: () => void,
      reject: (error: unknown) => void,
    ) => {
      void handleViewportChange(nextViewport).then(resolve, reject);
    },
  );
  useEffect(() => {
    if (!tabId) return;
    return subscribeBrowserViewportChange(
      tabId,
      (nextViewport) =>
        new Promise<void>((resolve, reject) => {
          handleViewportChangeFromEffect(nextViewport, resolve, reject);
        }),
    );
  }, [tabId]);
  const handleBack = () => {
    if (previewBridge && tabId) void previewBridge.goBack(tabId);
  };
  const handleForward = () => {
    if (previewBridge && tabId) void previewBridge.goForward(tabId);
  };
  const handleOpenInBrowser = () => {
    if (!localApi || !url) return;
    void localApi.shell.openExternal(url).catch(() => undefined);
  };
  const handleCapture = (record: boolean) => {
    if (!previewBridge || !tabId) return;
    const bridge = previewBridge;
    const recordingThisTab = activeRecordingTabId === tabId;
    if (recordingThisTab) {
      void stopBrowserRecording(tabId).then(
        (artifact) => {
          if (!artifact) return;
          let pathCopied = false;
          let toastId: ReturnType<typeof toastManager.add>;
          const copyPath = () => {
            if (!navigator.clipboard?.writeText) {
              toastManager.update(
                toastId,
                stackedThreadToast({
                  type: "error",
                  title: "Unable to copy recording path",
                  description: "Clipboard API unavailable.",
                  actionProps: revealAction,
                }),
              );
              return;
            }
            void navigator.clipboard.writeText(artifact.path).then(
              () => {
                pathCopied = true;
                updateRecordingToast();
                window.setTimeout(() => {
                  pathCopied = false;
                  updateRecordingToast();
                }, 2_000);
              },
              (error) => {
                toastManager.update(
                  toastId,
                  stackedThreadToast({
                    type: "error",
                    title: "Unable to copy recording path",
                    description: error instanceof Error ? error.message : "An error occurred.",
                    actionProps: revealAction,
                  }),
                );
              },
            );
          };
          const revealAction = {
            children: revealInFileExplorerLabel(navigator.platform),
            onClick: () => void bridge.revealArtifact(artifact.path),
          };
          const updateRecordingToast = () => {
            toastManager.update(
              toastId,
              stackedThreadToast({
                type: "success",
                title: "Recording saved",
                actionProps: revealAction,
                data: {
                  secondaryActionProps: {
                    children: pathCopied ? "Copied!" : "Copy path",
                    disabled: pathCopied,
                    onClick: copyPath,
                  },
                  secondaryActionVariant: "outline",
                },
              }),
            );
          };
          toastId = toastManager.add(
            stackedThreadToast({
              type: "success",
              title: "Recording saved",
              actionProps: revealAction,
              data: {
                secondaryActionProps: {
                  children: "Copy path",
                  onClick: copyPath,
                },
                secondaryActionVariant: "outline",
              },
            }),
          );
        },
        (error) => {
          toastManager.add({
            type: "error",
            title: "Unable to stop recording",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        },
      );
      return;
    }
    if (record) {
      if (activeRecordingTabId !== null) {
        toastManager.add({
          type: "warning",
          title: "Another preview is recording",
          description: "Stop the active recording before starting a new one.",
        });
        return;
      }
      void startBrowserRecording(tabId).catch((error) => {
        toastManager.add({
          type: "error",
          title: "Unable to start recording",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      });
      return;
    }
    void bridge.captureScreenshot(tabId).then(
      (artifact) => {
        const revealAction = {
          children: revealInFileExplorerLabel(navigator.platform),
          onClick: () => void bridge.revealArtifact(artifact.path),
        };
        let pathCopied = false;
        let imageCopied = false;
        let toastId: ReturnType<typeof toastManager.add>;
        const updateScreenshotToast = (
          type: "success" | "error" = "success",
          title = "Screenshot saved",
          description?: string,
        ) => {
          toastManager.update(
            toastId,
            stackedThreadToast({
              type,
              title,
              description,
              actionProps: {
                children: imageCopied ? "Copied!" : "Copy image",
                disabled: imageCopied,
                onClick: copyImage,
              },
              data: {
                additionalActions: [
                  {
                    id: "copy-path",
                    props: {
                      children: pathCopied ? "Copied!" : "Copy path",
                      disabled: pathCopied,
                      onClick: copyPath,
                    },
                  },
                ],
                secondaryActionProps: {
                  ...revealAction,
                },
                secondaryActionVariant: "outline",
              },
            }),
          );
        };
        const copyPath = () => {
          if (!navigator.clipboard?.writeText) {
            updateScreenshotToast(
              "error",
              "Unable to copy screenshot path",
              "Clipboard API unavailable.",
            );
            return;
          }
          void navigator.clipboard.writeText(artifact.path).then(
            () => {
              pathCopied = true;
              updateScreenshotToast();
              window.setTimeout(() => {
                pathCopied = false;
                updateScreenshotToast();
              }, 2_000);
            },
            (error) => {
              updateScreenshotToast(
                "error",
                "Unable to copy screenshot path",
                error instanceof Error ? error.message : "An error occurred.",
              );
            },
          );
        };
        const copyImage = () => {
          void bridge.copyArtifactToClipboard(artifact.path).then(
            () => {
              imageCopied = true;
              updateScreenshotToast();
              window.setTimeout(() => {
                imageCopied = false;
                updateScreenshotToast();
              }, 2_000);
            },
            (error) => {
              updateScreenshotToast(
                "error",
                "Unable to copy screenshot",
                error instanceof Error ? error.message : "An error occurred.",
              );
            },
          );
        };
        toastId = toastManager.add(
          stackedThreadToast({
            type: "success",
            title: "Screenshot saved",
            actionProps: {
              children: "Copy image",
              onClick: copyImage,
            },
            data: {
              additionalActions: [
                {
                  id: "copy-path",
                  props: {
                    children: "Copy path",
                    onClick: copyPath,
                  },
                },
              ],
              secondaryActionProps: {
                ...revealAction,
              },
              secondaryActionVariant: "outline",
            },
          }),
        );
      },
      (error) => {
        toastManager.add({
          type: "error",
          title: "Unable to capture screenshot",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      },
    );
  };
  const handlePickElement = () => {
    if (!previewBridge || !tabId) return;
    if (pickActiveRef.current) {
      void previewBridge.cancelPickElement(tabId).catch(() => undefined);
      return;
    }
    // Snapshot whatever the user was focused on (typically the chat
    // composer textarea or the chrome-row pick button) BEFORE main steals
    // focus into the guest webContents. We restore it when the pick
    // resolves so the user's typing context isn't lost — otherwise after
    // every pick they'd have to click back into the textarea.
    const previouslyFocused =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    pickActiveRef.current = true;
    setPickActive(true);
    void pickPreviewElementWithScreenshot(previewBridge, tabId)
      .then((result) => {
        if (!result) return;
        addPreviewAnnotation(threadRef, result.annotation);
        if (result.screenshotFile && result.annotation.screenshot) {
          addImage(threadRef, {
            type: "image",
            id: result.annotation.id,
            name: result.screenshotFile.name,
            mimeType: result.screenshotFile.type,
            sizeBytes: result.screenshotFile.size,
            previewUrl: result.annotation.screenshot.dataUrl,
            file: result.screenshotFile,
          });
        }
      })
      .finally(() => {
        pickActiveRef.current = false;
        // Avoid `setState on unmounted component` if the panel/thread closed
        // while the pick was in flight.
        if (isMountedRef.current) setPickActive(false);
        restorePreviewFocus(previouslyFocused);
      });
  };

  // If the active tab changes mid-pick (close, thread switch, hot restart),
  // tell main to tear down the in-flight session AND reset our local toggle
  // state so the button doesn't get stuck pressed against a stale tab id.
  useEffect(() => {
    return () => {
      if (!pickActiveRef.current) return;
      pickActiveRef.current = false;
      if (previewBridge && tabId) {
        void previewBridge.cancelPickElement(tabId).catch(() => undefined);
      }
      if (isMountedRef.current) setPickActive(false);
    };
  }, [tabId]);

  // Subscribe only while visible; `toggle-panel` is owned by ChatView's
  // URL-aware handler regardless of whether the panel is currently mounted.
  const handlePreviewAction = useEffectEvent((action: PreviewAction) => {
    switch (action) {
      case "refresh":
        handleRefresh();
        return;
      case "focus-url":
        setFocusUrlNonce((value) => (value ?? 0) + 1);
        return;
      case "zoom-in":
        handleZoomIn();
        return;
      case "zoom-out":
        handleZoomOut();
        return;
      case "reset-zoom":
        handleResetZoom();
        return;
      case "toggle-panel":
        return;
    }
  });
  useEffect(() => {
    if (!visible) return;
    return subscribePreviewAction((action) => handlePreviewAction(action));
  }, [visible]);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-thread-key={scopedThreadKey(threadRef)}
    >
      <PreviewChromeRow
        url={url}
        displayUrl={displayUrl}
        loading={loading}
        loadProgress={loadProgress}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        refreshDisabled={refreshDisabled}
        focusUrlNonce={focusUrlNonce}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
        onSubmit={(next) => void handleSubmitUrl(next)}
        onOpenInBrowser={tabId ? handleOpenInBrowser : undefined}
        onCapture={previewBridge && tabId ? handleCapture : undefined}
        captureDisabled={!desktopOverlay || isUnreachable}
        recording={tabId !== null && activeRecordingTabId === tabId}
        onPickElement={previewBridge && tabId ? handlePickElement : undefined}
        pickActive={pickActive}
        // Disable when there's no tab (nothing to pick on) OR the page
        // failed to load (a React overlay covers the webview, so the
        // user wouldn't be able to actually click anything underneath).
        pickDisabled={!tabId || isUnreachable}
        pickDisabledReason={
          isUnreachable ? "Page didn't load — pick unavailable until the page renders" : undefined
        }
        trailingActions={
          previewBridge ? (
            <PreviewMoreMenu
              tabId={tabId}
              hasWebContents={desktopOverlay !== null}
              zoomFactor={desktopOverlay?.zoomFactor ?? 1}
              deviceToolbarVisible={viewport._tag !== "fill"}
              onToggleDeviceToolbar={handleToggleDeviceToolbar}
            />
          ) : null
        }
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabId && snapshot && !showEmptyState ? (
          <BrowserSurfaceSlot
            key={tabId}
            tabId={tabId}
            visible={visible && !isUnreachable}
            className="absolute inset-0 h-full w-full"
          />
        ) : null}
        {showEmptyState ? (
          <PreviewEmptyState
            environmentId={threadRef.environmentId}
            configuredUrls={configuredUrls}
            recentlySeenUrls={previewState.recentlySeenUrls}
            onOpenUrl={(next) => void handleSubmitUrl(next)}
          />
        ) : null}
        {snapshot && desktopOverlay ? (
          <ZoomIndicator zoomFactor={desktopOverlay.zoomFactor} />
        ) : null}
        {tabId && desktopOverlay && !showEmptyState && !isUnreachable ? (
          <AgentBrowserCursor
            tabId={tabId}
            zoomFactor={desktopOverlay.zoomFactor}
            controller={controller}
          />
        ) : null}
        {controller !== "none" ? (
          <div className="pointer-events-none absolute left-3 top-3 z-40 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
            {controller === "agent" ? "Agent controlling browser" : "Human control"}
          </div>
        ) : null}
        {navStatus._tag === "LoadFailed" ? (
          <div className="absolute inset-0 z-10 bg-background">
            <PreviewUnreachable
              url={navStatus.url}
              code={navStatus.code}
              description={navStatus.description}
              onReload={handleRefresh}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
export function PreviewView(props: Props) {
  return usePreviewViewContent(props);
}
