import { RotateCcwIcon } from "lucide-react";
import { Outlet, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSettingsRestore } from "./useSettingsRestore";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { isElectron } from "../../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

function RestoreDefaultsButton({ onRestored }: { readonly onRestored: () => void }) {
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore(onRestored);
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={changedSettingLabels.length === 0}
      onClick={() => void restoreDefaults()}
    >
      <RotateCcwIcon className="mx-1 size-3.5" />
      Restore defaults
    </Button>
  );
}

export function SettingsRouteContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const [restoreSignal, setRestoreSignal] = useState(0);
  const showRestoreDefaults = location.pathname === "/settings/general";
  const handleRestored = () => setRestoreSignal((value) => value + 1);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      if (canGoBack) window.history.back();
      else void navigate({ to: "/" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, navigate]);

  const restoreControl = showRestoreDefaults ? (
    <div className="ms-auto flex items-center gap-2">
      <RestoreDefaultsButton onRestored={handleRestored} />
    </div>
  ) : null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron ? (
          <header
            className={cn(
              "border-b border-border px-3 py-2 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
              <span className="text-sm font-medium text-foreground">Settings</span>
              {restoreControl}
            </div>
          </header>
        ) : (
          <div
            className={cn(
              "drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Settings
            </span>
            {restoreControl}
          </div>
        )}

        <div key={restoreSignal} className="min-h-0 flex flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </SidebarInset>
  );
}
