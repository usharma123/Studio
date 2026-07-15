import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
export function GeneralAppearanceSettings({
  controller,
}: {
  readonly controller: GeneralSettingsPanelController;
}) {
  const { THEME_OPTIONS, TIMESTAMP_FORMAT_LABELS, setTheme, settings, theme, updateSettings } =
    controller;
  return (
    <>
      <SettingsRow
        title="Theme"
        description="Choose how T3 Code looks across the app."
        resetAction={
          theme !== "system" ? (
            <SettingResetButton label="theme" onClick={() => setTheme("system")} />
          ) : null
        }
        control={
          <Select
            value={theme}
            onValueChange={(value) => {
              if (value === "system" || value === "light" || value === "dark") {
                setTheme(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Theme preference">
              <SelectValue>
                {THEME_OPTIONS.find((option) => option.value === theme)?.label ?? "System"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {THEME_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        title="Time format"
        description="System default follows your browser or OS clock preference."
        resetAction={
          settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
            <SettingResetButton
              label="time format"
              onClick={() =>
                updateSettings({
                  timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
                })
              }
            />
          ) : null
        }
        control={
          <Select
            value={settings.timestampFormat}
            onValueChange={(value) => {
              if (value === "locale" || value === "12-hour" || value === "24-hour") {
                updateSettings({
                  timestampFormat: value,
                });
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Timestamp format">
              <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="locale">
                {TIMESTAMP_FORMAT_LABELS.locale}
              </SelectItem>
              <SelectItem hideIndicator value="12-hour">
                {TIMESTAMP_FORMAT_LABELS["12-hour"]}
              </SelectItem>
              <SelectItem hideIndicator value="24-hour">
                {TIMESTAMP_FORMAT_LABELS["24-hour"]}
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        title="Word wrap"
        description="Wrap long lines in code blocks, tables, diffs, and file previews by default."
        resetAction={
          settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap ? (
            <SettingResetButton
              label="word wrapping"
              onClick={() =>
                updateSettings({
                  wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.wordWrap}
            onCheckedChange={(checked) =>
              updateSettings({
                wordWrap: Boolean(checked),
              })
            }
            aria-label="Wrap code, tables, diffs, and file previews by default"
          />
        }
      />

      <SettingsRow
        title="Hide whitespace changes"
        description="Set whether the diff panel ignores whitespace-only edits by default."
        resetAction={
          settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace ? (
            <SettingResetButton
              label="diff whitespace changes"
              onClick={() =>
                updateSettings({
                  diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.diffIgnoreWhitespace}
            onCheckedChange={(checked) =>
              updateSettings({
                diffIgnoreWhitespace: Boolean(checked),
              })
            }
            aria-label="Hide whitespace changes by default"
          />
        }
      />

      <SettingsRow
        title="Assistant output"
        description="Show token-by-token output while a response is in progress."
        resetAction={
          settings.enableAssistantStreaming !==
          DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming ? (
            <SettingResetButton
              label="assistant output"
              onClick={() =>
                updateSettings({
                  enableAssistantStreaming: DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.enableAssistantStreaming}
            onCheckedChange={(checked) =>
              updateSettings({
                enableAssistantStreaming: Boolean(checked),
              })
            }
            aria-label="Stream assistant messages"
          />
        }
      />

      <SettingsRow
        title="Provider update checks"
        description="Check installed provider CLIs for newer available versions."
        resetAction={
          settings.enableProviderUpdateChecks !==
          DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks ? (
            <SettingResetButton
              label="provider update checks"
              onClick={() =>
                updateSettings({
                  enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={settings.enableProviderUpdateChecks}
            onCheckedChange={(checked) =>
              updateSettings({
                enableProviderUpdateChecks: Boolean(checked),
              })
            }
            aria-label="Check provider versions"
          />
        }
      />
    </>
  );
}
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import type { GeneralSettingsPanelController } from "./SettingsPanels";
