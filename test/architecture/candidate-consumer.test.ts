import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const surface = JSON.parse(await readFile(join(root, "tooling/public-api.json"), "utf8"));
const { version } = JSON.parse(await readFile(join(root, "packages/effect-build/package.json"), "utf8"));

const writeCandidate = async (directory: string, names: ReadonlyArray<string>) => {
  const packages = [];
  for (const name of names) {
    // Invalid archive content is intentional: admission must fail before npm is
    // asked to install it, and the consumer must never replace it by repacking.
    const bytes = Buffer.from(`candidate bytes for ${name}`);
    const file = `${name}-${version}.tgz`;
    await writeFile(join(directory, file), bytes);
    packages.push({
      name,
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  const candidate = { sourceSha: "1".repeat(40), version, tag: `v${version}`, packages };
  await writeFile(join(directory, "release-candidate.json"), JSON.stringify(candidate));
  return candidate;
};

const consume = (directory: string) => {
  const environment = { ...process.env };
  delete environment.CANDIDATE_SHA256;
  return spawnSync("node", ["scripts/test-built-consumer.mjs", "--candidate", directory], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 15_000,
  });
};

describe("candidate consumer admission", () => {
  it("rejects changed candidate bytes instead of repacking from the workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-candidate-consumer-test-"));
    try {
      const candidate = await writeCandidate(directory, Object.keys(surface.packages).sort());
      await writeFile(join(directory, candidate.packages[0]!.file), "changed tarball");
      const result = consume(directory);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("candidate tarball bytes do not match the manifest");
      expect(await readFile(join(directory, candidate.packages[0]!.file), "utf8")).toBe("changed tarball");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an incomplete public package set before installation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-candidate-consumer-test-"));
    try {
      await writeCandidate(directory, Object.keys(surface.packages).sort().slice(1));
      const result = consume(directory);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("candidate must contain every public package");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
