import { RouterProvider } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { isElectron } from "./env";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

const DesktopRendererHosts = lazy(() =>
  import("./DesktopRendererHosts").then((module) => ({
    default: module.DesktopRendererHosts,
  })),
);

/**
 * Owns renderer-wide providers. The Electron browser host intentionally sits
 * outside the router so its webviews survive route transitions, but it must
 * share the same atom registry as routed UI.
 */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
      {isElectron ? (
        <Suspense fallback={null}>
          <DesktopRendererHosts />
        </Suspense>
      ) : null}
    </AppAtomRegistryProvider>
  );
}
