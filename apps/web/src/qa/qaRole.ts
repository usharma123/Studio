import type { DesktopDevelopmentProfile, QaUiRole } from "@t3tools/contracts";

/**
 * Trusted desktop fallback for surfaces that do not have release-scoped access.
 * Root keeps its server capabilities while intentionally using the approver UI.
 */
export function qaUiRoleFromDesktopProfile(profile: DesktopDevelopmentProfile | null): QaUiRole {
  return profile === "qa:approver" || profile === "root" ? "approver" : "maker";
}

export function isQaApproverDesktopProfile(profile: DesktopDevelopmentProfile | null): boolean {
  return qaUiRoleFromDesktopProfile(profile) === "approver";
}
