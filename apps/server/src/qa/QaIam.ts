import * as NodeCrypto from "node:crypto";

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { QaDatabase } from "./QaDatabase.ts";

export const QA_PROJECT_ROLES = ["root", "qa:maker", "qa:approver"] as const;
export type QaProjectRole = (typeof QA_PROJECT_ROLES)[number];

export const QA_IAM_CAPABILITIES = [
  "qa:read",
  "qa:make",
  "qa:approve",
  "qa:chat",
  "qa:test-application",
] as const;
export type QaIamCapability = (typeof QA_IAM_CAPABILITIES)[number];

const ROLE_CAPABILITIES = {
  root: QA_IAM_CAPABILITIES,
  "qa:maker": ["qa:read", "qa:make", "qa:chat", "qa:test-application"],
  "qa:approver": ["qa:read", "qa:approve", "qa:chat", "qa:test-application"],
} as const satisfies Record<QaProjectRole, ReadonlyArray<QaIamCapability>>;

const roleSet = new Set<string>(QA_PROJECT_ROLES);
const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString);

export function isQaProjectRole(value: string): value is QaProjectRole {
  return roleSet.has(value);
}

export function capabilitiesForQaProjectRole(role: QaProjectRole): ReadonlyArray<QaIamCapability> {
  return ROLE_CAPABILITIES[role];
}

export const QaIamErrorCode = Schema.Literals([
  "principal_not_found",
  "project_access_denied",
  "capability_denied",
  "release_not_found",
  "conversation_not_found",
  "conversation_conflict",
  "persistence_error",
]);
export type QaIamErrorCode = typeof QaIamErrorCode.Type;

