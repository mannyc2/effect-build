import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The post-upload finalizer is an intentionally unprotected Node script module.
import * as postUploadArtifactObservation from "../../scripts/release/post-upload-artifact-observation.mjs";

const { observePostUploadArtifact, parsePostUploadEnvironment } = postUploadArtifactObservation;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const sourceSha = "a".repeat(40);
const bytes = Buffer.from("one exact downloaded Actions artifact ZIP");
const bareDigest = createHash("sha256").update(bytes).digest("hex");
const environment = {
  ARTIFACT_ID: "456",
  EXPECTED_ARTIFACT_NAME: "expected-artifact",
  EXPECTED_EVENT: "workflow_dispatch",
  EXPECTED_HEAD_BRANCH: "main",
  EXPECTED_REPOSITORY: "mannyc2/effect-build",
  EXPECTED_REPOSITORY_ID: "1331906770",
  EXPECTED_WORKFLOW: "mannyc2/effect-build/.github/workflows/release-readiness.yml@refs/heads/main",
  EXPECTED_WORKFLOW_PATH: ".github/workflows/release-readiness.yml",
  REPOSITORY: "mannyc2/effect-build",
  RUN_ATTEMPT: "2",
  RUN_ID: "123",
  SOURCE_SHA: sourceSha,
  UPLOAD_ACTION_BARE_DIGEST: bareDigest,
};

const main = () => ({ ref: "refs/heads/main", object: { type: "commit", sha: sourceSha } });
const artifact = () => ({
  digest: `sha256:${bareDigest}`,
  expired: false,
  id: 456,
  name: "expected-artifact",
  workflow_run: {
    head_branch: "main",
    head_repository_id: 1331906770,
    head_sha: sourceSha,
    id: 123,
    repository_id: 1331906770,
  },
});
const run = () => ({
  conclusion: null,
  event: "workflow_dispatch",
  head_branch: "main",
  head_repository: { full_name: "mannyc2/effect-build", id: 1331906770 },
  head_sha: sourceSha,
  id: 123,
  path: ".github/workflows/release-readiness.yml",
  repository: { full_name: "mannyc2/effect-build", id: 1331906770 },
  run_attempt: 2,
  status: "in_progress",
});

const boundary = (overrides: {
  readonly artifact?: Record<string, unknown>;
  readonly run?: Record<string, unknown>;
  readonly mainReads?: ReadonlyArray<Record<string, unknown>>;
  readonly bytes?: Buffer;
} = {}) => {
  let mainIndex = 0;
  const mainReads = overrides.mainReads ?? [main(), main()];
  return {
    readJson: vi.fn(async (endpoint: string) => {
      if (endpoint.endsWith("git/ref/heads/main")) return mainReads[mainIndex++];
      if (endpoint.includes("actions/artifacts/")) return overrides.artifact ?? artifact();
      if (endpoint.includes("actions/runs/")) return overrides.run ?? run();
      throw new Error(`unexpected endpoint ${endpoint}`);
    }),
    readArtifactZip: vi.fn(async () => overrides.bytes ?? bytes),
  };
};

describe("post-upload Actions artifact observation", () => {
  it("uses the sealed boundary, authenticates the self-run and bytes, and re-reads main last", async () => {
    const output = await mkdtemp(join(tmpdir(), "effect-build-post-upload-"));
    const github = boundary();
    try {
      const result = await observePostUploadArtifact({ contract, environment, outputDirectory: output, github });
      expect(result.canonicalDigest).toBe(`sha256:${bareDigest}`);
      expect(github.readJson.mock.calls.map(([endpoint]) => endpoint)).toEqual([
        "repos/mannyc2/effect-build/git/ref/heads/main",
        "repos/mannyc2/effect-build/actions/artifacts/456",
        "repos/mannyc2/effect-build/actions/runs/123/attempts/2",
        "repos/mannyc2/effect-build/git/ref/heads/main",
      ]);
      expect(github.readArtifactZip).toHaveBeenCalledWith(
        "repos/mannyc2/effect-build/actions/artifacts/456/zip",
        contract.releaseCertification.readiness.zipExtraction.maximumArchiveBytes,
      );
      expect(await readFile(resolve(output, "artifact.zip"))).toEqual(bytes);
      expect(JSON.parse(await readFile(resolve(output, "artifact.json"), "utf8"))).toEqual(artifact());
      expect(JSON.parse(await readFile(resolve(output, "run.json"), "utf8"))).toEqual(run());
      expect(JSON.parse(await readFile(resolve(output, "main.json"), "utf8"))).toEqual(main());
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  it.each([
    ["wrong repository id", { ...environment, EXPECTED_REPOSITORY_ID: "1" }],
    ["wrong workflow", {
      ...environment,
      EXPECTED_WORKFLOW: "mannyc2/effect-build/.github/workflows/ci.yml@refs/heads/main",
    }],
    ["wrong API event", { ...environment, EXPECTED_EVENT: "push" }],
    ["noncanonical digest", { ...environment, UPLOAD_ACTION_BARE_DIGEST: `sha256:${bareDigest}` }],
  ])("rejects %s before any network call", async (_label, changed) => {
    const github = boundary();
    await expect(observePostUploadArtifact({
      contract,
      environment: changed,
      outputDirectory: "/must-not-be-created",
      github,
    })).rejects.toThrow();
    expect(github.readJson).not.toHaveBeenCalled();
    expect(github.readArtifactZip).not.toHaveBeenCalled();
  });

  it.each([
    ["forged completed self-run", { run: { ...run(), status: "completed", conclusion: "success" } }],
    ["wrong downloaded bytes", { bytes: Buffer.from("different ZIP") }],
    ["same-name repository id drift", {
      artifact: {
        ...artifact(),
        workflow_run: { ...artifact().workflow_run, repository_id: 99, head_repository_id: 99 },
      },
    }],
    ["main advances after the artifact read", {
      mainReads: [main(), { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } }],
    }],
  ])("rejects %s without writing terminal evidence", async (_label, overrides) => {
    const output = await mkdtemp(join(tmpdir(), "effect-build-post-upload-hostile-"));
    try {
      await expect(observePostUploadArtifact({
        contract,
        environment,
        outputDirectory: output,
        github: boundary(overrides),
      })).rejects.toThrow();
      await expect(readFile(resolve(output, "artifact.zip"))).rejects.toThrow();
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  it("derives repository and branch only from the generated authority", () => {
    const parsed = parsePostUploadEnvironment(contract, environment);
    expect(parsed.repository).toBe(contract.releaseCertification.githubAuthority.repository);
    expect(parsed.repositoryId).toBe(Number(contract.releaseCertification.githubAuthority.repositoryId));
    expect(parsed.branch).toBe(contract.releaseCertification.githubAuthority.branchPolicy.name);
  });
});
