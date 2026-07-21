import type { EnvironmentId } from "@t3tools/contracts";

export interface PreviewAccessIdentity {
  readonly subject: string;
  readonly sessionId: string;
  readonly environmentId: EnvironmentId;
  readonly workspaceAdministrator: boolean;
}

export type PreviewAccessDescriptor =
  | {
      readonly kind: "workspace";
      readonly ownerSubject: string;
    }
  | {
      readonly kind: "qa-conversation";
      readonly ownerSubject: string;
      readonly conversationThreadId: string;
      readonly releaseThreadId: string;
      readonly projectId: string;
      readonly environmentId: EnvironmentId;
    }
  | {
      readonly kind: "qa-release";
      readonly releaseThreadId: string;
      readonly projectId: string;
    };

export interface PreviewAccessGrant {
  readonly identity: PreviewAccessIdentity;
  readonly descriptor: PreviewAccessDescriptor;
}

export const previewAccessDescriptorsEqual = (
  left: PreviewAccessDescriptor,
  right: PreviewAccessDescriptor,
): boolean => {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "workspace":
      return right.kind === "workspace" && left.ownerSubject === right.ownerSubject;
    case "qa-conversation":
      return (
        right.kind === "qa-conversation" &&
        left.ownerSubject === right.ownerSubject &&
        left.conversationThreadId === right.conversationThreadId &&
        left.releaseThreadId === right.releaseThreadId &&
        left.projectId === right.projectId &&
        left.environmentId === right.environmentId
      );
    case "qa-release":
      return (
        right.kind === "qa-release" &&
        left.releaseThreadId === right.releaseThreadId &&
        left.projectId === right.projectId
      );
  }
};

export const previewGrantAllows = (
  grant: PreviewAccessGrant,
  descriptor: PreviewAccessDescriptor,
): boolean =>
  grant.identity.workspaceAdministrator ||
  previewAccessDescriptorsEqual(grant.descriptor, descriptor);
