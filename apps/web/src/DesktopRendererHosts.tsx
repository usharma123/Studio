import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { PreviewAutomationHosts } from "./components/preview/PreviewAutomationHosts";

/**
 * Renderer-wide Electron hosts live behind one lazy boundary so their preview,
 * automation, and webview dependencies never enter the regular web entry path.
 */
export function DesktopRendererHosts() {
  return (
    <>
      <PreviewAutomationHosts />
      <ElectronBrowserHost />
    </>
  );
}
