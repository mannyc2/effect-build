import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  captureCandidateSnapshot,
  captureRequestSnapshot,
  reauthenticateCandidateSnapshot,
  reauthenticateRequestSnapshot,
} from "./snapshots.mjs";

const testPosixModes = process.platform === "win32" ? test.skip : test;

const candidateEntries = () => new Map([
  ["effect-build-0.5.0.tgz", Buffer.from("candidate core bytes\n")],
  ["effect-build-apple-0.5.0.tgz", Buffer.from("candidate apple bytes\n")],
]);

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-apple-snapshots-"));
  const candidateRoot = join(root, "candidate");
  await mkdir(candidateRoot, { mode: 0o700 });
  const entries = candidateEntries();
  for (const [name, bytes] of entries) await writeFile(join(candidateRoot, name), bytes, { mode: 0o400, flag: "wx" });
  await chmod(candidateRoot, 0o500);
  const candidate = await captureCandidateSnapshot({ root: candidateRoot, entries });
  const requestPath = join(root, "request.json");
  const requestBytes = Buffer.from('{"protocol":"test-request@1"}\n');
  await writeFile(requestPath, requestBytes, { mode: 0o400, flag: "wx" });
  const request = await captureRequestSnapshot({ path: requestPath, bytes: requestBytes });
  return { root, candidateRoot, entries, candidate, requestPath, requestBytes, request };
};

const withFixture = async (run) => {
  const value = await fixture();
  try {
    await run(value);
  } finally {
    await chmod(value.candidateRoot, 0o700).catch(() => undefined);
    await rm(value.root, { recursive: true, force: true });
  }
};

testPosixModes("candidate and request snapshots reauthenticate exact read-only bytes", async () => {
  await withFixture(async ({ candidate, request }) => {
    assert.equal((await reauthenticateCandidateSnapshot(candidate)).files.length, 2);
    assert.equal((await reauthenticateRequestSnapshot(request)).bytes, String(Buffer.from('{"protocol":"test-request@1"}\n').length));
  });
});

testPosixModes("candidate snapshot rejects mode, byte, and exact-file-set changes", async (context) => {
  await context.test("file mode", async () =>
    withFixture(async ({ candidate, candidateRoot }) => {
      await chmod(join(candidateRoot, candidate.names[0]), 0o600);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /mode 0400/u);
    }));

  await context.test("file bytes", async () =>
    withFixture(async ({ candidate, candidateRoot, entries }) => {
      const path = join(candidateRoot, candidate.names[0]);
      await chmod(path, 0o600);
      await writeFile(path, Buffer.alloc(entries.get(candidate.names[0]).length, "x"));
      await chmod(path, 0o400);
      await assert.rejects(
        () => reauthenticateCandidateSnapshot(candidate),
        /captured filesystem identity|length, digest, or bytes/u,
      );
    }));

  await context.test("restored file bytes and mode", async () =>
    withFixture(async ({ candidate, candidateRoot, entries }) => {
      const path = join(candidateRoot, candidate.names[0]);
      const original = entries.get(candidate.names[0]);
      await delay(10);
      await chmod(path, 0o600);
      await writeFile(path, Buffer.alloc(original.length, "x"));
      await writeFile(path, original);
      await chmod(path, 0o400);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /captured filesystem identity/u);
    }));

  await context.test("added file", async () =>
    withFixture(async ({ candidate, candidateRoot }) => {
      await chmod(candidateRoot, 0o700);
      await writeFile(join(candidateRoot, "extra.tgz"), Buffer.from("extra\n"), { mode: 0o400, flag: "wx" });
      await chmod(candidateRoot, 0o500);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /captured filesystem identity|exact file set/u);
    }));

  await context.test("deleted file", async () =>
    withFixture(async ({ candidate, candidateRoot }) => {
      await chmod(candidateRoot, 0o700);
      await unlink(join(candidateRoot, candidate.names[0]));
      await chmod(candidateRoot, 0o500);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /captured filesystem identity|exact file set/u);
    }));

  await context.test("symbolic-link replacement", async () =>
    withFixture(async ({ root, candidate, candidateRoot }) => {
      const path = join(candidateRoot, candidate.names[0]);
      const target = join(root, "replacement.tgz");
      await writeFile(target, Buffer.from("replacement\n"), { mode: 0o400, flag: "wx" });
      await chmod(candidateRoot, 0o700);
      await unlink(path);
      await symlink(target, path);
      await chmod(candidateRoot, 0o500);
      await assert.rejects(
        () => reauthenticateCandidateSnapshot(candidate),
        /captured filesystem identity|regular file|symbolic link/u,
      );
    }));

  await context.test("same-byte regular-file replacement", async () =>
    withFixture(async ({ root, candidate, candidateRoot, entries }) => {
      const path = join(candidateRoot, candidate.names[0]);
      await chmod(candidateRoot, 0o700);
      await rename(path, join(root, "candidate-file-before-replacement.tgz"));
      await writeFile(path, entries.get(candidate.names[0]), { mode: 0o400, flag: "wx" });
      await chmod(candidateRoot, 0o500);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /captured filesystem identity/u);
    }));

  await context.test("same-content directory replacement", async () =>
    withFixture(async ({ root, candidate, candidateRoot, entries }) => {
      const moved = join(root, "candidate-before-replacement");
      await chmod(candidateRoot, 0o700);
      await rename(candidateRoot, moved);
      await mkdir(candidateRoot, { mode: 0o700 });
      for (const [name, bytes] of entries) await writeFile(join(candidateRoot, name), bytes, { mode: 0o400, flag: "wx" });
      await chmod(candidateRoot, 0o500);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /captured filesystem identity/u);
    }));

  await context.test("directory mode", async () =>
    withFixture(async ({ candidate, candidateRoot }) => {
      await chmod(candidateRoot, 0o700);
      await assert.rejects(() => reauthenticateCandidateSnapshot(candidate), /mode 0500/u);
    }));
});

