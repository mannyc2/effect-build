import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  authenticateCertificationSource,
  reauthenticateCertificationSource,
} from "./source.mjs";

const execute = promisify(execFile);

test("source authentication binds version, bun.lock, HEAD, and a clean worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-apple-source-"));
  try {
    await writeFile(join(root, "package.json"), '{"version":"0.5.0"}\n');
    await writeFile(join(root, "bun.lock"), "lock\n");
    await execute("git", ["init", "-q"], { cwd: root });
    await execute("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await execute("git", ["config", "user.name", "Test"], { cwd: root });
    await execute("git", ["add", "package.json", "bun.lock"], { cwd: root });
    await execute("git", ["commit", "-qm", "fixture"], { cwd: root });
    const sourceSha = (await execute("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    const identity = await authenticateCertificationSource({ repositoryRoot: root, expectedSourceSha: sourceSha });
    assert.equal(identity.packageVersion, "0.5.0");
    assert.equal(identity.cleanWorktree, true);
    assert.match(identity.bunLockSha256, /^[0-9a-f]{64}$/u);
    await reauthenticateCertificationSource(identity);
    await writeFile(join(root, "bun.lock"), "changed\n");
    await assert.rejects(() => reauthenticateCertificationSource(identity), /clean worktree/u);
    await assert.rejects(
      () => authenticateCertificationSource({ repositoryRoot: root, expectedSourceSha: "0".repeat(40) }),
      /does not match/u,
    );
    await rm(join(root, "bun.lock"));
    await symlink("package.json", join(root, "bun.lock"));
    await execute("git", ["add", "bun.lock"], { cwd: root });
    await execute("git", ["commit", "-qm", "hostile lock link"], { cwd: root });
    const symlinkedSourceSha = (await execute("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    await assert.rejects(
      () => authenticateCertificationSource({ repositoryRoot: root, expectedSourceSha: symlinkedSourceSha }),
      /must be regular files/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
