import { useProviderSettingsPanelController } from "./SettingsPanels";
import { ProviderSettingsPanelView } from "./ProviderSettingsPanelView";

export function ProviderSettingsPanel() {
  const controller = useProviderSettingsPanelController();
  return <ProviderSettingsPanelView controller={controller} />;
}
