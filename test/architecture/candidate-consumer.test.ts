import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(join(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(contractBytes.toString());
const version = contract.npmRegistryBoundary.publicationAdmission.target.version;
const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// Minimal real npm tarball: the consumer must reject identity errors before
// asking npm to install anything, even when the archive itself is valid.
const tarball = (manifest: Uint8Array) => {
  const header = Buffer.alloc(512);
  header.write("package/package.json");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${manifest.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.fill(0x20, 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
  return gzipSync(Buffer.concat([header, manifest, Buffer.alloc((512 - manifest.length % 512) % 512 + 1024)]));
};

const writeCandidate = async (directory: string, localDependency = false) => {
  const packages = [];
  for (const name of Object.keys(contract.publicApiProjection.packages).sort()) {
    const manifest = Buffer.from(JSON.stringify({
      name,
      version,
      ...(localDependency ? { dependencies: { "host-only": "file:/effect-build-unavailable" } } : {}),
      repository: {
        type: "git",
        url: "git+https://github.com/mannyc2/effect-build.git",
        directory: `packages/${name}`,
      },
      publishConfig: { access: "public", provenance: true },
    }));
    const bytes = tarball(manifest);
    const file = `${name}-${version}.tgz`;
    await writeFile(join(directory, file), bytes);
    packages.push({
      name,
      file,
      bytes: bytes.length,
      sha256: digest(bytes),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      manifestDigest: digest(manifest),
    });
  }
  return {
    schema: contract.releaseCertification.candidate.protocol,
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    version,
    contract: { schema: contract.schema, digest: digest(contractBytes) },
    toolchain: {
      bun: { name: "bun", version: "1.3.14" },
      node: { name: "node", version: contract.releaseCertification.npmOidcCertification.client.node },
      npm: { name: "npm", version: contract.releaseCertification.npmOidcCertification.client.npm },
    },
    publicModules: Object.entries(contract.publicApiProjection.packages)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, entry]) => [
        name,
        ...Object.keys((entry as { subpaths: object }).subpaths).sort().map((subpath) => `${name}/${subpath.slice(2)}`),
      ]),
    packages,
  };
};

describe("exact candidate consumer", () => {
  it.each(["source", "contract", "tarball", "dependency"] as const)(
    "rejects invalid %s before installation",
    async (kind) => {
      const directory = await mkdtemp(join(tmpdir(), "effect-build-candidate-consumer-test-"));
      try {
        const candidate = await writeCandidate(directory, kind === "dependency");
        if (kind === "source") candidate.sourceSha = "0".repeat(40);
        if (kind === "contract") candidate.contract.digest = `sha256:${"0".repeat(64)}`;
        if (kind === "tarball") candidate.packages[0]!.sha256 = `sha256:${"0".repeat(64)}`;
        await writeFile(join(directory, contract.releaseCertification.candidate.manifest), JSON.stringify(candidate));
        const result = spawnSync("node", ["scripts/test-built-consumer.mjs", "--candidate", directory], {
          cwd: root,
          encoding: "utf8",
          timeout: 15_000,
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        const reason = kind === "dependency"
          ? "packed with unresolved specifier host-only"
          : `release candidate ${
            kind === "source" ? "source SHA" : kind === "contract" ? "contract identity" : "byte ledger"
          } changed`;
        expect(result.stderr).toContain(reason);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
