import { useGeneralSettingsPanelController } from "./SettingsPanels";
import { GeneralSettingsPanelView } from "./GeneralSettingsPanelView";

export function GeneralSettingsPanel() {
  const controller = useGeneralSettingsPanelController();
  return <GeneralSettingsPanelView controller={controller} />;
}
