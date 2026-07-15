import { describe, expect, it } from "vite-plus/test";

import {
  changedWorkbookRows,
  discardWorkbookDrafts,
  effectiveWorkbookRow,
  updateWorkbookDraft,
} from "./workbookGridModel";

interface Row {
  readonly id: string;
  readonly value: string;
}

describe("workbook grid drafts", () => {
  it("keeps edits isolated until Save consumes changed rows", () => {
    const original = { id: "r1", value: "Original" };
    const edited = { ...original, value: "Edited" };
    const drafts = updateWorkbookDraft(new Map<string, Row>(), original.id, edited);
    expect(original.value).toBe("Original");
    expect(effectiveWorkbookRow(original, original.id, drafts)).toEqual(edited);
    expect(changedWorkbookRows(drafts)).toEqual([edited]);
  });

  it("Discard removes every uncommitted edit", () => {
    const drafts = updateWorkbookDraft(new Map<string, Row>(), "r1", {
      id: "r1",
      value: "Edited",
    });
    expect(discardWorkbookDrafts(drafts)).toHaveLength(0);
  });
});
