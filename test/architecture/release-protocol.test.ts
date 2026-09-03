import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// @ts-expect-error The release protocol is an intentionally unprotected Node script module.
import * as protocol from "../../scripts/release/protocol.mjs";

const {
  artifactCoordinate,
  canonicalJson,
  derivePublicModules,
  derivePublicPackageNames,
  extractEmbeddedPackageManifest,
  normalizeUploadArtifactDigest,
  sha256Digest,
  validateEmbeddedPackageManifest,
  validateReleaseCandidate,
} = protocol;

interface TarEntry {
  readonly body?: string;
  readonly linkName?: string;
  readonly magic?: string;
  readonly name: string;
  readonly type?: "0" | "1" | "2" | "5" | "6";
  readonly version?: string;
}

const tarGzip = (entries: ReadonlyArray<TarEntry>) => {
  const blocks: Array<Buffer> = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "");
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header.write(entry.type ?? "0", 156, 1, "ascii");
    if (entry.linkName !== undefined) header.write(entry.linkName, 157, 100, "utf8");
    header.write(entry.magic ?? "ustar\0", 257, 6, "ascii");
    header.write(entry.version ?? "00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
};

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const sourceSha = "a".repeat(40);
const names = derivePublicPackageNames(contract) as ReadonlyArray<string>;
const publicModules = derivePublicModules(contract) as ReadonlyArray<string>;
const version = contract.npmRegistryBoundary.publicationAdmission.target.version as string;

const manifestFor = (name: string) => ({
  name,
  version,
  repository: {
    type: "git",
    url: "git+https://github.com/mannyc2/effect-build.git",
    directory: `packages/${name}`,
  },
  publishConfig: { access: "public", provenance: true },
});

const packageBytes = new Map<string, Uint8Array>();
const packageManifests = new Map<string, { readonly bytes: Uint8Array; readonly manifest: unknown }>();
const packages = names.map((name) => {
  const tarball = new TextEncoder().encode(`tarball:${name}@${version}`);
  const manifest = manifestFor(name);
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  packageBytes.set(name, tarball);
  packageManifests.set(name, { bytes: manifestBytes, manifest });
  return {
    name,
    file: `${name}-${version}.tgz`,
    bytes: tarball.byteLength,
    sha256: sha256Digest(tarball),
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    manifestDigest: sha256Digest(manifestBytes),
  };
});

const candidate = {
  schema: contract.releaseCertification.candidate.protocol as string,
  sourceSha,
  version,
  contract: {
    schema: contract.schema as string,
    digest: sha256Digest(contractBytes),
  },
  toolchain: {
    bun: { name: "bun", version: "1.3.14" },
    node: { name: "node", version: "24.14.1" },
    npm: { name: "npm", version: "11.11.0" },
  },
  publicModules: [...publicModules],
  packages,
};

const files = [contract.releaseCertification.candidate.manifest as string, ...packages.map(({ file }) => file)];
const validate = (
  value: typeof candidate,
  overrides: Partial<{
    readonly contract: unknown;
    readonly contractBytes: Uint8Array;
    readonly expectedSourceSha: string;
    readonly files: ReadonlyArray<string>;
    readonly packageBytes: Map<string, Uint8Array>;
    readonly packageManifests: Map<string, { readonly bytes: Uint8Array; readonly manifest: unknown }>;
  }> = {},
) =>
  validateReleaseCandidate({
    candidate: value,
    contract,
    contractBytes,
    expectedSourceSha: sourceSha,
    files,
    packageBytes,
    packageManifests,
    ...overrides,
  });

