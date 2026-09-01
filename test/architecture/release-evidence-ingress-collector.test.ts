import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error The readiness collector is an intentionally unprotected Node script module.
import { collectExternalIngressEvidence } from "../../scripts/release/collect-release-readiness.mjs";
// @ts-expect-error The canonical release protocol is an intentionally unprotected Node script module.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";
// @ts-expect-error Exact GitHub artifact ZIP fixture.
import { githubArtifactZip } from "../fixtures/release/github-artifact-zip.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(readFileSync(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const release = contract.releaseCertification;
const policy = release.readiness;
const ingress = policy.externalEvidenceIngress;
const definition = policy.evidenceRoles.find(({ role }: { readonly role: string }) => role === "npm-authority");
const sourceSha = "a".repeat(40);
const aggregateObservedAt = "2026-08-30T16:03:00.000Z";

const zip = (files: Readonly<Record<string, string>>) =>
  githubArtifactZip(Object.entries(files).map(([name, value]) => [name, Buffer.from(value)]));

const fixture = (fileOverrides: Readonly<Record<string, string>> = {}) => {
  const logicalReference = {
    role: definition.role,
    type: definition.type,
    protocol: definition.protocol,
    identity: "npm-github-authority:mannyc2/effect-build:environment:npm",
    sourceSha,
    terminal: definition.terminal,
    observedAt: "2026-08-30T15:59:00.000Z",
    expiresAt: "2026-08-30T17:00:00.000Z",
    bytes: "1",
    digest: `sha256:${"1".repeat(64)}`,
  };
  const bundle = { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json", fixture: true };
  const logicalBytes = canonicalJson(logicalReference);
  const bundleBytes = canonicalJson(bundle);
  const zipBytes = zip({
    [ingress.artifact.orderedFiles[0]]: logicalBytes,
    [ingress.artifact.orderedFiles[1]]: bundleBytes,
    ...fileOverrides,
  });
  const coordinate = {
    workflow: ingress.workflow,
    sourceSha,
    runId: "41",
    runAttempt: "1",
    artifactId: "42",
    artifactDigest: sha256Digest(zipBytes),
  };
  const ingressReference = {
    schema: ingress.protocol,
    role: definition.role,
    coordinate,
    artifactName: ingress.artifact.nameTemplate
      .replace("<role>", definition.role)
      .replace("<sourceSha>", sourceSha),
    observedAt: "2026-08-30T16:02:00.000Z",
    expiresAt: "2026-08-30T17:00:00.000Z",
    bytes: `${Buffer.byteLength(bundleBytes)}`,
  };
  const run = {
    id: 41,
    run_attempt: 1,
    path: ingress.workflowPath,
    head_sha: sourceSha,
    head_branch: release.githubAuthority.branchPolicy.name,
    event: ingress.event,
    status: "completed",
    conclusion: "success",
    created_at: "2026-08-30T16:00:00Z",
    updated_at: "2026-08-30T16:01:00Z",
    repository: { id: Number(release.githubAuthority.repositoryId) },
    head_repository: { id: Number(release.githubAuthority.repositoryId) },
  };
  const artifact = {
    id: 42,
    name: ingressReference.artifactName,
    digest: coordinate.artifactDigest,
    expired: false,
    created_at: "2026-08-30T16:00:30Z",
    expires_at: "2026-09-29T16:00:30Z",
    workflow_run: {
      id: 41,
      head_sha: sourceSha,
      head_branch: release.githubAuthority.branchPolicy.name,
      repository_id: Number(release.githubAuthority.repositoryId),
      head_repository_id: Number(release.githubAuthority.repositoryId),
    },
  };
  const github = {
    readJson: async (endpoint: string) => endpoint.includes("actions/runs/") ? run : artifact,
    readArtifactZip: async () => zipBytes,
  };
  return { artifact, bundleBytes: Buffer.from(bundleBytes), github, ingressReference, logicalReference, run, zipBytes };
};

const collect = async (input: ReturnType<typeof fixture>) =>
  await collectExternalIngressEvidence({
    github: input.github,
    contract,
    definition,
    ingressReference: input.ingressReference,
    sourceSha,
    observedAt: aggregateObservedAt,
  });

describe("external evidence ingress collector", () => {
  it("downloads one exact same-repository artifact and recovers canonical logical and Sigstore bytes", async () => {
    const input = fixture();
    await expect(collect(input)).resolves.toEqual({
      logicalReference: input.logicalReference,
      bundleBytes: input.bundleBytes,
    });
  });

  it("rejects outer length, time, repository, and artifact-byte drift", async () => {
    const cases = [
      (input: ReturnType<typeof fixture>) => input.ingressReference.bytes = "1",
      (input: ReturnType<typeof fixture>) => input.ingressReference.observedAt = "2026-08-30T16:00:00.000Z",
      (input: ReturnType<typeof fixture>) => input.run.repository.id += 1,
      (input: ReturnType<typeof fixture>) => input.artifact.workflow_run.head_repository_id += 1,
      (input: ReturnType<typeof fixture>) =>
        input.ingressReference.coordinate.artifactDigest = `sha256:${"0".repeat(64)}`,
    ];
    for (const mutate of cases) {
      const input = fixture();
      mutate(input);
      await expect(collect(input)).rejects.toThrow();
    }
  });

  it("rejects a noncanonical inner reference and any extra flat member", async () => {
    const noncanonical = fixture({
      [ingress.artifact.orderedFiles[0]]: ` ${canonicalJson(fixture().logicalReference)}`,
    });
    await expect(collect(noncanonical)).rejects.toThrow("canonical JSON");

    const extra = fixture({ "unexpected.json": "{}" });
    await expect(collect(extra)).rejects.toThrow("unexpected or duplicate");
  });
});
