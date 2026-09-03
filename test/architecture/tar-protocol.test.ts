import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

// @ts-expect-error Unprotected strict archive parser.
import { extractStrictPackageManifest } from "../../scripts/release/tar-protocol.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.candidate.tarballInspection;

interface TarEntry {
  readonly body?: Buffer | string;
  readonly invalidChecksum?: boolean;
  readonly linkName?: string;
  readonly magic?: string;
  readonly mutateHeader?: (header: Buffer) => void;
  readonly name: string;
  readonly type?: string;
  readonly version?: string;
}

const tarArchive = (
  entries: ReadonlyArray<TarEntry>,
  end: Uint8Array = Buffer.alloc(1024),
) => {
  const blocks: Array<Uint8Array> = [];
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
    entry.mutateHeader?.(header);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    if (entry.invalidChecksum) header[0] = header[0]! ^ 1;
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  blocks.push(end);
  return Buffer.concat(blocks);
};

const tarball = (entries: ReadonlyArray<TarEntry>, end?: Uint8Array) =>
  gzipSync(tarArchive(entries, end ?? Buffer.alloc(1024)));
const manifest = Buffer.from('{"name":"effect-build","version":"0.6.1"}\n');
const validEntries = [
  { name: "package/", type: "5" },
  { body: manifest, name: "package/package.json" },
] as const;
const extract = (bytes: Buffer, override = policy) =>
  extractStrictPackageManifest({ label: "fixture", policy: override, tarballBytes: bytes });

