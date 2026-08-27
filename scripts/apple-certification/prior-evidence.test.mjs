import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import {
  reauthenticatePriorEvidenceSnapshot,
  snapshotPriorEvidence,
} from "./prior-evidence.mjs";
import {
  categoryCoordinates,
  coordinateSlug,
  evidenceProtocol,
  packageVersion,
  priorEvidenceManifestProtocol,
  receiptProtocol,
} from "./receipt.mjs";

const testPosixModes = process.platform === "win32" ? test.skip : test;

const sourceSha = "1".repeat(40);
const candidateWorkflowRunId = "2";
const candidateDescriptorDigest = "3".repeat(64);
const certificationWorkflowRunId = "4";
const bunLockSha256 = "5".repeat(64);
const primaryPath = resolve("fixtures/apple-certifier");
const cleanPath = resolve("fixtures/apple-clean-host-certifier");
const primarySha256 = "6".repeat(64);
const cleanSha256 = "7".repeat(64);
const requestSha256 = "8".repeat(64);
const artifactSha256 = "9".repeat(64);
const environment = {
  EFFECT_BUILD_APPLE_CERTIFIER: primaryPath,
  EFFECT_BUILD_APPLE_CERTIFIER_SHA256: primarySha256,
  EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER: cleanPath,
  EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER_SHA256: cleanSha256,
};
const expected = {
  sourceSha,
  candidateWorkflowRunId,
  candidateDescriptorDigest,
  certificationWorkflowRunId,
  bunLockSha256,
};

const artifact = (role, digest) => ({
  role,
  kind: role === "distributed" ? "app-bundle" : "candidate",
  identityKind: "tree-manifest-sha256",
  identitySha256: digest,
  bytes: "1",
});
const step = (name) => ({
  name,
  status: "passed",
  inputSha256: "a".repeat(64),
  outputSha256: "b".repeat(64),
  detailsSha256: "c".repeat(64),
});

const writeDistributionTriple = async (root, coordinate) => {
  const priorEvidenceManifestBytes = canonicalBytes({
    protocol: priorEvidenceManifestProtocol,
    packageVersion,
    category: "distribution",
    coordinate,
    sourceSha,
    candidateWorkflowRunId,
    candidateDescriptorDigest,
    certificationWorkflowRunId,
    bunLockSha256,
    entries: [],
  });
  const evidenceBytes = canonicalBytes({
    protocol: evidenceProtocol,
    packageVersion,
    category: "distribution",
    coordinate,
    sourceSha,
    candidateDescriptorDigest,
    certifierPath: primaryPath,
    certifierSha256: primarySha256,
    bunLockSha256,
    priorEvidenceManifestSha256: sha256(priorEvidenceManifestBytes),
    requestSha256,
    runner: { os: "macOS", arch: "X64", osVersion: "15.0" },
    payload: {
      artifacts: [artifact("input", "d".repeat(64)), artifact("distributed", artifactSha256)],
      credentials: [{
        kind: "developer-id-application",
        fingerprint: "A".repeat(40),
        teamId: "TEAMID1234",
        validFrom: "2026-01-01T00:00:00Z",
        validUntil: "2027-01-01T00:00:00Z",
      }],
      notary: [{
        submissionId: "submission",
        subjectSha256: artifactSha256,
        transportSha256: artifactSha256,
        terminalStatus: "Accepted",
        warningSummarySha256: "e".repeat(64),
        logSha256: "f".repeat(64),
      }],
      steps: ["construct", "sign", "notary-submit", "staple", "staple-validate", "launch"].map(step),
      tools: [{ name: "codesign", path: resolve("fixtures/codesign"), version: "1", sha256: "a".repeat(64) }],
    },
  });
  const receiptBytes = canonicalBytes({
    protocol: receiptProtocol,
    packageVersion,
    category: "distribution",
    coordinate,
    sourceSha,
    checkedOutSourceSha: sourceSha,
    candidateWorkflowRunId,
    candidateDescriptorDigest,
    certificationWorkflowRunId,
    certificationWorkflowRunAttempt: "1",
    certifierPath: primaryPath,
    certifierSha256: primarySha256,
    bunLockSha256,
    cleanWorktree: true,
    priorEvidenceManifestSha256: sha256(priorEvidenceManifestBytes),
    requestSha256,
    runnerOs: "macOS",
    runnerArch: "X64",
    evidenceBytes: String(evidenceBytes.length),
    evidenceSha256: sha256(evidenceBytes),
    verdict: "certified",
  });
  const slug = coordinateSlug("distribution", coordinate);
  await writeFile(join(root, `${slug}.prior-evidence.json`), priorEvidenceManifestBytes);
  await writeFile(join(root, `${slug}.receipt.json`), receiptBytes);
  await writeFile(join(root, `${slug}.evidence.json`), evidenceBytes);
  return { evidenceBytes, slug };
};

