import { NativeHeaderToolbar } from "../../native/nativeHeaderToolbar";
import {
  compactMenuBranchLabel,
  compactMenuStatus,
  type ThreadGitControlsProps,
  type ThreadGitMenuProps,
  useThreadGitControlModel,
} from "./threadGitControlsModel";
import {
  basename,
  getTerminalStatusLabel,
  projectScriptMenuIcon,
  projectScriptMenuLabel,
} from "../terminal/terminalMenu";

export function ThreadGitControls(props: ThreadGitControlsProps) {
  const model = useThreadGitControlModel(props);
  const displayMode = props.displayMode ?? "compact";

  if (displayMode === "hidden") {
    return null;
  }

  return (
    <NativeHeaderToolbar placement="right">
      {props.auxiliaryPaneControl ? (
        <NativeHeaderToolbar.Button
          accessibilityLabel={props.auxiliaryPaneControl.accessibilityLabel}
          icon="sidebar.right"
          onPress={props.auxiliaryPaneControl.onPress}
          separateBackground
        />
      ) : null}
      <NativeHeaderToolbar.Menu
        icon="terminal"
        disabled={!props.availableTargets.includes("terminal")}
        separateBackground
      >
        {props.projectScripts.length > 0 ? (
          props.projectScripts.map((script) => (
            <NativeHeaderToolbar.MenuAction
              key={script.id}
              icon={projectScriptMenuIcon(script.icon)}
              onPress={() => void props.onRunProjectScript(script)}
              subtitle={script.command}
            >
              <NativeHeaderToolbar.Label>
                {projectScriptMenuLabel(script)}
              </NativeHeaderToolbar.Label>
            </NativeHeaderToolbar.MenuAction>
          ))
        ) : (
          <NativeHeaderToolbar.MenuAction
            icon="play"
            disabled
            onPress={() => {}}
            subtitle="This project has no saved scripts yet"
          >
            <NativeHeaderToolbar.Label>No project scripts</NativeHeaderToolbar.Label>
          </NativeHeaderToolbar.MenuAction>
        )}
        {props.terminalSessions.map((session) => (
          <NativeHeaderToolbar.MenuAction
            key={session.terminalId}
            icon="terminal"
            onPress={() => props.onOpenTerminal(session.terminalId)}
            subtitle={[
              getTerminalStatusLabel({
                status: session.status,
                hasRunningSubprocess: session.hasRunningSubprocess,
              }),
              basename(session.cwd),
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <NativeHeaderToolbar.Label>{session.displayLabel}</NativeHeaderToolbar.Label>
          </NativeHeaderToolbar.MenuAction>
        ))}
        <NativeHeaderToolbar.MenuAction
          icon="plus"
          onPress={props.onOpenNewTerminal}
          subtitle="Start another shell for this thread"
        >
          <NativeHeaderToolbar.Label>Open new terminal</NativeHeaderToolbar.Label>
        </NativeHeaderToolbar.MenuAction>
      </NativeHeaderToolbar.Menu>
      {displayMode === "split" ? (
        <NativeHeaderToolbar.Button
          accessibilityLabel="Open files"
          disabled={!props.availableTargets.includes("files")}
          icon="folder"
          onPress={model.openFiles}
          separateBackground
        />
      ) : null}
      <ThreadGitMenu {...props} />
    </NativeHeaderToolbar>
  );
}

/**
 * The standalone git actions menu (branch status, quick commit/push action,
 * review, more). Rendered inside a NativeHeaderToolbar by both the thread
 * chat header and the review screen's toolbar.
 */
export function ThreadGitMenu(props: ThreadGitMenuProps) {
  const model = useThreadGitControlModel(props);

  return (
    <NativeHeaderToolbar.Menu icon="point.topleft.down.curvedto.point.bottomright.up">
      <NativeHeaderToolbar.MenuAction
        icon="point.topleft.down.curvedto.point.bottomright.up"
        disabled
        onPress={() => {}}
        subtitle={compactMenuStatus(props.gitStatus)}
      >
        <NativeHeaderToolbar.Label>
          {compactMenuBranchLabel(model.currentBranchLabel)}
        </NativeHeaderToolbar.Label>
      </NativeHeaderToolbar.MenuAction>
      <NativeHeaderToolbar.MenuAction
        icon={model.quickActionIcon}
        disabled={model.quickAction.disabled}
        onPress={() => void model.runQuickAction()}
        subtitle={model.quickActionHint ?? undefined}
      >
        <NativeHeaderToolbar.Label>{model.quickAction.label}</NativeHeaderToolbar.Label>
      </NativeHeaderToolbar.MenuAction>
      <NativeHeaderToolbar.MenuAction
        icon="text.bubble"
        disabled={!model.isRepo}
        onPress={model.openReview}
        subtitle="Turn diffs and worktree changes"
      >
        <NativeHeaderToolbar.Label>Review changes</NativeHeaderToolbar.Label>
      </NativeHeaderToolbar.MenuAction>
      <NativeHeaderToolbar.MenuAction
        icon="ellipsis"
        onPress={model.openGitInspector}
        subtitle="Commit, files, branches"
      >
        <NativeHeaderToolbar.Label>More</NativeHeaderToolbar.Label>
      </NativeHeaderToolbar.MenuAction>
    </NativeHeaderToolbar.Menu>
  );
}
