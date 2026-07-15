import { SettingsPageContainer } from "./settingsLayout";
import { DiagnosticsRuntimeSections } from "./DiagnosticsRuntimeSections";
import { DiagnosticsTraceSections } from "./DiagnosticsTraceSections";
export function DiagnosticsSettingsPanelView({
  controller,
}: {
  readonly controller: DiagnosticsSettingsPanelController;
}) {
  return (
    <SettingsPageContainer>
      <DiagnosticsRuntimeSections controller={controller} />

      <DiagnosticsTraceSections controller={controller} />
    </SettingsPageContainer>
  );
}
import type { DiagnosticsSettingsPanelController } from "./DiagnosticsSettings";
