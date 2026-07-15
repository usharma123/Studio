import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { NewTaskWelcome } from "./NewTaskWelcome";
import { NEW_TASK_SUGGESTIONS, QA_TASK_SUGGESTIONS } from "./NewTaskWelcome.data";

describe("NewTaskWelcome", () => {
  it("renders a project-aware heading and every starter action", () => {
    const markup = renderToStaticMarkup(
      <NewTaskWelcome projectName="Repro" onSelectSuggestion={vi.fn()} />,
    );

    expect(markup).toContain("What should we build in");
    expect(markup).toContain("Repro");
    for (const suggestion of NEW_TASK_SUGGESTIONS) {
      expect(markup).toContain(suggestion.label);
    }
  });

  it("renders release-focused actions without developer language in QA mode", () => {
    const markup = renderToStaticMarkup(
      <NewTaskWelcome projectName="Repro" mode="qa" onSelectSuggestion={vi.fn()} />,
    );

    expect(markup).toContain("What would you like to validate in");
    expect(markup).not.toContain("What should we build in");
    expect(markup).not.toContain("Explore and understand code");
    for (const suggestion of QA_TASK_SUGGESTIONS) {
      expect(markup).toContain(suggestion.label);
    }
  });

  it("keeps starter prompts distinct and implementation-ready", () => {
    expect(new Set(NEW_TASK_SUGGESTIONS.map((suggestion) => suggestion.id)).size).toBe(
      NEW_TASK_SUGGESTIONS.length,
    );
    expect(NEW_TASK_SUGGESTIONS.every((suggestion) => suggestion.prompt.length > 40)).toBe(true);
  });
});
