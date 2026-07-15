import { createModelSelection } from "@t3tools/shared/model";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { resolveAppModelSelectionState } from "../../modelSelection";
export function GeneralWorkflowSettings({
  controller,
}: {
  readonly controller: GeneralSettingsPanelController;
}) {
  const {
    gitModelInstanceEntries,
    gitModelOptionsByInstance,
    isGitWritingModelDirty,
    serverProviders,
    settings,
    textGenInstanceEntry,
    textGenInstanceId,
    textGenModel,
    textGenModelOptions,
    textGenProvider,
    updateSettings,
  } = controller;
  return (
    <>
      <SettingsRow
        title="Auto-open task panel"
        description="Open the right-side plan and task panel automatically when steps appear."
        resetAction={
          settings.autoOpenPlanSidebar !== DEFAULT_UNIFIED_SETTINGS.autoOpenPlanSidebar ? (
            <SettingResetButton
              label="auto-open task panel"
              onClick={() =>
                updateSettings({
                  autoOpenPlanSidebar: DEFAULT_UNIFIED_SETTINGS.autoOpenPlanSidebar,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.autoOpenPlanSidebar}
            onCheckedChange={(checked) =>
              updateSettings({
                autoOpenPlanSidebar: Boolean(checked),
              })
            }
            aria-label="Open the task panel automatically"
          />
        }
      />

      <SettingsRow
        title="New threads"
        description="Pick the default workspace mode for newly created draft threads."
        resetAction={
          settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode ||
          settings.newWorktreesStartFromOrigin !==
            DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
            <SettingResetButton
              label="new threads"
              onClick={() =>
                updateSettings({
                  defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
                  newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
                })
              }
            />
          ) : null
        }
        control={
          <Select
            value={settings.defaultThreadEnvMode}
            onValueChange={(value) => {
              if (value === "local" || value === "worktree") {
                updateSettings({
                  defaultThreadEnvMode: value,
                });
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Default thread mode">
              <SelectValue>
                {settings.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="local">
                Local
              </SelectItem>
              <SelectItem hideIndicator value="worktree">
                New worktree
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />

      {settings.defaultThreadEnvMode === "worktree" ? (
        <SettingsRow
          className="bg-muted/20 sm:pl-9"
          title="Start from origin"
          description="Creates the worktree from the latest matching branch on origin instead of your local branch."
          resetAction={
            settings.newWorktreesStartFromOrigin !==
            DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
              <SettingResetButton
                label="new worktrees start from origin"
                onClick={() =>
                  updateSettings({
                    newWorktreesStartFromOrigin:
                      DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.newWorktreesStartFromOrigin}
              onCheckedChange={(checked) =>
                updateSettings({
                  newWorktreesStartFromOrigin: Boolean(checked),
                })
              }
              aria-label="Start new worktrees from origin by default"
            />
          }
        />
      ) : null}

      <SettingsRow
        title="Add project starts in"
        description='Leave empty to use "~/" when the Add Project browser opens.'
        resetAction={
          settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory ? (
            <SettingResetButton
              label="add project base directory"
              onClick={() =>
                updateSettings({
                  addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
                })
              }
            />
          ) : null
        }
        control={
          <DraftInput
            className="w-full sm:w-72"
            value={settings.addProjectBaseDirectory}
            onCommit={(next) =>
              updateSettings({
                addProjectBaseDirectory: next,
              })
            }
            placeholder="~/"
            spellCheck={false}
            aria-label="Add project base directory"
          />
        }
      />

      <SettingsRow
        title="Archive confirmation"
        description="Require a second click on the inline archive action before a thread is archived."
        resetAction={
          settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
            <SettingResetButton
              label="archive confirmation"
              onClick={() =>
                updateSettings({
                  confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.confirmThreadArchive}
            onCheckedChange={(checked) =>
              updateSettings({
                confirmThreadArchive: Boolean(checked),
              })
            }
            aria-label="Confirm thread archiving"
          />
        }
      />

      <SettingsRow
        title="Delete confirmation"
        description="Ask before deleting a thread and its chat history."
        resetAction={
          settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
            <SettingResetButton
              label="delete confirmation"
              onClick={() =>
                updateSettings({
                  confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.confirmThreadDelete}
            onCheckedChange={(checked) =>
              updateSettings({
                confirmThreadDelete: Boolean(checked),
              })
            }
            aria-label="Confirm thread deletion"
          />
        }
      />

      <SettingsRow
        title="Text generation model"
        description="Configure the model used for generated commit messages, PR titles, and similar Git text."
        resetAction={
          isGitWritingModelDirty ? (
            <SettingResetButton
              label="text generation model"
              onClick={() =>
                updateSettings({
                  textGenerationModelSelection:
                    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                })
              }
            />
          ) : null
        }
        control={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <ProviderModelPicker
              activeInstanceId={textGenInstanceId}
              model={textGenModel}
              lockedProvider={null}
              instanceEntries={gitModelInstanceEntries}
              modelOptionsByInstance={gitModelOptionsByInstance}
              triggerVariant="outline"
              triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
              onInstanceModelChange={(instanceId, model) => {
                updateSettings({
                  textGenerationModelSelection: resolveAppModelSelectionState(
                    {
                      ...settings,
                      textGenerationModelSelection: createModelSelection(instanceId, model),
                    },
                    serverProviders,
                  ),
                });
              }}
            />
            <TraitsPicker
              provider={textGenProvider}
              models={
                // Use the exact instance's models (rather than the
                // first-kind-match) so a custom text-gen instance like
                // `codex_personal` gets its own model list, not the
                // default Codex one.
                textGenInstanceEntry?.models ?? []
              }
              model={textGenModel}
              prompt=""
              onPromptChange={() => {}}
              modelOptions={textGenModelOptions}
              allowPromptInjectedEffort={false}
              triggerVariant="outline"
              triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
              onModelOptionsChange={(nextOptions) => {
                updateSettings({
                  textGenerationModelSelection: resolveAppModelSelectionState(
                    {
                      ...settings,
                      textGenerationModelSelection: createModelSelection(
                        textGenInstanceId,
                        textGenModel,
                        nextOptions,
                      ),
                    },
                    serverProviders,
                  ),
                });
              }}
            />
          </div>
        }
      />
    </>
  );
}
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import type { GeneralSettingsPanelController } from "./SettingsPanels";
