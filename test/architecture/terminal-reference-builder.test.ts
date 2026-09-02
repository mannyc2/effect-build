import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The terminal reference builder is an intentionally unprotected Node script module.
import { buildTerminalReference } from "../../scripts/release/build-terminal-reference.mjs";
// @ts-expect-error Canonical release protocol helpers are intentionally unprotected Node script modules.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";
// @ts-expect-error Exact GitHub artifact ZIP fixture.
import { githubArtifactZip } from "../fixtures/release/github-artifact-zip.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const sourceSha = "a".repeat(40);
const observedAt = "2026-09-01T18:00:00.000Z";
const runCreatedAt = "2026-09-01T17:55:00Z";
const runUpdatedAt = "2026-09-01T17:59:00Z";
const artifactCreatedAt = "2026-09-01T17:58:00Z";
const artifactExpiresAt = "2026-10-01T18:00:00Z";
const candidateCoordinate = {
  workflow: contract.releaseCertification.candidate.workflow,
  sourceSha,
  runId: "41",
  runAttempt: "1",
  artifactId: "51",
  artifactDigest: `sha256:${"1".repeat(64)}`,
};

const definition = (kind: string) => {
  if (kind === "candidate") {
    return {
      artifactName: contract.releaseCertification.candidate.artifactName.replace("<sourceSha>", sourceSha),
      event: contract.releaseCertification.candidate.event,
      workflow: contract.releaseCertification.candidate.workflow,
      workflowPath: contract.releaseCertification.candidate.workflowPath,
    };
  }
  if (kind === "readiness") {
    return {
      artifactName: contract.releaseCertification.readiness.artifactName,
      event: contract.releaseCertification.readiness.event,
      workflow: contract.releaseCertification.readiness.workflow,
      workflowPath: contract.releaseCertification.readiness.workflowPath,
    };
  }
  const role = contract.releaseCertification.readiness.evidenceRoles.find((entry: any) => entry.role === kind);
  if (role === undefined) throw new Error(`unknown fixture kind ${kind}`);
  return role;
};

const runMetadata = (kind: string, overrides: Record<string, unknown> = {}) => {
  const expected = definition(kind);
  return {
    id: 101,
    run_attempt: 2,
    path: expected.workflowPath,
    head_sha: sourceSha,
    head_branch: "main",
    event: expected.event,
    status: "completed",
    conclusion: "success",
    created_at: runCreatedAt,
    updated_at: runUpdatedAt,
    repository: { id: 1331906770, full_name: "mannyc2/effect-build" },
    head_repository: { id: 1331906770, full_name: "mannyc2/effect-build" },
    ...overrides,
  };
};

const boundary = ({
  kind,
  bytes,
  run = runMetadata(kind),
  artifactOverrides = {},
}: {
  readonly kind: string;
  readonly bytes?: Buffer;
  readonly run?: Record<string, unknown>;
  readonly artifactOverrides?: Record<string, unknown>;
}) => {
  const expected = definition(kind);
  const digest = bytes === undefined ? undefined : sha256Digest(bytes);
  const artifact = bytes === undefined
    ? undefined
    : {
      id: 202,
      name: expected.artifactName,
      digest,
      expired: false,
      archive_download_url: "https://api.github.com/repos/mannyc2/effect-build/actions/artifacts/202/zip",
      created_at: artifactCreatedAt,
      expires_at: artifactExpiresAt,
      workflow_run: {
        id: 101,
        head_sha: sourceSha,
        head_branch: "main",
        repository_id: 1331906770,
        head_repository_id: 1331906770,
      },
      ...artifactOverrides,
    };
  let mainReads = 0;
  return {
    digest,
    github: {
      readJson: vi.fn(async (endpoint: string) => {
        if (endpoint.endsWith("git/ref/heads/main")) {
          mainReads += 1;
          return { ref: "refs/heads/main", object: { type: "commit", sha: sourceSha } };
        }
        if (endpoint.includes("actions/runs/")) return run;
        if (endpoint.includes("actions/artifacts/")) return artifact;
        throw new Error(`unexpected endpoint ${endpoint}`);
      }),
      readArtifactZip: vi.fn(async () => bytes),
    },
    mainReads: () => mainReads,
  };
};

const readinessManifest = Buffer.from(canonicalJson({
  schema: contract.releaseCertification.readiness.protocol,
  sourceSha,
  observedAt: "2026-09-01T17:59:00.000Z",
  contract: {},
  toolchain: {},
  directObservation: {},
  candidate: {},
  evidence: [],
  bundle: {},
}));
const readinessBundle = Buffer.from("opaque readiness evidence bundle");

const fakeReceipt = Buffer.from(canonicalJson({
  schema: contract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.protocol,
  sourceSha,
  observedAt: "2026-09-01T17:58:30.000Z",
  workflow: contract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.workflow,
  contractDigest: sha256Digest(contractBytes),
  readinessProtocol: contract.releaseCertification.readiness.protocol,
  candidate: candidateCoordinate,
  candidateManifestDigest: `sha256:${"2".repeat(64)}`,
  coordinates: [],
  coordinateCount: 0,
  claims: [],
  doesNotProve: [],
  realRegistryMutation: false,
  realNpmOrRegistryCredentialsUsed: false,
  terminal: "success",
}));

