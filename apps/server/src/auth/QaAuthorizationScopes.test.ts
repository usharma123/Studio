import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthQaApproveScope,
  AuthQaChatScope,
  AuthQaMakeScope,
  AuthQaReadScope,
  ORCHESTRATION_WS_METHODS,
  WS_METHODS,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";

import { requiredScopesForRpcMethod } from "../ws.ts";

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
