import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  canonicalBytes,
  releaseCandidateIdentity,
  releaseControl,
  targetCell,
} from "../node-finalizer/common.mjs";
import { assertLockstepPackageManifest } from "../lockstep-package.mjs";
import { publicNodeSeaSuccessOutput, validateCandidateDescriptor } from "./candidate.mjs";

const descriptor = () => {
  const identity = releaseCandidateIdentity;
  const nodeCell = targetCell("linux-x64-gnu");
  const sourceSha = "1".repeat(40);
  const packages = releaseControl.orderedPackages.map((name) => ({
    name,
    version: "0.5.0",
    filename: `${name}-0.5.0.tgz`,
    dependencyPrerequisites: releaseControl.orderedPackagePrerequisites[name],
    bytes: "1",
    sha256: "3".repeat(64),
    sha1: "4".repeat(40),
    sha512SRI: `sha512-${Buffer.alloc(64, 5).toString("base64")}`,
    packedName: name,
    packedVersion: "0.5.0",
  }));
  return {
    schema: identity.schema,
    version: "0.5.0",
    sourceRepository: identity.sourceRepository,
    sourceRef: identity.sourceRef,
    sourceSha,
    workflowRepository: identity.workflowRepository,
    workflowPath: identity.workflowPath,
    workflowRef: identity.workflowRef,
    workflowRunId: "1",
    workflowRunAttempt: "1",
    workflowRunHeadSha: sourceSha,
    checkedOutSourceSha: sourceSha,
    payloadArtifactId: "2",
    payloadArtifactName: identity.payloadArtifactName,
    payloadArtifactDigest: `sha256:${"2".repeat(64)}`,
    createdAt: "2026-08-24T10:00:00Z",
    expiresAt: "2026-08-25T10:00:00Z",
    packages,
    publicNodeSeaEvidence: {
      protocol: "effect-build/release-candidate-public-node-sea@1",
      packageName: "effect-build-node-sea",
      packageSha256: "3".repeat(64),
      corePackageSha256: "3".repeat(64),
      nodeVersion: "26.7.0",
      target: "linux-x64-gnu",
      nodeArchiveName: nodeCell.distribution,
      nodeArchiveSha256: nodeCell.sha256,
      nodeExecutableBytes: "1",
      nodeExecutableSha256: "6".repeat(64),
      assembledExecutableBytes: "1",
      assembledExecutableSha256: "7".repeat(64),
      executionExitCode: "0",
      executionStdoutSha256: createHash("sha256").update(publicNodeSeaSuccessOutput).digest("hex"),
    },
  };
};

test("candidate descriptor accepts only the frozen canonical identity", () => {
  const value = descriptor();
  const bytes = canonicalBytes(value);
  const result = validateCandidateDescriptor(bytes, { now: new Date("2026-08-24T12:00:00Z") });
  assert.equal(result.descriptor.sourceSha, "1".repeat(40));
  assert.match(result.descriptorDigest, /^[0-9a-f]{64}$/u);
});

test("candidate descriptor rejects stale, reordered, and unknown inputs", () => {
  const stale = descriptor();
  assert.throws(
    () => validateCandidateDescriptor(canonicalBytes(stale), { now: new Date("2026-08-25T10:00:01Z") }),
    /not fresh/u,
  );
  const reordered = descriptor();
  reordered.packages.reverse();
  assert.throws(
    () => validateCandidateDescriptor(canonicalBytes(reordered), { now: new Date("2026-08-24T12:00:00Z") }),
    /package identity mismatch/u,
  );
  const unknown = { ...descriptor(), extra: "forbidden" };
  assert.throws(
    () => validateCandidateDescriptor(canonicalBytes(unknown), { now: new Date("2026-08-24T12:00:00Z") }),
    /field mismatch/u,
  );
});

test("candidate descriptor rejects missing, mismatched, or failed public Node SEA evidence", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const missing = descriptor();
  delete missing.publicNodeSeaEvidence;
  assert.throws(() => validateCandidateDescriptor(canonicalBytes(missing), { now }), /field mismatch/u);

  const packageMismatch = descriptor();
  packageMismatch.publicNodeSeaEvidence.packageSha256 = "8".repeat(64);
  assert.throws(
    () => validateCandidateDescriptor(canonicalBytes(packageMismatch), { now }),
    /package binding mismatch/u,
  );

  const failed = descriptor();
  failed.publicNodeSeaEvidence.executionExitCode = "1";
  assert.throws(
    () => validateCandidateDescriptor(canonicalBytes(failed), { now }),
    /candidate identity mismatch/u,
  );
});

test("D10 accepts only exact same-version first-party peer pins", () => {
  const input = {
    name: "effect-build-bun",
    version: "0.5.0",
    dependencies: { "bun-types": "1.3.14" },
    peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0", "effect-build": "0.5.0" },
  };
  const options = {
    name: input.name,
    version: input.version,
    firstPartyPackages: releaseControl.orderedPackages,
    prerequisites: ["effect-build"],
  };
  assert.equal(assertLockstepPackageManifest({ manifest: input, ...options }), input);
  assert.throws(
    () => assertLockstepPackageManifest({
      manifest: { ...input, peerDependencies: { ...input.peerDependencies, "effect-build": "^0.5.0" } },
      ...options,
    }),
    /exact same-version peer/u,
  );
  assert.throws(
    () => assertLockstepPackageManifest({
      manifest: { ...input, dependencies: { ...input.dependencies, "effect-build": "0.5.0" } },
      ...options,
    }),
    /only as an exact peer/u,
  );
});