const npmClaims = Buffer.from(canonicalJson({
  schema: contract.releaseCertification.npmOidcCertification.evidence.protocols.githubOidcClaims,
  sourceSha,
  candidate: candidateCoordinate,
  client: {},
  observedAt: "2026-09-01T17:58:00.000Z",
  claims: {},
  claimsDigest: `sha256:${"3".repeat(64)}`,
  jwtValidation: {},
  sourceDigests: [],
  registryMutation: false,
  proves: [],
  doesNotProve: [],
}));
const npmExchange = Buffer.from(canonicalJson({
  schema: contract.releaseCertification.npmOidcCertification.evidence.protocols.npmOidcExchangeAccepted,
  sourceSha,
  candidate: candidateCoordinate,
  client: {},
  observedAt: "2026-09-01T17:58:30.000Z",
  packages: [],
  exchanges: [],
  beforeRegistryStateDigest: `sha256:${"4".repeat(64)}`,
  afterRegistryStateDigest: `sha256:${"4".repeat(64)}`,
  sourceDigests: [],
  registryMutation: false,
  proves: [],
  doesNotProve: [],
}));

const artifacts = {
  candidate: {
    bytes: Buffer.from("candidate ZIP bytes authenticated before injected exact candidate extraction"),
    files: undefined,
  },
  readiness: {
    bytes: githubArtifactZip([
      [contract.releaseCertification.readiness.manifest, readinessManifest],
      [contract.releaseCertification.readiness.evidenceBundle, readinessBundle],
    ]),
    files: contract.releaseCertification.readiness.orderedFiles,
  },
  "fake-registry": {
    bytes: githubArtifactZip([[
      contract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.orderedFiles[0],
      fakeReceipt,
    ]]),
    files: contract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.orderedFiles,
  },
  "npm-oidc-certification": {
    bytes: githubArtifactZip([
      [contract.releaseCertification.npmOidcCertification.evidence.orderedFiles[0], npmClaims],
      [contract.releaseCertification.npmOidcCertification.evidence.orderedFiles[1], npmExchange],
    ]),
    files: contract.releaseCertification.npmOidcCertification.evidence.orderedFiles,
  },
} as const;

