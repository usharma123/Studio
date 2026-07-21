import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as QaIam from "../qa/QaIam.ts";
import type { PreviewAccessDescriptor, PreviewAccessIdentity } from "./Access.ts";
import { makePreviewAuthorization } from "./Authorization.ts";
import * as PreviewManager from "./Manager.ts";

const environmentId = EnvironmentId.make("preview-authorization-test");
const makerIdentity: PreviewAccessIdentity = {
  subject: "local:qa:maker",
  sessionId: "session-maker",
  environmentId,
  workspaceAdministrator: false,
};

const managerWith = (descriptor?: PreviewAccessDescriptor) =>
  ({
    getAccessDescriptor: () => Effect.succeed(Option.fromNullishOr(descriptor)),
  }) as unknown as PreviewManager.PreviewManager["Service"];

const conversationAccess = (subject: string, conversationThreadId: string) => ({
  principal: { id: `principal:${subject}`, subject, displayName: subject },
  organizationId: "organization-1",
  projectId: "project-1",
  projectName: "Project",
  role: "qa:maker" as const,
  capabilities: ["qa:read", "qa:make", "qa:chat", "qa:test-application"] as const,
  releaseThreadId: "release-1",
  conversation: {
    releaseThreadId: "release-1",
    conversationThreadId,
    principalId: `principal:${subject}`,
    environmentId,
  },
});

it.effect("authorizes only the exact owner of a QA conversation preview", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("conversation-maker");
    const descriptor: PreviewAccessDescriptor = {
      kind: "qa-conversation",
      ownerSubject: makerIdentity.subject,
      conversationThreadId: threadId,
      releaseThreadId: "release-1",
      projectId: "project-1",
      environmentId,
    };
    const iam = {
      authorizeConversation: ({ subject }: { readonly subject: string }) =>
        subject === makerIdentity.subject
          ? Effect.succeed(conversationAccess(subject, threadId))
          : Effect.fail(
              new QaIam.QaIamError({
                code: "conversation_not_found",
                message: "not found",
              }),
            ),
    } as unknown as QaIam.QaIam["Service"];

    const maker = makePreviewAuthorization({
      identity: makerIdentity,
      iam,
      manager: managerWith(descriptor),
    });
    expect((yield* maker.authorizeThread(threadId)).descriptor).toEqual(descriptor);

    const approver = makePreviewAuthorization({
      identity: { ...makerIdentity, subject: "local:qa:approver", sessionId: "session-approver" },
      iam,
      manager: managerWith(descriptor),
    });
    const denied = yield* approver.authorizeThread(threadId).pipe(Effect.flip);
    expect(denied._tag).toBe("EnvironmentAuthorizationError");
  }),
);

it.effect("gives only the canonical root subject the workspace administrator override", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-generic");
    const descriptor: PreviewAccessDescriptor = {
      kind: "workspace",
      ownerSubject: "local:qa:maker",
    };
    const policy = makePreviewAuthorization({
      identity: {
        subject: "local:root",
        sessionId: "session-root",
        environmentId,
        workspaceAdministrator: true,
      },
      iam: {} as unknown as QaIam.QaIam["Service"],
      manager: managerWith(descriptor),
    });

    expect((yield* policy.authorizeThread(threadId)).descriptor).toEqual(descriptor);
  }),
);

it.effect("preserves QA conversation ownership when root opens the preview first", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("conversation-maker-root-first");
    const makerConversation = conversationAccess(makerIdentity.subject, threadId);
    const iam = {
      resolveConversationContext: () => Effect.succeed(makerConversation),
      authorizeRelease: () =>
        Effect.succeed({
          ...makerConversation,
          principal: {
            id: "principal:local:root",
            subject: "local:root",
            displayName: "Root",
          },
          role: "root" as const,
          capabilities: QaIam.capabilitiesForQaProjectRole("root"),
        }),
      authorizeConversation: ({ subject }: { readonly subject: string }) =>
        subject === makerIdentity.subject
          ? Effect.succeed(makerConversation)
          : Effect.fail(
              new QaIam.QaIamError({
                code: "conversation_not_found",
                message: "not found",
              }),
            ),
    } as unknown as QaIam.QaIam["Service"];
    const root = makePreviewAuthorization({
      identity: {
        subject: "local:root",
        sessionId: "session-root",
        environmentId,
        workspaceAdministrator: true,
      },
      iam,
      manager: managerWith(),
    });

    const rootGrant = yield* root.authorizeThread(threadId);
    expect(rootGrant.descriptor).toEqual({
      kind: "qa-conversation",
      ownerSubject: makerIdentity.subject,
      conversationThreadId: threadId,
      releaseThreadId: "release-1",
      projectId: "project-1",
      environmentId,
    });

    const maker = makePreviewAuthorization({
      identity: makerIdentity,
      iam,
      manager: managerWith(rootGrant.descriptor),
    });
    expect((yield* maker.authorizeThread(threadId)).descriptor).toEqual(rootGrant.descriptor);
  }),
);

it.effect("classifies an unbound root coding thread as a workspace preview", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-root-coding");
    const notFound = (code: "conversation_not_found" | "release_not_found") =>
      new QaIam.QaIamError({ code, message: "not found" });
    const policy = makePreviewAuthorization({
      identity: {
        subject: "local:root",
        sessionId: "session-root",
        environmentId,
        workspaceAdministrator: true,
      },
      iam: {
        resolveConversationContext: () => Effect.fail(notFound("conversation_not_found")),
        authorizeRelease: () => Effect.fail(notFound("release_not_found")),
      } as unknown as QaIam.QaIam["Service"],
      manager: managerWith(),
    });

    expect((yield* policy.authorizeThread(threadId)).descriptor).toEqual({
      kind: "workspace",
      ownerSubject: "local:root",
    });
  }),
);