describe("strict npm package tarball protocol", () => {
  it("binds the protected no-checkout projection to the exact parser source", async () => {
    const projection = policy.protectedProjection;
    const sourceBytes = await readFile(resolve(root, projection.sourcePath));
    expect(sourceBytes.byteLength).toBe(projection.sourceBytes);
    expect(`sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`).toBe(projection.sourceDigest);

    const protectedWorkflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const encoded = protectedWorkflow.match(/const strictPackageTarProjectionBase64 = "([A-Za-z0-9+/=]+)";/u)?.[1];
    expect(encoded).toBeTypeOf("string");
    const compressed = Buffer.from(encoded!, "base64");
    expect(compressed.toString("base64")).toBe(encoded);
    expect(compressed.byteLength).toBe(projection.compressedBytes);
    expect(inflateRawSync(compressed, { maxOutputLength: projection.sourceBytes })).toEqual(sourceBytes);
    expect(protectedWorkflow).not.toMatch(/command\("tar"|\btar\s+-(?:t|x)/u);
  });

  it("returns only the exact in-memory package manifest from a bounded gzip ustar", () => {
    expect(extract(tarball(validEntries))).toEqual(manifest);
  });

  it("rejects PAX, GNU, links, devices, duplicates, traversal, and type confusion", () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<TarEntry>]> = [
      ["PAX", [...validEntries, { name: "pax", type: "x" }]],
      ["GNU long name", [...validEntries, { name: "long", type: "L" }]],
      ["symlink", [...validEntries, { linkName: "package/package.json", name: "package/link", type: "2" }]],
      ["hardlink", [...validEntries, { linkName: "package/package.json", name: "package/link", type: "1" }]],
      ["character device", [...validEntries, { name: "package/device", type: "3" }]],
      ["block device", [...validEntries, { name: "package/device", type: "4" }]],
      ["fifo", [...validEntries, { name: "package/pipe", type: "6" }]],
      ["duplicate", [...validEntries, { body: "other", name: "package/package.json" }]],
      ["parent traversal", [{ body: manifest, name: "package/../package.json" }]],
      ["absolute path", [{ body: manifest, name: "/package/package.json" }]],
      ["backslash", [{ body: manifest, name: "package\\package.json" }]],
      ["outside root", [{ body: manifest, name: "other/package.json" }]],
      ["regular directory name", [{ body: manifest, name: "package/package.json/" }]],
      ["directory file name", [...validEntries, { name: "package/directory", type: "5" }]],
      ["link target on regular file", [...validEntries, { linkName: "other", name: "package/file" }]],
    ];
    for (const [label, entries] of cases) expect(() => extract(tarball(entries)), label).toThrow();
  });

  it("rejects invalid gzip framing, concatenation, trailers, and decompression bombs", () => {
    const valid = tarball(validEntries);
    const optionalHeader = Buffer.from(valid);
    optionalHeader[3] = 0x04;
    const badCrc = Buffer.from(valid);
    badCrc[badCrc.byteLength - 8] = badCrc[badCrc.byteLength - 8]! ^ 1;
    const badSize = Buffer.from(valid);
    badSize[badSize.byteLength - 4] = badSize[badSize.byteLength - 4]! ^ 1;
    const trailingInsideDeflate = Buffer.concat([
      valid.subarray(0, valid.byteLength - 8),
      Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      valid.subarray(valid.byteLength - 8),
    ]);
    const cases = [
      ["optional gzip header", optionalHeader],
      ["bad gzip CRC", badCrc],
      ["bad gzip size", badSize],
      ["concatenated gzip member", Buffer.concat([valid, valid])],
      ["trailing gzip bytes", Buffer.concat([valid, Buffer.from("trailing")])],
      ["trailing bytes inside declared deflate stream", trailingInsideDeflate],
    ] as const;
    for (const [label, bytes] of cases) expect(() => extract(bytes), label).toThrow();
    expect(() => extract(valid, { ...policy, maximumCompressedBytes: valid.byteLength - 1 })).toThrow(
      /bounded/u,
    );
    expect(() =>
      extract(valid, {
        ...policy,
        maximumUnpackedBytes: 1024,
        maximumEntryBytes: 1024,
        maximumTotalEntryBytes: 1024,
        maximumManifestBytes: 1024,
      })
    ).toThrow(/inflated/u);
  });

  it("rejects checksum, base-256, padding, end-marker, count, and manifest bounds", () => {
    const nonzeroPadding = tarArchive([{ body: "x", name: "package/package.json" }]);
    nonzeroPadding[512 + 1] = 1;
    const cases = [
      ["checksum", tarball([{ body: manifest, invalidChecksum: true, name: "package/package.json" }])],
      [
        "base-256",
        tarball([{
          body: manifest,
          mutateHeader: (header) => header[124] = 0x80,
          name: "package/package.json",
        }]),
      ],
      ["legacy magic", tarball([{ body: manifest, magic: "ustar ", name: "package/package.json" }])],
      ["wrong version", tarball([{ body: manifest, name: "package/package.json", version: "01" }])],
      ["nonzero padding", gzipSync(nonzeroPadding)],
      ["one zero end block", tarball(validEntries, Buffer.alloc(512))],
      ["nonzero trailing tar block", tarball(validEntries, Buffer.concat([Buffer.alloc(1024), Buffer.alloc(512, 1)]))],
      ["partial trailing tar bytes", tarball(validEntries, Buffer.alloc(1025))],
    ] as const;
    for (const [label, bytes] of cases) expect(() => extract(bytes), label).toThrow();
    expect(() => extract(tarball([{ body: "readme", name: "package/README.md" }]))).toThrow(
      /does not contain package\/package\.json/u,
    );
    expect(() => extract(tarball(validEntries), { ...policy, maximumEntries: 1 })).toThrow(/too many/u);
    expect(() =>
      extract(tarball(validEntries), {
        ...policy,
        maximumEntryBytes: manifest.byteLength - 1,
        maximumManifestBytes: manifest.byteLength - 1,
      })
    ).toThrow(/oversized ustar member/u);
    expect(() =>
      extract(tarball(validEntries), {
        ...policy,
        maximumTotalEntryBytes: manifest.byteLength - 1,
      })
    ).toThrow(/oversized aggregate member bytes/u);
    expect(() => extract(tarball(validEntries), { ...policy, maximumManifestBytes: manifest.byteLength - 1 }))
      .toThrow(/bounded regular/u);
  });
});
