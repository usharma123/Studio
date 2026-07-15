import { createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsRouteContent } from "../components/settings/SettingsRouteContent";
function SettingsRouteLayout() {
  return <SettingsRouteContent />;
}
export const Route = createFileRoute("/settings")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({
        to: "/pair",
        replace: true,
      });
    }
    if (location.pathname === "/settings") {
      throw redirect({
        to: "/settings/general",
        replace: true,
      });
    }
  },
  component: SettingsRouteLayout,
});
