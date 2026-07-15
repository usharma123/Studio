"use client";

import { useLayoutEffect, useRef } from "react";

import { createAnimationFrameBatcher } from "~/lib/eventBatcher";

import { acquireBrowserSurface } from "./browserSurfaceStore";

export function BrowserSurfaceSlot(props: {
  readonly tabId: string;
  readonly visible: boolean;
  readonly className?: string;
}) {
  const { tabId, visible, className } = props;
  const elementRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const lease = acquireBrowserSurface(tabId);
    const update = () => {
      const rect = element.getBoundingClientRect();
      lease.present(
        {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        },
        visible && rect.width > 0 && rect.height > 0,
      );
    };
    update();
    const updateBatcher = createAnimationFrameBatcher<void>(update);
    const scheduleUpdate = () => updateBatcher.schedule(undefined);
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      updateBatcher.cancel();
      lease.release();
    };
  }, [tabId, visible]);

  return <div ref={elementRef} className={className} data-browser-surface-slot={tabId} />;
}
