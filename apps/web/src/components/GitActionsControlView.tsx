import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ChevronDownIcon, CloudUploadIcon, GitBranchPlusIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Group, GroupSeparator } from "~/components/ui/group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import type { GitActionsControlController } from "./GitActionsControl";
import { GitDefaultBranchDialog } from "./GitDefaultBranchDialog";
import { GitCommitDialog } from "./GitCommitDialog";
export function GitActionsControlView({
  controller,
}: {
  readonly controller: NonNullable<GitActionsControlController>;
}) {
  const {
    GitActionItemIcon,
    GitQuickActionIcon,
    PublishRepositoryDialog,
    SourceControlIcon,
    activeEnvironmentId,
    canPublishRepository,
    getMenuActionDisabledReason,
    gitActionMenuItems,
    gitCwd,
    gitStatusError,
    gitStatusForActions,
    hasPrimaryRemote,
    initAction,
    isGitActionRunning,
    isPublishDialogOpen,
    isRepo,
    openDialogForMenuItem,
    quickAction,
    quickActionDisabledReason,
    refreshVcsStatus,
    requestVcsStatusRefresh,
    runQuickAction,
    setIsPublishDialogOpen,
    threadToastData,
  } = controller;
  return (
    <>
      {!isRepo ? (
        <Button
          variant="outline"
          size="xs"
          disabled={initAction.isPending}
          onClick={() => {
            void (async () => {
              const result = await initAction.run();
              if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
                return;
              }
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Git initialization failed",
                  description: error instanceof Error ? error.message : "An error occurred.",
                  ...(threadToastData !== undefined
                    ? {
                        data: threadToastData,
                      }
                    : {}),
                }),
              );
            })();
          }}
        >
          <GitBranchPlusIcon className="size-3.5" aria-hidden />
          <span className="ml-0.5">
            {initAction.isPending ? "Initializing..." : "Initialize Git"}
          </span>
        </Button>
      ) : (
        <Group aria-label="Git actions" className="shrink-0">
          {quickActionDisabledReason ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={
                  <Button
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-e-none border-e-0 opacity-64 before:rounded-e-none"
                    size="xs"
                    variant="outline"
                  />
                }
              >
                <GitQuickActionIcon
                  quickAction={quickAction}
                  SourceControlIcon={SourceControlIcon}
                />
                <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
                  {quickAction.label}
                </span>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="bottom" align="start">
                {quickActionDisabledReason}
              </PopoverPopup>
            </Popover>
          ) : (
            <Button
              variant="outline"
              size="xs"
              disabled={isGitActionRunning || quickAction.disabled}
              onClick={runQuickAction}
            >
              <GitQuickActionIcon quickAction={quickAction} SourceControlIcon={SourceControlIcon} />
              <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
                {quickAction.label}
              </span>
            </Button>
          )}
          <GroupSeparator className="hidden @3xl/header-actions:block" />
          <Menu
            onOpenChange={(open) => {
              if (open) {
                requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
              }
            }}
          >
            <MenuTrigger
              render={<Button aria-label="Git action options" size="icon-xs" variant="outline" />}
              disabled={isGitActionRunning}
            >
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-full">
              {gitActionMenuItems.map((item) => {
                const disabledReason = getMenuActionDisabledReason({
                  item,
                  gitStatus: gitStatusForActions,
                  isBusy: isGitActionRunning,
                  hasPrimaryRemote,
                });
                if (item.disabled && disabledReason) {
                  return (
                    <Popover key={`${item.id}-${item.label}`}>
                      <PopoverTrigger
                        openOnHover
                        nativeButton={false}
                        render={<span className="block w-max cursor-not-allowed" />}
                      >
                        <MenuItem className="w-full" disabled>
                          <GitActionItemIcon
                            icon={item.icon}
                            SourceControlIcon={SourceControlIcon}
                          />
                          {item.label}
                        </MenuItem>
                      </PopoverTrigger>
                      <PopoverPopup tooltipStyle side="left" align="center">
                        {disabledReason}
                      </PopoverPopup>
                    </Popover>
                  );
                }
                return (
                  <MenuItem
                    key={`${item.id}-${item.label}`}
                    disabled={item.disabled}
                    onClick={() => {
                      openDialogForMenuItem(item);
                    }}
                  >
                    <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
                    {item.label}
                  </MenuItem>
                );
              })}
              {canPublishRepository ? (
                <MenuItem
                  disabled={isGitActionRunning}
                  onClick={() => {
                    setIsPublishDialogOpen(true);
                  }}
                >
                  <CloudUploadIcon />
                  Publish repository...
                </MenuItem>
              ) : null}
              {gitStatusForActions?.refName === null && (
                <p className="px-2 py-1.5 text-xs text-warning">
                  Detached HEAD: create and checkout a refName to enable push and pull request
                  actions.
                </p>
              )}
              {gitStatusForActions &&
                gitStatusForActions.refName !== null &&
                !gitStatusForActions.hasWorkingTreeChanges &&
                gitStatusForActions.behindCount > 0 &&
                gitStatusForActions.aheadCount === 0 && (
                  <p className="px-2 py-1.5 text-xs text-warning">
                    Behind upstream. Pull/rebase first.
                  </p>
                )}
              {gitStatusError && (
                <p className="px-2 py-1.5 text-xs text-destructive">{gitStatusError}</p>
              )}
            </MenuPopup>
          </Menu>
        </Group>
      )}

      <GitCommitDialog controller={controller} />

      <PublishRepositoryDialog
        open={isPublishDialogOpen}
        onOpenChange={setIsPublishDialogOpen}
        environmentId={activeEnvironmentId}
        gitCwd={gitCwd}
      />

      <GitDefaultBranchDialog controller={controller} />
    </>
  );
}
