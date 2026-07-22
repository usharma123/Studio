import {
  AuthPreviewOperateScope,
  EnvironmentAuthorizationError,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as QaIam from "../qa/QaIam.ts";
import type * as PreviewManager from "./Manager.ts";
import type {
  PreviewAccessDescriptor,
  PreviewAccessGrant,
  PreviewAccessIdentity,
} from "./Access.ts";

const denied = () =>
  new EnvironmentAuthorizationError({
    message: "The authenticated principal cannot access this preview resource.",
    requiredScope: AuthPreviewOperateScope,
  });

const conversationDescriptor = (access: QaIam.QaConversationAccess): PreviewAccessDescriptor => ({
  kind: "qa-conversation",
  ownerSubject: access.principal.subject,
  conversationThreadId: access.conversation.conversationThreadId,
  releaseThreadId: access.releaseThreadId,
  projectId: access.projectId,
  environmentId: access.conversation.environmentId,
});

const releaseDescriptor = (access: QaIam.QaReleaseAccess): PreviewAccessDescriptor => ({
  kind: "qa-release",
  releaseThreadId: access.releaseThreadId,
  projectId: access.projectId,
});

export const makePreviewAuthorization = (input: {
  readonly identity: PreviewAccessIdentity;
  readonly iam: QaIam.QaIam["Service"];
  readonly manager: PreviewManager.PreviewManager["Service"];
}) => {
  const authorizeDescriptor = Effect.fn("PreviewAuthorization.authorizeDescriptor")(function* (
    descriptor: PreviewAccessDescriptor,
  ): Effect.fn.Return<PreviewAccessGrant, EnvironmentAuthorizationError> {
    if (input.identity.workspaceAdministrator) {
      return { identity: input.identity, descriptor };
    }
    switch (descriptor.kind) {
      case "workspace": {
        if (descriptor.ownerSubject !== input.identity.subject) return yield* denied();
        return { identity: input.identity, descriptor };
      }
      case "qa-conversation": {
        const access = yield* input.iam
          .authorizeConversation({
            subject: input.identity.subject,
            conversationThreadId: descriptor.conversationThreadId,
            environmentId: input.identity.environmentId,
            capability: "qa:test-application",
          })
          .pipe(Effect.mapError(denied));
        if (
          access.principal.subject !== descriptor.ownerSubject ||
          access.releaseThreadId !== descriptor.releaseThreadId ||
          access.projectId !== descriptor.projectId ||
          access.conversation.environmentId !== descriptor.environmentId
        ) {
          return yield* denied();
        }
        return { identity: input.identity, descriptor };
      }
      case "qa-release": {
        const access = yield* input.iam
          .authorizeRelease({
            subject: input.identity.subject,
            releaseThreadId: descriptor.releaseThreadId,
            capability: "qa:test-application",
          })
          .pipe(Effect.mapError(denied));
        if (access.projectId !== descriptor.projectId) return yield* denied();
        return { identity: input.identity, descriptor };
      }
    }
  });

  const classifyUnowned = Effect.fn("PreviewAuthorization.classifyUnowned")(function* (
    threadId: ThreadId,
  ): Effect.fn.Return<PreviewAccessDescriptor, EnvironmentAuthorizationError> {
    const conversation = yield* (
      input.identity.workspaceAdministrator
        ? input.iam.resolveConversationContext({
            conversationThreadId: threadId,
            environmentId: input.identity.environmentId,
          })
        : input.iam.authorizeConversation({
            subject: input.identity.subject,
            conversationThreadId: threadId,
            environmentId: input.identity.environmentId,
            capability: "qa:test-application",
          })
    ).pipe(
      Effect.map(Option.some),
      Effect.catch((cause) =>
        cause.code === "conversation_not_found"
          ? Effect.succeed(Option.none())
          : Effect.fail(denied()),
      ),
    );
    if (Option.isSome(conversation)) {
      if (input.identity.workspaceAdministrator) {
        yield* input.iam
          .authorizeRelease({
            subject: input.identity.subject,
            releaseThreadId: conversation.value.releaseThreadId,
            capability: "qa:test-application",
          })
          .pipe(Effect.mapError(denied));
      }
      return conversationDescriptor(conversation.value);
    }

    const release = yield* input.iam
      .authorizeRelease({
        subject: input.identity.subject,
        releaseThreadId: threadId,
        capability: "qa:test-application",
      })
      .pipe(
        Effect.map(Option.some),
        Effect.catch((cause) =>
          input.identity.workspaceAdministrator && cause.code === "release_not_found"
            ? Effect.succeed(Option.none())
            : Effect.fail(denied()),
        ),
      );
    return Option.match(release, {
      onNone: (): PreviewAccessDescriptor => ({
        kind: "workspace",
        ownerSubject: input.identity.subject,
      }),
      onSome: releaseDescriptor,
    });
  });

  const authorizeThread = Effect.fn("PreviewAuthorization.authorizeThread")(function* (
    threadId: ThreadId,
  ): Effect.fn.Return<PreviewAccessGrant, EnvironmentAuthorizationError> {
    const existing = yield* input.manager.getAccessDescriptor(threadId);
    const descriptor = Option.isSome(existing) ? existing.value : yield* classifyUnowned(threadId);
    if (descriptor.kind === "qa-conversation" && !input.identity.workspaceAdministrator) {
      const access = yield* input.iam
        .authorizeConversation({
          subject: input.identity.subject,
          conversationThreadId: threadId,
          environmentId: input.identity.environmentId,
          capability: "qa:test-application",
        })
        .pipe(Effect.mapError(denied));
      if (
        access.principal.subject !== descriptor.ownerSubject ||
        access.releaseThreadId !== descriptor.releaseThreadId ||
        access.projectId !== descriptor.projectId
      ) {
        return yield* denied();
      }
      return { identity: input.identity, descriptor };
    }
    return yield* authorizeDescriptor(descriptor);
  });

  return { authorizeDescriptor, authorizeThread } as const;
};
