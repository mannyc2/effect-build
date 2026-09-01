import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const driver = resolve(root, "test/fixtures/release/run-sigstore-tuf-provenance-case.mjs");
const run = (kind: string) =>
  spawnSync("node", [driver, kind], {
    cwd: root,
    encoding: "utf8",
    env: { HOME: root, LANG: "C.UTF-8", PATH: process.env.PATH ?? "", TMPDIR: root },
    shell: false,
    timeout: 30_000,
  });

describe("retained Sigstore TUF acquisition provenance", () => {
  it("replays the exact seed rotation, signed metadata chain, and target descriptor in Node", () => {
    const result = run("baseline");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      mirror: "https://tuf-repo-cdn.sigstore.dev",
      retrievedAt: "2026-08-30T15:07:03.000Z",
      rootVersion: 15,
      timestampVersion: 769,
      snapshotVersion: 165,
      targetsVersion: 14,
      target: "trusted_root.json",
      targetDigest: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
    });
  });

  it("rejects retained metadata, target, seed document, client, manifest, and lock mutations", () => {
    for (
      const [kind, message] of [
        ["metadata", /canonical base64|retained byte identity/u],
        ["target", /target descriptor/u],
        ["seed", /seeds document/u],
        ["client", /client differs/u],
        ["manifest", /client differs/u],
        ["lock-relocation", /client differs/u],
      ] as const
    ) {
      const result = run(kind);
      expect(result.status, `${kind}: ${result.stderr}`).toBe(1);
      expect(result.stderr).toMatch(message);
    }
  });
});