describe("unprotected release protocol", () => {
  it("owns canonical JSON and the sole upload-action digest normalization boundary", () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: null } })).toBe(
      '{\n  "a": {\n    "x": null,\n    "y": true\n  },\n  "z": 1\n}\n',
    );
    expect(() => canonicalJson({ omitted: undefined })).toThrow(/not canonical JSON data/u);
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/non-finite/u);
    expect(() => canonicalJson(new Date())).toThrow(/plain JSON object/u);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/u);

    const bare = "b".repeat(64);
    expect(normalizeUploadArtifactDigest(bare, contract.releaseCertification.githubArtifactDigest)).toBe(
      `sha256:${bare}`,
    );
    for (const hostile of [`sha256:${bare}`, bare.toUpperCase(), `sha512:${bare}`, bare.slice(1), `${bare}0`]) {
      expect(() => normalizeUploadArtifactDigest(hostile, contract.releaseCertification.githubArtifactDigest)).toThrow(
        /bare SHA-256/u,
      );
    }
  });

  it("constructs only the exact contract-shaped GitHub artifact coordinate", () => {
    const workflow = "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main";
    const valid = {
      workflow,
      sourceSha,
      runId: "123",
      runAttempt: "1",
      artifactId: "456",
      artifactDigest: `sha256:${"c".repeat(64)}`,
    };
    expect(artifactCoordinate(contract.releaseCertification, valid, workflow)).toEqual(valid);

    const hostile = [
      { ...valid, sourceSha: sourceSha.toUpperCase() },
      { ...valid, runId: "0" },
      { ...valid, runAttempt: "01" },
      { ...valid, artifactId: "-1" },
      { ...valid, artifactDigest: "c".repeat(64) },
      { ...valid, artifactDigest: `sha256:${"C".repeat(64)}` },
      { ...valid, workflow: "mannyc2/effect-build/.github/workflows/release.yml@v0.6.1" },
      { ...valid, extra: "peer-coordinate" },
    ];
    for (const value of hostile) {
      expect(() => artifactCoordinate(contract.releaseCertification, value, workflow)).toThrow();
    }
    const missing = { ...valid } as Partial<typeof valid>;
    delete missing.runAttempt;
    expect(() => artifactCoordinate(contract.releaseCertification, missing, workflow)).toThrow(/fields/u);
  });

  it("derives exactly eleven package roots and the ordered 42-module projection from the contract", () => {
    expect(names).toHaveLength(11);
    expect(names).toEqual([...names].sort());
    expect(names).not.toContain("effect-build-rolldown");
    expect(publicModules).toHaveLength(42);
    expect(new Set(publicModules).size).toBe(42);
    expect(publicModules[0]).toBe("effect-build");
    expect(publicModules).toContain("effect-build-apple/Notary");

    const widened = structuredClone(contract);
    widened.npmRegistryBoundary.publicationAdmission.packages.push("effect-build-rolldown");
    expect(() => derivePublicPackageNames(widened)).toThrow(/public contract projection/u);
    const missingSubpath = structuredClone(contract);
    delete missingSubpath.publicApiProjection.packages["effect-build-apple"].subpaths["./Notary"];
    expect(() => derivePublicModules(missingSubpath)).toThrow(/exact public contract projection/u);
  });

  it("requires the exact public publishConfig and repository identity before accepting an embedded manifest", () => {
    const name = "effect-build-apple";
    const accepted = manifestFor(name);
    expect(validateEmbeddedPackageManifest(accepted, { contract, name, version })).toBe(accepted);

    const hostile = [
      { ...accepted, publishConfig: undefined },
      { ...accepted, publishConfig: { access: "public" } },
      { ...accepted, publishConfig: { access: "public", provenance: false } },
      { ...accepted, publishConfig: { access: "public", provenance: true, tag: "latest" } },
      { ...accepted, publishConfig: { access: "public", provenance: true, registry: "https://registry.npmjs.org" } },
      { ...accepted, publishConfig: { access: "public", provenance: true, _authToken: "forbidden" } },
      { ...accepted, repository: { ...accepted.repository, directory: "packages/effect-build" } },
      { ...accepted, repository: { ...accepted.repository, url: "https://example.invalid/repository" } },
      { ...accepted, repository: { ...accepted.repository, branch: "main" } },
      { ...accepted, private: true },
      { ...accepted, private: false },
      { ...accepted, private: "false" },
      { ...accepted, private: null },
      { ...accepted, name: "effect-build-rolldown" },
    ];
    for (const value of hostile) {
      expect(() => validateEmbeddedPackageManifest(value, { contract, name, version })).toThrow();
    }
  });

  it("extracts one real package manifest and rejects hostile tar entry topology", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-release-protocol-"));
    const accepted = canonicalJson(manifestFor(names[0]!));
    const cases = [
      {
        entries: [{ name: "package/../escape", body: "hostile" }],
        name: "traversal.tgz",
      },
      {
        entries: [{ name: "package\\package.json", body: accepted }],
        name: "backslash.tgz",
      },
      {
        entries: [
          { name: "package/package.json", body: accepted },
          { name: "package/package.json", body: accepted },
        ],
        name: "duplicate.tgz",
      },
      {
        entries: [{ name: "package/README.md", body: "missing" }],
        name: "missing.tgz",
      },
      {
        entries: [{ name: "package/package.json", type: "2", linkName: "package/real.json" }],
        name: "symlink-manifest.tgz",
      },
      {
        entries: [
          { name: "package/package.json", body: accepted },
          { name: "package/manifest-link.json", type: "1", linkName: "package/package.json" },
        ],
        name: "hardlink-entry.tgz",
      },
      {
        entries: [
          { name: "package/package.json", body: accepted },
          { name: "package/pipe", type: "6" },
        ],
        name: "special-entry.tgz",
      },
      {
        entries: [
          { name: "package/package.json", body: accepted },
          { name: "package/README.md", body: "first" },
          { name: "package/README.md", body: "second" },
        ],
        name: "duplicate-other-entry.tgz",
      },
      {
        entries: [{ name: "package/package.json/", body: accepted }],
        name: "regular-directory-name.tgz",
      },
      {
        entries: [
          { name: "package/package.json", body: accepted },
          { name: "package/directory", type: "5" },
        ],
        name: "directory-file-name.tgz",
      },
      {
        entries: [{ name: "package/package.json", body: accepted, magic: "ustar " }],
        name: "legacy-magic.tgz",
      },
      {
        entries: [{ name: "package/package.json", body: accepted, version: "01" }],
        name: "wrong-version.tgz",
      },
    ] as const;
    try {
      const validPath = join(directory, "valid.tgz");
      await writeFile(
        validPath,
        tarGzip([
          { name: "package/", type: "5" },
          { name: "package/package.json", body: accepted },
        ]),
      );
      const extracted = extractEmbeddedPackageManifest(
        validPath,
        contract.releaseCertification.candidate.tarballInspection,
      );
      expect(extracted.manifest).toEqual(manifestFor(names[0]!));
      expect(Buffer.from(extracted.bytes).toString("utf8")).toBe(accepted);

      for (const hostile of cases) {
        const path = join(directory, hostile.name);
        await writeFile(path, tarGzip(hostile.entries));
        expect(() => extractEmbeddedPackageManifest(path, contract.releaseCertification.candidate.tarballInspection))
          .toThrow();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("validates candidate@2 as an exact contract-bound byte ledger with no copied authority", async () => {
    expect(validate(candidate)).toBe(candidate);
    expect(candidate.schema).toBe("effect-build/npm-release-candidate@2");
    expect(candidate.publicModules).toEqual(publicModules);
    expect(candidate.contract.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.keys(candidate)).not.toContain("registry");
    expect(Object.keys(candidate)).not.toContain("publicPackages");
    expect(candidate.packages.map(({ name }) => name)).toEqual(names);
    expect(candidate.packages.every(({ sha256 }) => /^sha256:[0-9a-f]{64}$/u.test(sha256))).toBe(true);

    const source = await readFile(resolve(root, "scripts/release/prepare-npm-candidate.mjs"), "utf8");
    const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(source).not.toContain("tooling/public-api.json");
    expect(source).not.toContain("registry,");
    expect(workflow).not.toContain("scripts/release/protocol.mjs");
  });

  it("rejects hostile candidate protocol, identity, order, byte, manifest, and directory mutations", () => {
    const mutations: ReadonlyArray<(value: typeof candidate) => void> = [
      (value) => value.schema = "effect-build/npm-release-candidate@1",
      (value) => value.sourceSha = value.sourceSha.toUpperCase(),
      (value) => value.version = "0.7.0",
      (value) => value.contract.digest = value.contract.digest.slice(7),
      (value) => value.contract.schema = "peer-contract@1",
      (value) => value.toolchain.bun.version = "latest",
      (value) => value.toolchain.node.version = "24",
      (value) => value.toolchain.npm.version = "11",
      (value) => value.publicModules.reverse(),
      (value) => value.publicModules.pop(),
      (value) => value.packages.reverse(),
      (value) => value.packages[0]!.name = "effect-build-rolldown",
      (value) => value.packages[0]!.file = "../effect-build-0.6.1.tgz",
      (value) => value.packages[0]!.bytes += 1,
      (value) => value.packages[0]!.sha256 = `sha256:${"0".repeat(64)}`,
      (value) => value.packages[0]!.integrity = "sha512-invalid",
      (value) => value.packages[0]!.manifestDigest = `sha256:${"0".repeat(64)}`,
      (value) => Object.assign(value, { registry: contract.npmRegistryBoundary }),
      (value) => Object.assign(value.packages[0]!, { registry: "copied-authority" }),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(candidate);
      mutate(changed);
      expect(() => validate(changed)).toThrow();
    }

    expect(() => validate(candidate, { expectedSourceSha: "d".repeat(40) })).toThrow(/source SHA/u);
    expect(() => validate(candidate, { files: [...files, "extra.json"] })).toThrow(/additional files/u);
    const changedTarballs = new Map(packageBytes);
    changedTarballs.set(names[0]!, new TextEncoder().encode("different bytes"));
    expect(() => validate(candidate, { packageBytes: changedTarballs })).toThrow(/byte ledger/u);
    const changedManifests = new Map(packageManifests);
    const first = names[0]!;
    const hostileManifest = { ...manifestFor(first), publishConfig: { access: "public", provenance: true, otp: "x" } };
    changedManifests.set(first, {
      bytes: new TextEncoder().encode(canonicalJson(hostileManifest)),
      manifest: hostileManifest,
    });
    expect(() => validate(candidate, { packageManifests: changedManifests })).toThrow(/publishConfig/u);
    const mismatchedContractBytes = new TextEncoder().encode(canonicalJson({ ...contract, schema: "other@1" }));
    expect(() => validate(candidate, { contractBytes: mismatchedContractBytes })).toThrow(
      /supplied combined contract/u,
    );
  });
});
