import { useArchivedThreadsPanelController } from "./SettingsPanels";
import { ArchivedThreadsPanelView } from "./ArchivedThreadsPanelView";

export function ArchivedThreadsPanel() {
  const controller = useArchivedThreadsPanelController();
  return <ArchivedThreadsPanelView controller={controller} />;
}
