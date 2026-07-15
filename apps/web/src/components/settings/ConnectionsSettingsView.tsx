import {
  ChevronsLeftRightEllipsisIcon,
  PlusIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { AnimatedHeight } from "../AnimatedHeight";
import { ConnectionsAccessDialogs } from "./ConnectionsAccessDialogs";
export function ConnectionsSettingsView({
  controller,
}: {
  readonly controller: ConnectionsSettingsController;
}) {
  const {
    AuthorizedClientsHeaderAction,
    CloudLinkRow,
    CloudRemoteEnvironmentRows,
    SavedBackendListRow,
    addBackendDialogOpen,
    canManageLocalBackend,
    canManageRelay,
    desktopBridge,
    desktopClientSessions,
    handleConnectSavedBackend,
    handleRemoveSavedBackend,
    handleRevokeOtherDesktopClients,
    isLocalBackendRemotelyReachable,
    isRevokingOtherDesktopClients,
    primaryEnvironmentId,
    primaryVersionMismatch,
    removingSavedEnvironmentId,
    renderAuthorizedClients,
    renderConnectionModeCard,
    renderDisabledNetworkAccessRow,
    renderEndpointRows,
    renderNetworkAccessRow,
    renderRemoteModeBody,
    renderSshFields,
    renderTailscaleRow,
    renderWslRow,
    savedBackendMode,
    savedEnvironmentIds,
    savedEnvironments,
    setAddBackendDialogOpen,
    setSavedBackendError,
  } = controller;
  return (
    <SettingsPageContainer>
      {canManageLocalBackend ? (
        <>
          <SettingsSection title="This environment">
            {primaryVersionMismatch ? (
              <SettingsRow
                title="Version drift"
                description={
                  <span className="flex items-center gap-1 text-warning">
                    <TriangleAlertIcon className="size-3.5 shrink-0" />
                    Client {primaryVersionMismatch.clientVersion}, server{" "}
                    {primaryVersionMismatch.serverVersion}. Sync them if RPC calls or reconnects
                    fail.
                  </span>
                }
              />
            ) : null}
            {desktopBridge ? (
              <>
                {renderNetworkAccessRow()}
                {renderEndpointRows("endpoint-rail")}
                {renderTailscaleRow()}
                {renderWslRow()}
                <CloudLinkRow canManageRelay={canManageRelay} />
              </>
            ) : (
              <>
                {renderDisabledNetworkAccessRow()}
                <CloudLinkRow canManageRelay={canManageRelay} />
              </>
            )}
          </SettingsSection>

          {isLocalBackendRemotelyReachable ? (
            <SettingsSection
              title="Authorized clients"
              headerAction={
                <AuthorizedClientsHeaderAction
                  clientSessions={desktopClientSessions}
                  isRevokingOtherClients={isRevokingOtherDesktopClients}
                  onRevokeOtherClients={handleRevokeOtherDesktopClients}
                />
              }
            >
              <ScrollArea
                scrollFade
                className="max-h-[22.5rem]"
                data-testid="authorized-clients-scroll-area"
              >
                {renderAuthorizedClients("current")}
              </ScrollArea>
            </SettingsSection>
          ) : null}
          <ConnectionsAccessDialogs controller={controller} />
        </>
      ) : (
        <SettingsSection title="This environment">
          <SettingsRow
            title="Administrative access"
            description="Pairing links and client-session management require the access:write scope for this backend."
          />
          <CloudLinkRow canManageRelay={canManageRelay} />
        </SettingsSection>
      )}

      <SettingsSection
        title="Remote environments"
        headerAction={
          <Dialog
            open={addBackendDialogOpen}
            onOpenChange={(open) => {
              setAddBackendDialogOpen(open);
              if (!open) {
                setSavedBackendError(null);
              }
            }}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogTrigger
                    render={
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-5 gap-1 rounded-sm px-1 text-[11px] font-normal text-muted-foreground/60 hover:text-muted-foreground"
                        aria-label="Add environment"
                      >
                        <PlusIcon className="size-3" />
                        <span>Add environment</span>
                      </Button>
                    }
                  />
                }
              />
              <TooltipPopup side="top">Add environment</TooltipPopup>
            </Tooltip>
            <DialogPopup className="max-h-[80dvh] sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add Environment</DialogTitle>
                <DialogDescription>Pair another environment to this client.</DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {renderConnectionModeCard({
                      mode: "remote",
                      title: "Remote link",
                      description: "Enter a backend host and pairing code.",
                      icon: <ChevronsLeftRightEllipsisIcon aria-hidden className="size-4" />,
                    })}
                    {desktopBridge
                      ? renderConnectionModeCard({
                          mode: "ssh",
                          title: "SSH",
                          description: "Use local SSH config, agent, and tunnels for the backend.",
                          icon: <TerminalIcon aria-hidden className="size-4" />,
                        })
                      : null}
                  </div>
                  <AnimatedHeight>
                    {savedBackendMode === "ssh" ? renderSshFields() : renderRemoteModeBody()}
                  </AnimatedHeight>
                </div>
              </DialogPanel>
            </DialogPopup>
          </Dialog>
        }
      >
        {savedEnvironments.map((environment) => (
          <SavedBackendListRow
            key={environment.environmentId}
            environment={environment}
            removingEnvironmentId={removingSavedEnvironmentId}
            onConnect={handleConnectSavedBackend}
            onRemove={handleRemoveSavedBackend}
          />
        ))}
        <CloudRemoteEnvironmentRows
          primaryEnvironmentId={primaryEnvironmentId}
          savedEnvironmentIds={savedEnvironmentIds}
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
import type { ConnectionsSettingsController } from "./ConnectionsSettings";
