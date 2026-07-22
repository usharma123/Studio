import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DesktopBackendBootstrap,
  type DesktopBackendBootstrapV2,
  type LegacyDesktopBackendBootstrap,
} from "./desktopBootstrap.ts";

const ROOT_CREDENTIAL = "1".repeat(48);
const MAKER_CREDENTIAL = "2".repeat(48);
const APPROVER_CREDENTIAL = "3".repeat(48);

const common = {
  mode: "desktop",
  noBrowser: true,
  port: 4_888,
  t3Home: "/tmp/t3-bootstrap-home",
  host: "127.0.0.1",
  tailscaleServeEnabled: false,
  tailscaleServePort: 443,
} as const;

const legacy = (overrides: Partial<LegacyDesktopBackendBootstrap> = {}) => ({
  ...common,
  desktopBootstrapToken: "legacy-desktop-bootstrap",
  developmentProfile: "root" as const,
  ...overrides,
});

const v2 = (overrides: Partial<DesktopBackendBootstrapV2> = {}) => ({
  ...common,
  version: 2 as const,
  grants: [
    { profile: "root" as const, credential: ROOT_CREDENTIAL },
    { profile: "qa:maker" as const, credential: MAKER_CREDENTIAL },
    { profile: "qa:approver" as const, credential: APPROVER_CREDENTIAL },
  ],
  ...overrides,
});

const decodeStrict = Schema.decodeUnknownExit(DesktopBackendBootstrap, {
  errors: "all",
  onExcessProperty: "error",
});

function expectRejected(input: unknown): void {
  expect(Exit.isFailure(decodeStrict(input))).toBe(true);
}

describe("DesktopBackendBootstrap", () => {
  it("decodes explicit legacy profiles without a default principal", () => {
    for (const profile of ["root", "qa:maker", "qa:approver"] as const) {
      const result = decodeStrict(legacy({ developmentProfile: profile }));
      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.developmentProfile).toBe(profile);
      }
    }
  });

  it("rejects a legacy credential when the profile is missing", () => {
    const { developmentProfile: _profile, ...missingProfile } = legacy();
    expectRejected(missingProfile);
  });

  it("decodes one exact credential for every v2 profile", () => {
    const result = decodeStrict(v2());
    expect(Exit.isSuccess(result)).toBe(true);
    if (Exit.isSuccess(result) && result.value.version === 2) {
      expect(result.value.grants).toEqual([
        { profile: "root", credential: ROOT_CREDENTIAL },
        { profile: "qa:maker", credential: MAKER_CREDENTIAL },
        { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
      ]);
    }
  });

  it.each([
    [
      "missing version",
      (() => {
        const { version: _version, ...input } = v2();
        return input;
      })(),
    ],
    ["unsupported version", { ...v2(), version: 3 }],
    [
      "missing grants",
      (() => {
        const { grants: _grants, ...input } = v2();
        return input;
      })(),
    ],
    ["empty grants", v2({ grants: [] })],
    [
      "missing profile",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { credential: MAKER_CREDENTIAL },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "missing credential",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker" },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "unknown profile",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: MAKER_CREDENTIAL },
          { profile: "qa:reviewer", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "missing required profile",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: MAKER_CREDENTIAL },
        ],
      },
    ],
    [
      "duplicate profile",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: MAKER_CREDENTIAL },
          { profile: "qa:maker", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "duplicate credential",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: MAKER_CREDENTIAL },
          { profile: "qa:approver", credential: MAKER_CREDENTIAL },
        ],
      },
    ],
    [
      "empty credential",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: "" },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "whitespace credential",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: ` ${MAKER_CREDENTIAL}` },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    [
      "wrong credential format",
      {
        ...v2(),
        grants: [
          { profile: "root", credential: ROOT_CREDENTIAL },
          { profile: "qa:maker", credential: "not-a-generated-token" },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
    ["unknown top-level field", { ...v2(), subject: "local:root" }],
    [
      "unknown nested authorization fields",
      {
        ...v2(),
        grants: [
          {
            profile: "root",
            credential: ROOT_CREDENTIAL,
            subject: "attacker:chosen",
            scopes: ["orchestration:operate"],
          },
          { profile: "qa:maker", credential: MAKER_CREDENTIAL },
          { profile: "qa:approver", credential: APPROVER_CREDENTIAL },
        ],
      },
    ],
  ])("rejects malformed v2 input: %s", (_name, input) => {
    expectRejected(input);
  });

  it("rejects mixed v2 and legacy fields", () => {
    expectRejected({
      ...v2(),
      desktopBootstrapToken: "legacy-root-token",
      developmentProfile: "root",
    });
  });

  it("never downgrades malformed v2 input to a legacy root credential", () => {
    expectRejected({
      ...common,
      version: 2,
      grants: [{ profile: "qa:maker" }],
      desktopBootstrapToken: "legacy-root-token",
      developmentProfile: "root",
    });
  });
});
