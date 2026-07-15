import { useAboutVersionSectionController } from "./SettingsPanels";
import { AboutVersionSectionView } from "./AboutVersionSectionView";

export function AboutVersionSection() {
  const controller = useAboutVersionSectionController();
  return <AboutVersionSectionView controller={controller} />;
}
