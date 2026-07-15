import { describe, expect, it } from "vite-plus/test";

import { isQaApproverDesktopProfile, qaUiRoleFromDesktopProfile } from "./qaRole";

describe("QA UI role", () => {
  it("renders root through the approver lens", () => {
    expect(qaUiRoleFromDesktopProfile("root")).toBe("approver");
  });

  it("keeps maker and approver experiences distinct", () => {
    expect(qaUiRoleFromDesktopProfile("qa:maker")).toBe("maker");
    expect(qaUiRoleFromDesktopProfile("qa:approver")).toBe("approver");
    expect(isQaApproverDesktopProfile("qa:approver")).toBe(true);
  });

  it("defaults an unscoped web session to the maker lens", () => {
    expect(qaUiRoleFromDesktopProfile(null)).toBe("maker");
  });
});
