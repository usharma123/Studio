import { AuthQaApproveScope, AuthQaMakeScope, AuthQaReadScope } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveQaGlobalUiAccess } from "./useQaGlobalAccess";

describe("global QA UI access", () => {
  it("uses authenticated maker scope for unprofiled clients", () => {
    expect(
      resolveQaGlobalUiAccess({
        scopes: [AuthQaReadScope, AuthQaMakeScope],
      }),
    ).toEqual({ uiRole: "maker", canCreateProject: true });
  });

  it("keeps approve-capable and root clients in the approver UI", () => {
    expect(
      resolveQaGlobalUiAccess({
        scopes: [AuthQaReadScope, AuthQaMakeScope, AuthQaApproveScope],
      }),
    ).toEqual({ uiRole: "approver", canCreateProject: true });
  });

  it("does not expose maker controls without a resolved maker grant", () => {
    expect(resolveQaGlobalUiAccess({ scopes: [] })).toEqual({
      uiRole: "approver",
      canCreateProject: false,
    });
  });

  it("fails closed while authenticated scopes are still loading", () => {
    expect(resolveQaGlobalUiAccess({ scopes: null })).toEqual({
      uiRole: "approver",
      canCreateProject: false,
    });
  });
});
