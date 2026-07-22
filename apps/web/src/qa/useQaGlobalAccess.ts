import {
  AuthQaApproveScope,
  AuthQaMakeScope,
  type AuthEnvironmentScope,
  type QaUiRole,
} from "@t3tools/contracts";

import { usePrimarySessionState } from "~/environments/primary/sessionState";

export interface QaGlobalUiAccess {
  readonly uiRole: QaUiRole;
  readonly canCreateProject: boolean;
}

/**
 * Global QA chrome follows only the authenticated credential's scope ceiling.
 * Desktop development profiles are presentation/persona selectors, not an
 * authorization source.
 */
export function resolveQaGlobalUiAccess(input: {
  readonly scopes: ReadonlyArray<AuthEnvironmentScope> | null;
}): QaGlobalUiAccess {
  const canMake = input.scopes?.includes(AuthQaMakeScope) ?? false;
  const canApprove = input.scopes?.includes(AuthQaApproveScope) ?? false;
  return {
    uiRole: canApprove ? "approver" : canMake ? "maker" : "approver",
    canCreateProject: canMake,
  };
}

export function useQaGlobalAccess(): QaGlobalUiAccess {
  const session = usePrimarySessionState();
  const sessionResolved = session.data !== null || session.error !== null;
  const scopes = session.data?.authenticated
    ? (session.data.scopes ?? [])
    : sessionResolved
      ? []
      : null;
  return resolveQaGlobalUiAccess({ scopes });
}
