import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sha256 } from "../node-finalizer/common.mjs";
import {
  approvedCertifierIdentities,
  reauthenticateCertifierSnapshot,
  snapshotApprovedCertifier,
} from "./certifier.mjs";

const environmentFor = (primaryPath, primaryBytes, cleanPath, cleanBytes) => ({
  EFFECT_BUILD_APPLE_CERTIFIER: primaryPath,
  EFFECT_BUILD_APPLE_CERTIFIER_SHA256: sha256(primaryBytes),
  EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER: cleanPath,
  EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER_SHA256: sha256(cleanBytes),
});

test("certifier execution uses an authenticated read-only snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-certifier-"));
  try {
    const primaryPath = join(root, "primary");
    const cleanPath = join(root, "clean");
    const primaryBytes = Buffer.from("#!/bin/sh\nexit 0\n");
    const cleanBytes = Buffer.from("#!/bin/sh\nexit 1\n");
    await writeFile(primaryPath, primaryBytes);
    await writeFile(cleanPath, cleanBytes);
    await chmod(primaryPath, 0o700);
    await chmod(cleanPath, 0o700);
    const temporaryRoot = join(root, "snapshot");
    await mkdir(temporaryRoot);
    const environment = environmentFor(primaryPath, primaryBytes, cleanPath, cleanBytes);
    const identity = await snapshotApprovedCertifier({ category: "distribution", temporaryRoot, environment });
    assert.equal(identity.path, primaryPath);
    assert.deepEqual(await readFile(identity.snapshotPath), primaryBytes);
    await writeFile(primaryPath, Buffer.from("changed"));
    await reauthenticateCertifierSnapshot(identity);
    await chmod(identity.snapshotPath, 0o700);
    await writeFile(identity.snapshotPath, Buffer.from("changed"));
    await assert.rejects(() => reauthenticateCertifierSnapshot(identity), /read-only|changed before execution/u);
    const aliasTarget = join(root, "alias-target");
    await writeFile(aliasTarget, primaryBytes);
    await rm(identity.snapshotPath);
    await symlink(aliasTarget, identity.snapshotPath);
    await assert.rejects(() => reauthenticateCertifierSnapshot(identity), /must not be a symbolic link/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("certifier admission rejects wrong, shared, and symlinked identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-certifier-hostile-"));
  try {
    const primaryPath = join(root, "primary");
    const cleanPath = join(root, "clean");
    const linkPath = join(root, "link");
    const temporaryRoot = join(root, "snapshot");
    const primaryBytes = Buffer.from("primary");
    const cleanBytes = Buffer.from("clean");
    await writeFile(primaryPath, primaryBytes);
    await writeFile(cleanPath, cleanBytes);
    await symlink(primaryPath, linkPath);
    await mkdir(temporaryRoot);
    const wrong = environmentFor(primaryPath, Buffer.from("wrong"), cleanPath, cleanBytes);
    await assert.rejects(
      () => snapshotApprovedCertifier({ category: "distribution", temporaryRoot, environment: wrong }),
      /digest mismatch/u,
    );
    const shared = environmentFor(primaryPath, primaryBytes, cleanPath, primaryBytes);
    assert.throws(() => approvedCertifierIdentities(shared), /must be distinct/u);
    const symlinked = environmentFor(linkPath, primaryBytes, cleanPath, cleanBytes);
    await assert.rejects(
      () => snapshotApprovedCertifier({ category: "distribution", temporaryRoot, environment: symlinked }),
      /must not be a symbolic link/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
