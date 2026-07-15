import { describe, expectTypeOf, it } from "vite-plus/test";

import type { SelectableMarkdownText as SelectableMarkdownTextFallback } from "./SelectableMarkdownText.tsx";
import type { ComposerEditor as ComposerEditorFallback } from "./T3ComposerEditor.tsx";
import type { T3KeyboardCommands as T3KeyboardCommandsFallback } from "./T3KeyboardCommands.tsx";

describe("native platform fallbacks", () => {
  it("keep callable contracts for platforms without specialized implementations", () => {
    expectTypeOf<typeof SelectableMarkdownTextFallback>().toBeFunction();
    expectTypeOf<typeof ComposerEditorFallback>().toBeFunction();
    expectTypeOf<typeof T3KeyboardCommandsFallback>().toBeFunction();
  });
});