describe("terminal reference builder", () => {
  it("constructs the exact candidate manifest reference only after terminal artifact observation", async () => {
    const fixture = boundary({ kind: "candidate", bytes: artifacts.candidate.bytes });
    const manifestBytes = Buffer.from(canonicalJson({ schema: "fixture-candidate", sourceSha }));
    const candidateExtractor = vi.fn(() => ({ manifestBytes }));
    const result = await buildTerminalReference({
      contract,
      contractBytes,
      kind: "candidate",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      candidateExtractor,
    });
    expect(result).toEqual({
      protocol: contract.releaseCertification.candidate.protocol,
      coordinate: {
        workflow: contract.releaseCertification.candidate.workflow,
        sourceSha,
        runId: "101",
        runAttempt: "2",
        artifactId: "202",
        artifactDigest: fixture.digest,
      },
      artifactName: `npm-release-candidate-${sourceSha}`,
      manifestDigest: sha256Digest(manifestBytes),
      observedAt,
      expiresAt: "2026-09-08T18:00:00.000Z",
      bytes: `${manifestBytes.byteLength}`,
    });
    expect(candidateExtractor).toHaveBeenCalledWith(expect.objectContaining({
      zipBytes: artifacts.candidate.bytes,
      contract,
      contractBytes,
      sourceSha,
    }));
    expect(fixture.mainReads()).toBe(2);
  });

  it("constructs the exact readiness manifest reference after strict two-file extraction", async () => {
    const fixture = boundary({ kind: "readiness", bytes: artifacts.readiness.bytes });
    const readinessValidator = vi.fn(async () => ({}));
    const result = await buildTerminalReference({
      contract,
      contractBytes,
      kind: "readiness",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      readinessValidator,
    });
    expect(result.manifestDigest).toBe(sha256Digest(readinessManifest));
    expect(result.bytes).toBe(`${readinessManifest.byteLength}`);
    expect(result.expiresAt).toBe("2026-09-01T19:00:00.000Z");
    expect(readinessValidator).toHaveBeenCalledWith(expect.objectContaining({
      expectedSourceSha: sourceSha,
      validationTime: observedAt,
      files: artifacts.readiness.files,
      manifestBytes: readinessManifest,
      bundleBytes: readinessBundle,
    }));
    expect(fixture.mainReads()).toBe(2);
  });

  it("constructs exact-main CI bytes and digest from the authenticated terminal run", async () => {
    const fixture = boundary({ kind: "exact-main-ci" });
    const result = await buildTerminalReference({
      contract,
      contractBytes,
      kind: "exact-main-ci",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      github: fixture.github,
      now: () => observedAt,
    });
    const role = definition("exact-main-ci") as any;
    const observationBytes = Buffer.from(canonicalJson({
      schema: role.protocol,
      workflow: role.workflow,
      sourceSha,
      runId: "101",
      runAttempt: "2",
      event: "push",
      headBranch: "main",
      status: "completed",
      conclusion: "success",
      createdAt: "2026-09-01T17:55:00.000Z",
      updatedAt: "2026-09-01T17:59:00.000Z",
    }));
    expect(result).toEqual({
      role: "exact-main-ci",
      type: "githubRun",
      protocol: role.protocol,
      workflow: role.workflow,
      sourceSha,
      runId: "101",
      runAttempt: "2",
      terminal: "success",
      observedAt,
      expiresAt: "2026-09-03T18:00:00.000Z",
      bytes: `${observationBytes.byteLength}`,
      digest: sha256Digest(observationBytes),
    });
    expect(fixture.github.readArtifactZip).not.toHaveBeenCalled();
    expect(fixture.mainReads()).toBe(2);
  });

  it.each([
    ["fake-registry", artifacts["fake-registry"], "2026-09-01T17:58:30.000Z", "2026-09-03T18:00:00.000Z"],
    [
      "npm-oidc-certification",
      artifacts["npm-oidc-certification"],
      "2026-09-01T17:58:30.000Z",
      "2026-09-01T22:00:00.000Z",
    ],
  ])("constructs %s from its exact retained receipt and raw artifact ZIP", async (
    kind,
    artifactFixture,
    evidenceObservedAt,
    expiresAt,
  ) => {
    const fixture = boundary({ kind, bytes: artifactFixture.bytes });
    const artifactEvidenceValidator = vi.fn((_input: { sourceSha: string; files: Map<string, Uint8Array> }) => ({}));
    const result = await buildTerminalReference({
      contract,
      contractBytes,
      kind,
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      artifactEvidenceValidator,
    });
    expect(result).toEqual(expect.objectContaining({
      role: kind,
      type: "githubArtifact",
      evidenceObservedAt,
      observedAt,
      expiresAt,
      bytes: `${artifactFixture.bytes.byteLength}`,
    }));
    expect(result.coordinate.artifactDigest).toBe(fixture.digest);
    expect(artifactEvidenceValidator).toHaveBeenCalledWith(expect.objectContaining({
      sourceSha,
      files: expect.any(Map),
    }));
    expect(artifactEvidenceValidator.mock.calls.map(([input]) => [...input.files.keys()]))
      .toEqual([artifactFixture.files]);
    expect(fixture.mainReads()).toBe(2);
  });

  it.each([
    ["nonterminal run", { run: runMetadata("fake-registry", { status: "in_progress", conclusion: null }) }],
    ["wrong workflow metadata", { run: runMetadata("fake-registry", { path: ".github/workflows/ci.yml" }) }],
    ["wrong artifact metadata", { artifactOverrides: { name: "foreign-artifact" } }],
  ])("rejects %s", async (_label, overrides) => {
    const fixture = boundary({ kind: "fake-registry", bytes: artifacts["fake-registry"].bytes, ...overrides });
    await expect(buildTerminalReference({
      contract,
      contractBytes,
      kind: "fake-registry",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      artifactEvidenceValidator: vi.fn(),
    })).rejects.toThrow();
  });

  it("rejects a malformed artifact ZIP before evidence validation", async () => {
    const bytes = Buffer.from("not a ZIP");
    const fixture = boundary({ kind: "fake-registry", bytes });
    const artifactEvidenceValidator = vi.fn();
    await expect(buildTerminalReference({
      contract,
      contractBytes,
      kind: "fake-registry",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      artifactEvidenceValidator,
    })).rejects.toThrow(/ZIP/u);
    expect(artifactEvidenceValidator).not.toHaveBeenCalled();
  });

  it("rejects observations before terminal updated_at and caps expiry at artifact retention", async () => {
    const fixture = boundary({
      kind: "fake-registry",
      bytes: artifacts["fake-registry"].bytes,
      artifactOverrides: { expires_at: "2026-09-01T18:30:00Z" },
    });
    await expect(buildTerminalReference({
      contract,
      contractBytes,
      kind: "fake-registry",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => "2026-09-01T17:58:59.999Z",
      artifactEvidenceValidator: vi.fn(),
    })).rejects.toThrow(/before completion/u);

    const result = await buildTerminalReference({
      contract,
      contractBytes,
      kind: "fake-registry",
      sourceSha,
      runId: "101",
      runAttempt: "2",
      artifactId: "202",
      artifactDigest: fixture.digest,
      github: fixture.github,
      now: () => observedAt,
      artifactEvidenceValidator: vi.fn(),
    });
    expect(result.expiresAt).toBe("2026-09-01T18:30:00.000Z");
  });
});
