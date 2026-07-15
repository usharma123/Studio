import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { GeneralAppearanceSettings } from "./GeneralAppearanceSettings";
import { GeneralWorkflowSettings } from "./GeneralWorkflowSettings";
import { GeneralAboutSection } from "./GeneralAboutSection";
export function GeneralSettingsPanelView({
  controller,
}: {
  readonly controller: GeneralSettingsPanelController;
}) {
  return (
    <SettingsPageContainer>
      <SettingsSection title="General">
        <GeneralAppearanceSettings controller={controller} />
        <GeneralWorkflowSettings controller={controller} />
      </SettingsSection>

      <GeneralAboutSection controller={controller} />
    </SettingsPageContainer>
  );
}
import type { GeneralSettingsPanelController } from "./SettingsPanels";
