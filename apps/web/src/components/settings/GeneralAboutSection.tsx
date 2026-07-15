import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { AboutVersionTitle } from "./AboutVersionTitle";
import { AboutVersionSection } from "./AboutVersionSection";
export function GeneralAboutSection({
  controller,
}: {
  readonly controller: GeneralSettingsPanelController;
}) {
  const { diagnosticsDescription } = controller;
  return (
    <>
      <SettingsSection title="About">
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <SettingsRow
            title={<AboutVersionTitle />}
            description="Current version of the application."
          />
        )}
        <SettingsRow
          title="Diagnostics"
          description={diagnosticsDescription}
          control={
            <Button render={<Link to="/settings/diagnostics" />} size="xs" variant="outline">
              View diagnostics
            </Button>
          }
        />
      </SettingsSection>
    </>
  );
}
import { HOSTED_APP_CHANNEL } from "../../branding";
import { isElectron } from "../../env";
import type { GeneralSettingsPanelController } from "./SettingsPanels";
