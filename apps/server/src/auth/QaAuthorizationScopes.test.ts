import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthQaApproverScopes,
  AuthQaApproveScope,
  AuthQaChatScope,
  AuthQaMakerScopes,
  AuthQaMakeScope,
  AuthQaReadScope,
  AuthTerminalOperateScope,
  ORCHESTRATION_WS_METHODS,
  WS_METHODS,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";

import { redactServerConfigPathForScopes, requiredScopesForRpcMethod } from "../ws.ts";

it("assigns QA reads, maker mutations, and approval decisions distinct scopes", () => {
  expect(requiredScopesForRpcMethod(WS_METHODS.qaGetSnapshot)).toEqual([AuthQaReadScope]);
  expect(requiredScopesForRpcMethod(WS_METHODS.qaUpdateRequirement)).toEqual([AuthQaMakeScope]);
  expect(requiredScopesForRpcMethod(WS_METHODS.qaSubmitStrategy)).toEqual([AuthQaMakeScope]);
  expect(requiredScopesForRpcMethod(WS_METHODS.qaReviewStrategy)).toEqual([AuthQaApproveScope]);
  expect(requiredScopesForRpcMethod(WS_METHODS.qaReviewReadiness)).toEqual([AuthQaApproveScope]);
});

it("keeps release chat additive without granting generic orchestration", () => {
  expect(requiredScopesForRpcMethod(ORCHESTRATION_WS_METHODS.dispatchCommand)).toEqual([
    AuthOrchestrationOperateScope,
    AuthQaChatScope,
  ]);
  expect(requiredScopesForRpcMethod(ORCHESTRATION_WS_METHODS.subscribeThread)).toEqual([
    AuthOrchestrationReadScope,
    AuthQaChatScope,
  ]);
  expect(requiredScopesForRpcMethod(ORCHESTRATION_WS_METHODS.subscribeShell)).toEqual([
    AuthOrchestrationReadScope,
  ]);
});

it("requires the preview scope for every preview surface method", () => {
  expect(requiredScopesForRpcMethod(WS_METHODS.previewOpen)).toEqual([AuthPreviewOperateScope]);
  expect(requiredScopesForRpcMethod(WS_METHODS.previewAutomationConnect)).toEqual([
    AuthPreviewOperateScope,
  ]);
  expect(requiredScopesForRpcMethod(WS_METHODS.subscribePreviewEvents)).toEqual([
    AuthPreviewOperateScope,
  ]);
});

it("keeps local server discovery out of the QA-only preview scope", () => {
  expect(requiredScopesForRpcMethod(WS_METHODS.subscribeDiscoveredLocalServers)).toEqual([
    AuthOrchestrationReadScope,
  ]);
});

it("keeps QA-only principals out of generic shell, terminal, and workspace resources", () => {
  for (const qaScopes of [AuthQaMakerScopes, AuthQaApproverScopes]) {
    expect(qaScopes).not.toContain(AuthOrchestrationReadScope);
    expect(qaScopes).not.toContain(AuthOrchestrationOperateScope);
    expect(requiredScopesForRpcMethod(ORCHESTRATION_WS_METHODS.subscribeShell)).not.toContain(
      AuthQaChatScope,
    );
    expect(requiredScopesForRpcMethod(WS_METHODS.projectsListEntries)).toEqual([
      AuthOrchestrationReadScope,
    ]);
    expect(requiredScopesForRpcMethod(WS_METHODS.terminalOpen)).toEqual([AuthTerminalOperateScope]);
  }
});

it("redacts backend filesystem paths from QA-only server configuration", () => {
  expect(
    redactServerConfigPathForScopes(AuthQaMakerScopes, "/private/workspace", "workspace"),
  ).toBe("workspace");
  expect(redactServerConfigPathForScopes(AuthQaApproverScopes, "/private/logs", "logs")).toBe(
    "logs",
  );
  expect(
    redactServerConfigPathForScopes(
      [AuthOrchestrationReadScope],
      "/private/workspace",
      "workspace",
    ),
  ).toBe("/private/workspace");
});
