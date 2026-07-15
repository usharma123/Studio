import type { ReactNode } from "react";
import { OpenAddProjectCommandPaletteContext } from "./commandPaletteState";

export function OpenAddProjectCommandPaletteProvider(props: {
  readonly children: ReactNode;
  readonly openAddProject: () => void;
}) {
  return (
    <OpenAddProjectCommandPaletteContext value={props.openAddProject}>
      {props.children}
    </OpenAddProjectCommandPaletteContext>
  );
}