export class QaIamError extends Schema.TaggedErrorClass<QaIamError>()("QaIamError", {
  code: QaIamErrorCode,
  message: Schema.String,
  operation: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {}

const isQaIamError = Schema.is(QaIamError);

export interface QaPrincipal {
  readonly id: string;
  readonly subject: string;
  readonly displayName: string;
}

export interface QaProjectAccess {
  readonly principal: QaPrincipal;
  readonly organizationId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly role: QaProjectRole;
  readonly capabilities: ReadonlyArray<QaIamCapability>;
}

export interface QaReleaseAccess extends QaProjectAccess {
  readonly releaseThreadId: string;
}

export interface QaReleaseConversationBinding {
  readonly releaseThreadId: string;
  readonly conversationThreadId: string;
  readonly principalId: string;
}

export interface QaConversationAccess extends QaReleaseAccess {
  readonly conversation: QaReleaseConversationBinding;
}

export interface QaAuditEventReceipt {
  readonly id: string;
  readonly occurredAt: string;
}

type ResolveProjectInput = {
  readonly subject: string;
  readonly projectId: string;
};

type AuthorizeProjectInput = ResolveProjectInput & {
  readonly capability: QaIamCapability;
};

type RegisterProjectInput = {
  readonly subject: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly repositoryReference?: string;
};

type AuthorizeReleaseInput = {
  readonly subject: string;
  readonly releaseThreadId: string;
  readonly capability: QaIamCapability;
};

type BindReleaseConversationInput = {
  readonly subject: string;
  readonly releaseThreadId: string;
  readonly conversationThreadId: string;
};

type ResolveConversationInput = {
  readonly subject: string;
  readonly conversationThreadId: string;
  readonly capability: QaIamCapability;
};

type AuditMetadataValue = string | number | boolean | null;

type AppendAuditEventInput = {
  readonly subject: string;
  readonly projectId: string;
  readonly releaseThreadId?: string;
  readonly conversationThreadId?: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata?: Readonly<Record<string, AuditMetadataValue>>;
};

type QaIamShape = {
  readonly getPrincipalBySubject: (subject: string) => Effect.Effect<QaPrincipal, QaIamError>;
  readonly listAssignedProjects: (
    subject: string,
  ) => Effect.Effect<ReadonlyArray<QaProjectAccess>, QaIamError>;
  readonly resolveProjectAccess: (
    input: ResolveProjectInput,
  ) => Effect.Effect<QaProjectAccess, QaIamError>;
  readonly authorizeProject: (
    input: AuthorizeProjectInput,
  ) => Effect.Effect<QaProjectAccess, QaIamError>;
  readonly registerProject: (
    input: RegisterProjectInput,
  ) => Effect.Effect<QaProjectAccess, QaIamError>;
  readonly authorizeRelease: (
    input: AuthorizeReleaseInput,
  ) => Effect.Effect<QaReleaseAccess, QaIamError>;
  readonly bindReleaseConversation: (
    input: BindReleaseConversationInput,
  ) => Effect.Effect<QaReleaseConversationBinding, QaIamError>;
  readonly authorizeConversation: (
    input: ResolveConversationInput,
  ) => Effect.Effect<QaConversationAccess, QaIamError>;
  readonly resolveConversationContext: (
    conversationThreadId: string,
  ) => Effect.Effect<QaConversationAccess, QaIamError>;
  readonly appendAuditEvent: (
    input: AppendAuditEventInput,
  ) => Effect.Effect<QaAuditEventReceipt, QaIamError>;
};

export class QaIam extends Context.Service<QaIam, QaIamShape>()("t3/qa/QaIam") {}

type PrincipalRow = {
  readonly id: string;
  readonly subject: string;
  readonly displayName: string;
};

type ProjectAccessRow = PrincipalRow & {
  readonly organizationId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly role: string;
};

type ProjectRegistrationContextRow = {
  readonly organizationId: string;
  readonly sourceProjectId: string;
  readonly role: string;
};

type ProjectOrganizationRow = {
  readonly organizationId: string;
};

type ReleaseProjectRow = {
  readonly projectId: string;
};

type ConversationRow = {
  readonly releaseThreadId: string;
  readonly conversationThreadId: string;
  readonly principalId: string;
};

const domainError = (code: QaIamErrorCode, message: string) => new QaIamError({ code, message });

const persistenceError = (operation: string, cause: unknown) =>
  new QaIamError({
    code: "persistence_error",
    message: "The QA identity store operation failed.",
    operation,
    cause,
  });

function toProjectAccess(row: ProjectAccessRow): QaProjectAccess | null {
  if (!isQaProjectRole(row.role)) return null;
  return {
    principal: {
      id: row.id,
      subject: row.subject,
      displayName: row.displayName,
    },
    organizationId: row.organizationId,
    projectId: row.projectId,
    projectName: row.projectName,
    role: row.role,
    capabilities: capabilitiesForQaProjectRole(row.role),
  };
}

export const make = Effect.gen(function* () {
  const sql = yield* QaDatabase;

  const getPrincipalBySubject = Effect.fn("QaIam.getPrincipalBySubject")(function* (
    subject: string,
  ) {
    const rows = yield* sql<PrincipalRow>`
      SELECT id, subject, display_name AS "displayName"
      FROM application_principals
      WHERE subject = ${subject} AND status = 'active'
    `.pipe(Effect.mapError((cause) => persistenceError("getPrincipalBySubject", cause)));
    const principal = rows[0];
    if (!principal) {
      return yield* domainError(
        "principal_not_found",
        "The authenticated principal is not registered or is disabled.",
      );
    }
    return principal;
  });

  const listAssignedProjects = Effect.fn("QaIam.listAssignedProjects")(function* (subject: string) {
    const principal = yield* getPrincipalBySubject(subject);
    const rows = yield* sql<ProjectAccessRow>`
      SELECT
        principals.id,
        principals.subject,
        principals.display_name AS "displayName",
        assignments.organization_id AS "organizationId",
        projects.id AS "projectId",
        projects.name AS "projectName",
        assignments.role
      FROM qa_project_assignments assignments
      JOIN application_principals principals ON principals.id = assignments.principal_id
      JOIN organization_memberships memberships
        ON memberships.organization_id = assignments.organization_id
        AND memberships.principal_id = assignments.principal_id
      JOIN organizations ON organizations.id = assignments.organization_id
      JOIN qa_projects projects
        ON projects.id = assignments.project_id
        AND projects.organization_id = assignments.organization_id
      WHERE assignments.principal_id = ${principal.id}
        AND principals.status = 'active'
        AND memberships.status = 'active'
        AND organizations.status = 'active'
        AND projects.status = 'active'
      ORDER BY projects.name, projects.id
    `.pipe(Effect.mapError((cause) => persistenceError("listAssignedProjects", cause)));

    return yield* Effect.forEach(rows, (row) => {
      const access = toProjectAccess(row);
      return access
        ? Effect.succeed(access)
        : Effect.fail(
            persistenceError(
              "listAssignedProjects:decodeRole",
              new Error(`Unsupported QA project role: ${row.role}`),
            ),
          );
    });
  });

  const resolveProjectAccess = Effect.fn("QaIam.resolveProjectAccess")(function* (
    input: ResolveProjectInput,
  ) {
    const assignments = yield* listAssignedProjects(input.subject);
    const access = assignments.find((candidate) => candidate.projectId === input.projectId);
    if (!access) {
      return yield* domainError(
        "project_access_denied",
        "The principal is not assigned to this QA project.",
      );
    }
    return access;
  });

  const authorizeProject = Effect.fn("QaIam.authorizeProject")(function* (
    input: AuthorizeProjectInput,
  ) {
    const access = yield* resolveProjectAccess(input);
    if (!access.capabilities.includes(input.capability)) {
      return yield* domainError(
        "capability_denied",
        `The ${access.role} role does not grant ${input.capability}.`,
      );
    }
    return access;
  });

  const registerProject = Effect.fn("QaIam.registerProject")(function* (
    input: RegisterProjectInput,
  ) {
    const assignedProjects = yield* listAssignedProjects(input.subject);
    const existingAccess = assignedProjects.find(
      (candidate) => candidate.projectId === input.projectId,
    );
    if (existingAccess) return existingAccess;

    const existingProjects = yield* sql<ProjectOrganizationRow>`
      SELECT organization_id AS "organizationId"
      FROM qa_projects
      WHERE id = ${input.projectId}
    `.pipe(Effect.mapError((cause) => persistenceError("registerProject:findProject", cause)));
    if (existingProjects.length > 0) {
      return yield* domainError(
        "project_access_denied",
        "The principal cannot register an existing QA project.",
      );
    }

    const principal = yield* getPrincipalBySubject(input.subject);
    const contexts = yield* sql<ProjectRegistrationContextRow>`
      SELECT
        memberships.organization_id AS "organizationId",
        assignments.project_id AS "sourceProjectId",
        assignments.role
      FROM organization_memberships memberships
      JOIN organizations ON organizations.id = memberships.organization_id
      JOIN qa_project_assignments assignments
        ON assignments.organization_id = memberships.organization_id
        AND assignments.principal_id = memberships.principal_id
      JOIN qa_projects source_projects
        ON source_projects.id = assignments.project_id
        AND source_projects.organization_id = assignments.organization_id
      WHERE memberships.principal_id = ${principal.id}
        AND memberships.status = 'active'
        AND organizations.status = 'active'
        AND source_projects.status = 'active'
      ORDER BY
        CASE assignments.role
          WHEN 'root' THEN 1
          WHEN 'qa:maker' THEN 2
          ELSE 3
        END,
        memberships.organization_id,
        assignments.project_id
      LIMIT 1
    `.pipe(Effect.mapError((cause) => persistenceError("registerProject:resolveContext", cause)));
    const context = contexts[0];
    if (!context || !isQaProjectRole(context.role)) {
      return yield* domainError(
        "project_access_denied",
        "The principal is not allowed to create a QA project.",
      );
    }

    const timestamp = DateTime.formatIso(yield* DateTime.now);
    const slug = `qa-${NodeCrypto.createHash("sha256").update(input.projectId).digest("hex").slice(0, 24)}`;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`
          INSERT INTO qa_projects (
            id, organization_id, slug, name, status, repository_reference, created_at, updated_at
          ) VALUES (
            ${input.projectId}, ${context.organizationId}, ${slug}, ${input.projectName}, 'active',
            ${input.repositoryReference ?? null}, ${timestamp}, ${timestamp}
          )
        `.pipe(
            Effect.mapError((cause) => persistenceError("registerProject:createProject", cause)),
          );
          yield* sql`
          INSERT INTO qa_project_assignments (
            organization_id, project_id, principal_id, role, created_at, updated_at
          )
          SELECT
            ${context.organizationId},
            ${input.projectId},
            source_assignments.principal_id,
            source_assignments.role,
            ${timestamp},
            ${timestamp}
          FROM qa_project_assignments source_assignments
          JOIN application_principals source_principals
            ON source_principals.id = source_assignments.principal_id
          JOIN organization_memberships source_memberships
            ON source_memberships.organization_id = source_assignments.organization_id
            AND source_memberships.principal_id = source_assignments.principal_id
          WHERE source_assignments.organization_id = ${context.organizationId}
            AND source_assignments.project_id = ${context.sourceProjectId}
            AND source_principals.status = 'active'
            AND source_memberships.status = 'active'
        `.pipe(Effect.mapError((cause) => persistenceError("registerProject:assignTeam", cause)));
          return yield* resolveProjectAccess(input);
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          isQaIamError(cause) ? cause : persistenceError("registerProject:transaction", cause),
        ),
      );
  });

  const findReleaseProject = Effect.fn("QaIam.findReleaseProject")(function* (
    releaseThreadId: string,
  ) {
    const rows = yield* sql<ReleaseProjectRow>`
      SELECT project_id AS "projectId"
      FROM qa_releases
      WHERE thread_id = ${releaseThreadId}
    `.pipe(Effect.mapError((cause) => persistenceError("findReleaseProject", cause)));
    const release = rows[0];
    if (!release) {
      return yield* domainError("release_not_found", "The QA release was not found.");
    }
    return release;
  });

  const authorizeRelease = Effect.fn("QaIam.authorizeRelease")(function* (
    input: AuthorizeReleaseInput,
  ) {
    const release = yield* findReleaseProject(input.releaseThreadId);
    const access = yield* authorizeProject({
      subject: input.subject,
      projectId: release.projectId,
      capability: input.capability,
    });
    return {
      ...access,
      releaseThreadId: input.releaseThreadId,
    } satisfies QaReleaseAccess;
  });

  const loadConversationForPrincipal = Effect.fn("QaIam.loadConversationForPrincipal")(function* (
    releaseThreadId: string,
    principalId: string,
  ) {
    const rows = yield* sql<ConversationRow>`
        SELECT
          release_thread_id AS "releaseThreadId",
          conversation_thread_id AS "conversationThreadId",
          principal_id AS "principalId"
        FROM qa_release_conversations
        WHERE release_thread_id = ${releaseThreadId} AND principal_id = ${principalId}
      `.pipe(Effect.mapError((cause) => persistenceError("loadConversationForPrincipal", cause)));
    return rows[0] ?? null;
  });

  const bindReleaseConversation = Effect.fn("QaIam.bindReleaseConversation")(function* (
    input: BindReleaseConversationInput,
  ) {
    const access = yield* authorizeRelease({
      subject: input.subject,
      releaseThreadId: input.releaseThreadId,
      capability: "qa:chat",
    });
    const existing = yield* loadConversationForPrincipal(
      input.releaseThreadId,
      access.principal.id,
    );
    if (existing) {
      if (existing.conversationThreadId !== input.conversationThreadId) {
        return yield* domainError(
          "conversation_conflict",
          "This principal already has a different durable conversation for the release.",
        );
      }
      return existing;
    }

    const timestamp = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO qa_release_conversations (
        release_thread_id, principal_id, conversation_thread_id, created_at, updated_at
      ) VALUES (
        ${input.releaseThreadId}, ${access.principal.id}, ${input.conversationThreadId},
        ${timestamp}, ${timestamp}
      )
      ON CONFLICT DO NOTHING
    `.pipe(Effect.mapError((cause) => persistenceError("bindReleaseConversation", cause)));

    const bound = yield* loadConversationForPrincipal(input.releaseThreadId, access.principal.id);
    if (!bound || bound.conversationThreadId !== input.conversationThreadId) {
      return yield* domainError(
        "conversation_conflict",
        "The conversation is already bound to another release principal.",
      );
    }
    return bound;
  });

  const authorizeConversation = Effect.fn("QaIam.authorizeConversation")(function* (
    input: ResolveConversationInput,
  ) {
    const principal = yield* getPrincipalBySubject(input.subject);
    const rows = yield* sql<ConversationRow>`
      SELECT
        release_thread_id AS "releaseThreadId",
        conversation_thread_id AS "conversationThreadId",
        principal_id AS "principalId"
      FROM qa_release_conversations
      WHERE conversation_thread_id = ${input.conversationThreadId}
        AND principal_id = ${principal.id}
    `.pipe(Effect.mapError((cause) => persistenceError("authorizeConversation", cause)));
    const conversation = rows[0];
    if (!conversation) {
      return yield* domainError(
        "conversation_not_found",
        "No release conversation is bound to this principal.",
      );
    }
    const access = yield* authorizeRelease({
      subject: input.subject,
      releaseThreadId: conversation.releaseThreadId,
      capability: input.capability,
    });
    return { ...access, conversation } satisfies QaConversationAccess;
  });

  const resolveConversationContext = Effect.fn("QaIam.resolveConversationContext")(function* (
    conversationThreadId: string,
  ) {
    const rows = yield* sql<ConversationRow & { readonly subject: string }>`
      SELECT
        conversations.release_thread_id AS "releaseThreadId",
        conversations.conversation_thread_id AS "conversationThreadId",
        conversations.principal_id AS "principalId",
        principals.subject
      FROM qa_release_conversations conversations
      JOIN application_principals principals ON principals.id = conversations.principal_id
      WHERE conversations.conversation_thread_id = ${conversationThreadId}
        AND principals.status = 'active'
    `.pipe(Effect.mapError((cause) => persistenceError("resolveConversationContext", cause)));
    const row = rows[0];
    if (!row) {
      return yield* domainError(
        "conversation_not_found",
        "No active QA release conversation has this thread identifier.",
      );
    }
    return yield* authorizeConversation({
      subject: row.subject,
      conversationThreadId,
      capability: "qa:chat",
    });
  });

  const appendAuditEvent = Effect.fn("QaIam.appendAuditEvent")(function* (
    input: AppendAuditEventInput,
  ) {
    const access = input.releaseThreadId
      ? yield* authorizeRelease({
          subject: input.subject,
          releaseThreadId: input.releaseThreadId,
          capability: "qa:read",
        })
      : yield* authorizeProject({
          subject: input.subject,
          projectId: input.projectId,
          capability: "qa:read",
        });
    if (access.projectId !== input.projectId) {
      return yield* domainError(
        "project_access_denied",
        "The audit event release does not belong to the requested project.",
      );
    }
    if (input.conversationThreadId) {
      const conversationAccess = yield* authorizeConversation({
        subject: input.subject,
        conversationThreadId: input.conversationThreadId,
        capability: "qa:read",
      });
      if (
        conversationAccess.projectId !== input.projectId ||
        (input.releaseThreadId !== undefined &&
          conversationAccess.releaseThreadId !== input.releaseThreadId)
      ) {
        return yield* domainError(
          "project_access_denied",
          "The audit event conversation does not belong to the requested release.",
        );
      }
    }

    const id = NodeCrypto.randomUUID();
    const occurredAt = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO qa_audit_events (
        id, occurred_at, principal_id, organization_id, project_id,
        release_thread_id, conversation_thread_id, action, target_type, target_id, metadata_json
      ) VALUES (
        ${id}, ${occurredAt}, ${access.principal.id}, ${access.organizationId}, ${input.projectId},
        ${input.releaseThreadId ?? null}, ${input.conversationThreadId ?? null}, ${input.action},
        ${input.targetType}, ${input.targetId}, ${encodeUnknownJsonString(input.metadata ?? {})}
      )
    `.pipe(Effect.mapError((cause) => persistenceError("appendAuditEvent", cause)));
    return { id, occurredAt } satisfies QaAuditEventReceipt;
  });

  return QaIam.of({
    getPrincipalBySubject,
    listAssignedProjects,
    resolveProjectAccess,
    authorizeProject,
    registerProject,
    authorizeRelease,
    bindReleaseConversation,
    authorizeConversation,
    resolveConversationContext,
    appendAuditEvent,
  });
});

export const layer = Layer.effect(QaIam, make);
