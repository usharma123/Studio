import { Input } from "../ui/input";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Spinner } from "../ui/spinner";
import { Button } from "../ui/button";
export function ConnectionsAccessDialogs({
  controller,
}: {
  readonly controller: ConnectionsSettingsController;
}) {
  const {
    disableTailscaleServeDialogOpen,
    handleConfirmDesktopServerExposureChange,
    handleConfirmEnableWsl,
    handleConfirmTailscaleServeDisable,
    handleConfirmTailscaleServeSetup,
    handleConfirmWslChange,
    isDesktopServerExposureDialogOpen,
    isTailscaleServePortValid,
    isUpdatingDesktopServerExposure,
    isUpdatingTailscaleServe,
    isUpdatingWslBackend,
    isWslConfirmDialogOpen,
    pendingDesktopServerExposureMode,
    pendingTailscaleServeBaseUrl,
    pendingTailscaleServeEndpoint,
    pendingWslChange,
    setDisableTailscaleServeDialogOpen,
    setIsDesktopServerExposureDialogOpen,
    setPendingDesktopServerExposureMode,
    setPendingTailscaleServeEndpoint,
    setPendingWslChange,
    setTailscaleServePortInput,
    tailscaleServePortInput,
  } = controller;
  return (
    <>
      <AlertDialog
        open={isDesktopServerExposureDialogOpen}
        onOpenChange={(open) => {
          if (isUpdatingDesktopServerExposure) return;
          setIsDesktopServerExposureDialogOpen(open);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setPendingDesktopServerExposureMode(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDesktopServerExposureMode === "network-accessible"
                ? "Enable network access?"
                : "Disable network access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDesktopServerExposureMode === "network-accessible"
                ? "T3 Code will restart to expose this environment over the network."
                : "T3 Code will restart and limit this environment back to this machine."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={isUpdatingDesktopServerExposure}
              render={<Button variant="outline" disabled={isUpdatingDesktopServerExposure} />}
            >
              Cancel
            </AlertDialogClose>
            <Button
              variant={
                pendingDesktopServerExposureMode === "local-only" ? "destructive" : "default"
              }
              onClick={handleConfirmDesktopServerExposureChange}
              disabled={
                pendingDesktopServerExposureMode === null || isUpdatingDesktopServerExposure
              }
            >
              {isUpdatingDesktopServerExposure ? (
                <>
                  <Spinner className="size-3.5" />
                  Restarting…
                </>
              ) : pendingDesktopServerExposureMode === "network-accessible" ? (
                "Restart and enable"
              ) : (
                "Restart and disable"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog
        open={isWslConfirmDialogOpen}
        onOpenChange={(open) => {
          if (isUpdatingWslBackend) return;
          if (!open) setPendingWslChange(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingWslChange?.kind === "disable"
                ? pendingWslChange.wasWslOnly
                  ? "Turn off WSL and switch back to Windows?"
                  : "Disable WSL backend?"
                : pendingWslChange?.kind === "distro"
                  ? "Switch WSL distro?"
                  : pendingWslChange?.kind === "enable"
                    ? "Start the WSL backend"
                    : pendingWslChange?.nextValue
                      ? "Run only the WSL backend?"
                      : "Re-enable the Windows backend?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingWslChange?.kind === "disable"
                ? pendingWslChange.wasWslOnly
                  ? "T3 Code will restart on the Windows backend. Threads and projects opened against WSL stay safe inside the distro and become available again when you re-enable WSL."
                  : "The WSL backend will stop. Threads and projects opened against WSL stay safe inside the distro, but they'll be unavailable in T3 Code until you re-enable WSL."
                : pendingWslChange?.kind === "distro"
                  ? "T3 Code will restart the WSL backend on the new distro. Sessions still running on the current distro will be interrupted."
                  : pendingWslChange?.kind === "enable"
                    ? "Run the WSL backend alongside the Windows one, or stop the Windows backend and use only WSL? You can change this later from Settings."
                    : pendingWslChange?.nextValue
                      ? "T3 Code will restart and start only the WSL backend. Your Windows-side projects won't be accessible until you turn this off again."
                      : "T3 Code will restart and bring the Windows backend back up alongside WSL."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={isUpdatingWslBackend}
              render={<Button variant="outline" disabled={isUpdatingWslBackend} />}
            >
              Cancel
            </AlertDialogClose>
            {pendingWslChange?.kind === "enable" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleConfirmEnableWsl("wsl-only")}
                  disabled={isUpdatingWslBackend}
                >
                  {isUpdatingWslBackend ? (
                    <>
                      <Spinner className="size-3.5" />
                      Applying…
                    </>
                  ) : (
                    "Use only WSL"
                  )}
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleConfirmEnableWsl("both")}
                  disabled={isUpdatingWslBackend}
                >
                  {isUpdatingWslBackend ? (
                    <>
                      <Spinner className="size-3.5" />
                      Applying…
                    </>
                  ) : (
                    "Run both backends"
                  )}
                </Button>
              </>
            ) : (
              <Button
                variant={
                  pendingWslChange?.kind === "disable" ||
                  (pendingWslChange?.kind === "wsl-only" && pendingWslChange.nextValue)
                    ? "destructive"
                    : "default"
                }
                onClick={handleConfirmWslChange}
                disabled={isUpdatingWslBackend}
              >
                {isUpdatingWslBackend ? (
                  <>
                    <Spinner className="size-3.5" />
                    Applying…
                  </>
                ) : pendingWslChange?.kind === "disable" ? (
                  pendingWslChange.wasWslOnly ? (
                    "Switch to Windows"
                  ) : (
                    "Disable WSL"
                  )
                ) : pendingWslChange?.kind === "distro" ? (
                  "Switch distro"
                ) : pendingWslChange?.nextValue ? (
                  "Restart and enable"
                ) : (
                  "Restart and disable"
                )}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog
        open={disableTailscaleServeDialogOpen}
        onOpenChange={(open) => {
          if (isUpdatingTailscaleServe) return;
          setDisableTailscaleServeDialogOpen(open);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Tailscale HTTPS?</AlertDialogTitle>
            <AlertDialogDescription>
              T3 Code will restart the local backend without Tailscale Serve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={isUpdatingTailscaleServe}
              render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
            >
              Cancel
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmTailscaleServeDisable()}
              disabled={isUpdatingTailscaleServe}
            >
              {isUpdatingTailscaleServe ? (
                <>
                  <Spinner className="size-3.5" />
                  Restarting…
                </>
              ) : (
                "Restart and disable"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <Dialog
        open={pendingTailscaleServeEndpoint !== null}
        onOpenChange={(open) => {
          if (isUpdatingTailscaleServe) return;
          if (!open) setPendingTailscaleServeEndpoint(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set up Tailscale HTTPS?</DialogTitle>
            <DialogDescription>
              T3 Code will restart the local backend with Tailscale Serve enabled and ask Tailscale
              to proxy HTTPS traffic to this backend.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">HTTPS port</span>
              <Input
                className="mt-2"
                type="number"
                inputMode="numeric"
                min={1}
                max={65_535}
                step={1}
                value={tailscaleServePortInput}
                onChange={(event) => setTailscaleServePortInput(event.target.value)}
                disabled={isUpdatingTailscaleServe}
              />
            </label>
            {!isTailscaleServePortValid ? (
              <p className="mt-2 text-xs text-destructive">Enter a port from 1 to 65535.</p>
            ) : null}
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">HTTPS endpoint</p>
              <p
                className="mt-1 truncate text-sm text-foreground"
                title={pendingTailscaleServeBaseUrl ?? undefined}
              >
                {pendingTailscaleServeBaseUrl ?? "Pending MagicDNS endpoint"}
              </p>
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose
              disabled={isUpdatingTailscaleServe}
              render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
            >
              Cancel
            </DialogClose>
            <Button
              onClick={() => void handleConfirmTailscaleServeSetup()}
              disabled={isUpdatingTailscaleServe || !isTailscaleServePortValid}
            >
              {isUpdatingTailscaleServe ? (
                <>
                  <Spinner className="size-3.5" />
                  Restarting…
                </>
              ) : (
                "Enable"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
import type { ConnectionsSettingsController } from "./ConnectionsSettings";
