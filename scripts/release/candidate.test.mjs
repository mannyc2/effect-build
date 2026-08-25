import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalBytes,
  releaseCandidateIdentity,
  releaseControl,
} from "../node-finalizer/common.mjs";
import { assertLockstepPackageManifest } from "../lockstep-package.mjs";
import { validateCandidateDescriptor } from "./candidate.mjs";

const descriptor = () => {
  const identity = releaseCandidateIdentity;
  const sourceSha = "1".repeat(40);
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
    packages: releaseControl.orderedPackages.map((name) => ({
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
    })),
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