testPosixModes("request snapshot rejects same-UID rewrite, mode change, and symbolic-link replacement", async (context) => {
  await context.test("mode", async () =>
    withFixture(async ({ request, requestPath }) => {
      await chmod(requestPath, 0o600);
      await assert.rejects(() => reauthenticateRequestSnapshot(request), /mode 0400/u);
    }));

  await context.test("bytes", async () =>
    withFixture(async ({ request, requestPath, requestBytes }) => {
      await chmod(requestPath, 0o600);
      await writeFile(requestPath, Buffer.alloc(requestBytes.length, "x"));
      await chmod(requestPath, 0o400);
      await assert.rejects(
        () => reauthenticateRequestSnapshot(request),
        /captured filesystem identity|length, digest, or bytes/u,
      );
    }));

  await context.test("restored bytes and mode", async () =>
    withFixture(async ({ request, requestPath, requestBytes }) => {
      await delay(10);
      await chmod(requestPath, 0o600);
      await writeFile(requestPath, Buffer.alloc(requestBytes.length, "x"));
      await writeFile(requestPath, requestBytes);
      await chmod(requestPath, 0o400);
      await assert.rejects(() => reauthenticateRequestSnapshot(request), /captured filesystem identity/u);
    }));

  await context.test("symbolic link", async () =>
    withFixture(async ({ root, request, requestPath, requestBytes }) => {
      const target = join(root, "replacement-request.json");
      await writeFile(target, requestBytes, { mode: 0o400, flag: "wx" });
      await unlink(requestPath);
      await symlink(target, requestPath);
      await assert.rejects(() => reauthenticateRequestSnapshot(request), /regular file|symbolic link/u);
    }));

  await context.test("same-byte regular file", async () =>
    withFixture(async ({ root, request, requestPath, requestBytes }) => {
      await rename(requestPath, join(root, "request-before-replacement.json"));
      await writeFile(requestPath, requestBytes, { mode: 0o400, flag: "wx" });
      await assert.rejects(() => reauthenticateRequestSnapshot(request), /captured filesystem identity/u);
    }));
});

test("snapshot capture fails closed without POSIX mode semantics", {
  skip: process.platform !== "win32",
}, async () => {
  await assert.rejects(
    () => captureCandidateSnapshot({ root: "C:\\candidate", entries: candidateEntries() }),
    /require POSIX read-only mode semantics/u,
  );
  await assert.rejects(
    () => captureRequestSnapshot({ path: "C:\\request.json", bytes: Buffer.from("request\n") }),
    /require POSIX read-only mode semantics/u,
  );
});
