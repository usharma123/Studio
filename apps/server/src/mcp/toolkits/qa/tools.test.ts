import { expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { QaToolkit } from "./tools.ts";

it("exposes proposal-only QA tools with provider-compatible schemas", () => {
  const names = Object.values(QaToolkit.tools).map((tool) => tool.name);
  expect(names).toEqual([
    "qa_get_active_stage",
    "qa_report_stage_progress",
    "qa_submit_requirements",
    "qa_submit_strategy",
    "qa_submit_scenarios",
    "qa_submit_test_cases",
    "qa_submit_scripts",
  ]);
  expect(names.some((name) => /approve|sign|close/u.test(name))).toBe(false);

  for (const tool of Object.values(QaToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool) as { readonly type?: unknown };
    expect(tool.description?.length ?? 0).toBeGreaterThan(40);
    expect(schema.type, `${tool.name} must export an object schema`).toBe("object");
  }
});
