import { describe, expect, it } from "vite-plus/test";

import { qaWorkflowErrorMessage } from "./errorMessage";

describe("qaWorkflowErrorMessage", () => {
  it("prefers the safe QA operation error nested inside a runtime wrapper", () => {
    expect(
      qaWorkflowErrorMessage({
        message: "A command failed",
        cause: {
          _tag: "QaOperationError",
          code: "persistence_failed",
          message: "QA workflow persistence failed during review.",
        },
      }),
    ).toBe("QA workflow persistence failed during review.");
  });

  it("keeps a direct transport error message when no QA operation error exists", () => {
    expect(qaWorkflowErrorMessage(new Error("The QA service is unavailable."))).toBe(
      "The QA service is unavailable.",
    );
  });

  it("uses an actionable fallback for unknown failures", () => {
    expect(qaWorkflowErrorMessage(null)).toContain("Retry");
  });
});
