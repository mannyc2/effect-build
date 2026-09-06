import assert from "node:assert/strict";
import { test } from "node:test";
import { discardFailedUpload, observeRelease } from "./github-release.mjs";

test("release lookup resolves a draft's database ID before reading its assets", () => {
  const draft = { id: 42, draft: true, assets: [{ name: "package.tgz", digest: "sha256:fixture" }] };
  const execute = (_command, args) => {
    if (args[0] === "release") return JSON.stringify({ databaseId: 42 });
    assert.deepEqual(args, ["api", "repos/owner/repo/releases/42"]);
    return JSON.stringify(draft);
  };
  assert.deepEqual(observeRelease("owner/repo", "v1.2.3", execute), draft);
});

test("only an explicit missing release permits creation", () => {
  const missing = Object.assign(new Error("gh failed"), { status: 1, stderr: "release not found\n" });
  assert.equal(
    observeRelease("owner/repo", "v1.2.3", () => {
      throw missing;
    }),
    undefined,
  );
  for (
    const error of [
      Object.assign(new Error("authentication failed"), { status: 1, stderr: "HTTP 401: Bad credentials\n" }),
      Object.assign(new Error("read failed"), { status: 1, stderr: "HTTP 502: Bad Gateway\n" }),
      Object.assign(new Error("gh unavailable"), { code: "ENOENT" }),
    ]
  ) {
    assert.throws(() =>
      observeRelease("owner/repo", "v1.2.3", () => {
        throw error;
      }), (actual) => actual === error);
  }
});

test("a failed draft upload is deleted by exact asset ID so its candidate can be uploaded again", () => {
  const calls = [];
  assert.equal(
    discardFailedUpload({
      repository: "owner/repo",
      release: { draft: true },
      asset: { id: 73, name: "package.tgz", state: "starter" },
      expectedFile: "/candidate/package.tgz",
      execute: (_command, args) => calls.push(args),
    }),
    true,
  );
  assert.deepEqual(calls, [["api", "--method", "DELETE", "repos/owner/repo/releases/assets/73"]]);
});

test("completed, unexpected, and published assets cannot be deleted as failed uploads", () => {
  const input = {
    repository: "owner/repo",
    release: { draft: true },
    asset: { id: 73, name: "package.tgz", state: "uploaded" },
    expectedFile: "/candidate/package.tgz",
    execute: () => assert.fail("must not delete this asset"),
  };
  assert.equal(discardFailedUpload(input), false);
  assert.throws(() => discardFailedUpload({ ...input, expectedFile: undefined }), /unexpected/u);
  assert.throws(() =>
    discardFailedUpload({
      ...input,
      asset: { ...input.asset, state: "starter" },
      release: { draft: false },
    }), /published release/u);
});
