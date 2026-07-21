import * as Schema from "effect/Schema";

import { PortSchema } from "./baseSchemas.ts";

export const DesktopDevelopmentProfile = Schema.Literals(["root", "qa:maker", "qa:approver"]);

export type DesktopDevelopmentProfile = typeof DesktopDevelopmentProfile.Type;

const DesktopBootstrapCredential = Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed());

export const DesktopMultiGrantCredential = DesktopBootstrapCredential.check(
  Schema.isPattern(/^[0-9a-f]{48}$/, {
    expected: "a 48-character lowercase hexadecimal desktop bootstrap credential",
  }),
);

export type DesktopMultiGrantCredential = typeof DesktopMultiGrantCredential.Type;

export const DesktopBootstrapGrant = Schema.Struct({
  profile: DesktopDevelopmentProfile,
  credential: DesktopMultiGrantCredential,
});

export type DesktopBootstrapGrant = typeof DesktopBootstrapGrant.Type;

const DesktopBootstrapGrantsArray = Schema.Array(DesktopBootstrapGrant).check(
  Schema.isNonEmpty(),
  Schema.makeFilter((grants) => {
    const issues: Array<Schema.FilterIssue> = [];
    const profiles = new Map<DesktopDevelopmentProfile, number>();
    const credentials = new Map<string, number>();

    for (const [index, grant] of grants.entries()) {
      const duplicateProfileIndex = profiles.get(grant.profile);
      if (duplicateProfileIndex !== undefined) {
        issues.push({
          path: [index, "profile"],
          issue: `duplicate desktop bootstrap profile (first declared at grants[${duplicateProfileIndex}])`,
        });
      } else {
        profiles.set(grant.profile, index);
      }

      const duplicateCredentialIndex = credentials.get(grant.credential);
      if (duplicateCredentialIndex !== undefined) {
        issues.push({
          path: [index, "credential"],
          issue: `duplicate desktop bootstrap credential (first declared at grants[${duplicateCredentialIndex}])`,
        });
      } else {
        credentials.set(grant.credential, index);
      }
    }

    for (const profile of DesktopDevelopmentProfile.literals) {
      if (!profiles.has(profile)) {
        issues.push(`missing desktop bootstrap profile ${profile}`);
      }
    }

    return issues;
  }),
);

export const DesktopBootstrapGrants = DesktopBootstrapGrantsArray;
export type DesktopBootstrapGrants = typeof DesktopBootstrapGrants.Type;

const DesktopBackendBootstrapCommonFields = {
  mode: Schema.Literal("desktop"),
  noBrowser: Schema.Boolean,
  port: PortSchema,
  // Omitted when the desktop launches the backend inside WSL, since the
  // Windows-side baseDir maps to /mnt/c/... and the Linux side should use its
  // own home directory instead.
  t3Home: Schema.optional(Schema.String),
  host: Schema.String,
  tailscaleServeEnabled: Schema.Boolean,
  tailscaleServePort: PortSchema,
  otlpTracesUrl: Schema.optional(Schema.String),
  otlpMetricsUrl: Schema.optional(Schema.String),
} as const;

/**
 * Compatibility envelope for the single-grant desktop bootstrap. The profile
 * remains optional in the Type so older desktop launch code can be migrated in
 * stages, but the codec rejects omission at the process boundary. There is no
 * implicit root profile.
 */
export const LegacyDesktopBackendBootstrap = Schema.Struct({
  ...DesktopBackendBootstrapCommonFields,
  desktopBootstrapToken: DesktopBootstrapCredential,
  developmentProfile: Schema.optional(DesktopDevelopmentProfile),
  version: Schema.optionalKey(Schema.Never),
  grants: Schema.optionalKey(Schema.Never),
}).check(
  Schema.makeFilter((bootstrap) =>
    bootstrap.developmentProfile === undefined
      ? { path: ["developmentProfile"], issue: "desktop bootstrap profile is required" }
      : undefined,
  ),
);

export type LegacyDesktopBackendBootstrap = typeof LegacyDesktopBackendBootstrap.Type;

/**
 * Versioned multi-principal bootstrap. Callers provide only a persona and its
 * credential; the server owns the canonical subject and scope mapping.
 */
export const DesktopBackendBootstrapV2 = Schema.Struct({
  ...DesktopBackendBootstrapCommonFields,
  version: Schema.Literal(2),
  grants: DesktopBootstrapGrants,
  desktopBootstrapToken: Schema.optionalKey(Schema.Never),
  developmentProfile: Schema.optionalKey(Schema.Never),
});

export type DesktopBackendBootstrapV2 = typeof DesktopBackendBootstrapV2.Type;

export const DesktopBackendBootstrap = Schema.Union([
  DesktopBackendBootstrapV2,
  LegacyDesktopBackendBootstrap,
]);

export type DesktopBackendBootstrap = typeof DesktopBackendBootstrap.Type;