testPosixModes("prior evidence is verifier-authenticated, dependency-mapped, and privately snapshotted", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-apple-prior-"));
  try {
    const inputRoot = join(root, "input");
    const temporaryRoot = join(root, "temporary");
    await mkdir(inputRoot);
    await mkdir(temporaryRoot);
    const distributionCoordinate = categoryCoordinates.distribution.find((coordinate) =>
      coordinate === "notarized-stapled-app-bundle|macos-x64"
    );
    const { slug } = await writeDistributionTriple(inputRoot, distributionCoordinate);
    const identity = await snapshotPriorEvidence({
      category: "clean-host",
      coordinate: "G-App|macos-x64",
      inputRoot,
      temporaryRoot,
      environment,
      expected,
    });
    assert.equal(identity.entries.length, 1);
    assert.equal(identity.entries[0].artifactSha256, artifactSha256);
    await reauthenticatePriorEvidenceSnapshot(identity);
    await writeFile(join(inputRoot, `${slug}.evidence.json`), "changed");
    await reauthenticatePriorEvidenceSnapshot(identity);
    const snapshottedEvidence = join(identity.snapshotRoot, `${slug}.evidence.json`);
    await chmod(snapshottedEvidence, 0o600);
    await assert.rejects(() => reauthenticatePriorEvidenceSnapshot(identity), /mode 0400|changed after capture/u);
  } finally {
    await chmod(join(root, "temporary", "authenticated-prior-evidence"), 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

testPosixModes("prior evidence rejects restored bytes, replacement files, and root mutations", async (context) => {
  const withSnapshot = async (run) => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-apple-prior-identity-"));
    const inputRoot = join(root, "input");
    const temporaryRoot = join(root, "temporary");
    await mkdir(inputRoot);
    await mkdir(temporaryRoot);
    const coordinate = "notarized-stapled-app-bundle|macos-x64";
    const { evidenceBytes, slug } = await writeDistributionTriple(inputRoot, coordinate);
    const identity = await snapshotPriorEvidence({
      category: "clean-host",
      coordinate: "G-App|macos-x64",
      inputRoot,
      temporaryRoot,
      environment,
      expected,
    });
    try {
      await run({ root, identity, evidenceBytes, slug });
    } finally {
      await chmod(identity.snapshotRoot, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  };

  await context.test("same-byte regular-file replacement", async () =>
    withSnapshot(async ({ root, identity, evidenceBytes, slug }) => {
      const path = join(identity.snapshotRoot, `${slug}.evidence.json`);
      await chmod(identity.snapshotRoot, 0o700);
      await rename(path, join(root, "evidence-before-replacement.json"));
      await writeFile(path, evidenceBytes, { mode: 0o400, flag: "wx" });
      await chmod(identity.snapshotRoot, 0o500);
      await assert.rejects(() => reauthenticatePriorEvidenceSnapshot(identity), /captured filesystem identity/u);
    }));

  await context.test("restored manifest bytes and mode", async () =>
    withSnapshot(async ({ identity }) => {
      await chmod(identity.manifestPath, 0o600);
      await writeFile(identity.manifestPath, Buffer.alloc(identity.manifestBytes.length, "x"));
      await writeFile(identity.manifestPath, identity.manifestBytes);
      await chmod(identity.manifestPath, 0o400);
      await assert.rejects(() => reauthenticatePriorEvidenceSnapshot(identity), /captured filesystem identity/u);
    }));

  await context.test("same-content directory replacement", async () =>
    withSnapshot(async ({ root, identity }) => {
      const copies = await Promise.all((await readdir(identity.snapshotRoot)).map(async (name) =>
        [name, await readFile(join(identity.snapshotRoot, name))]));
      await chmod(identity.snapshotRoot, 0o700);
      await rename(identity.snapshotRoot, join(root, "prior-evidence-before-replacement"));
      await mkdir(identity.snapshotRoot, { mode: 0o700 });
      for (const [name, bytes] of copies) {
        await writeFile(join(identity.snapshotRoot, name), bytes, { mode: 0o400, flag: "wx" });
      }
      await chmod(identity.snapshotRoot, 0o500);
      await assert.rejects(() => reauthenticatePriorEvidenceSnapshot(identity), /captured filesystem identity/u);
    }));

  await context.test("directory mode", async () =>
    withSnapshot(async ({ identity }) => {
      await chmod(identity.snapshotRoot, 0o700);
      await assert.rejects(() => reauthenticatePriorEvidenceSnapshot(identity), /mode 0500/u);
    }));
});

testPosixModes("prior evidence rejects a syntactically valid but semantically unrelated coordinate", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-apple-prior-hostile-"));
  try {
    const inputRoot = join(root, "input");
    const temporaryRoot = join(root, "temporary");
    await mkdir(inputRoot);
    await mkdir(temporaryRoot);
    await writeDistributionTriple(inputRoot, "developer-id-sign-bun-executable|macos-x64");
    await assert.rejects(
      () => snapshotPriorEvidence({
        category: "clean-host",
        coordinate: "G-App|macos-x64",
        inputRoot,
        temporaryRoot,
        environment,
        expected,
      }),
      /omits distribution\/notarized-stapled-app-bundle/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prior-evidence snapshot capture fails closed without POSIX mode semantics", {
  skip: process.platform !== "win32",
}, async () => {
  await assert.rejects(
    () => snapshotPriorEvidence({
      category: "distribution",
      coordinate: categoryCoordinates.distribution[0],
      inputRoot: undefined,
      temporaryRoot: "C:\\temporary",
      environment,
      expected,
    }),
    /require POSIX read-only mode semantics/u,
  );
});
