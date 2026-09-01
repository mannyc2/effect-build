import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// @ts-expect-error Unprotected strict archive parser.
import { extractStrictFlatZip } from "../../scripts/release/zip-protocol.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.readiness.zipExtraction;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

interface FixtureEntry {
  readonly bytes: Buffer;
  readonly compressedSuffix?: Buffer;
  readonly descriptor?: boolean;
  readonly externalAttributes?: number;
  readonly extra?: Buffer;
  readonly flags?: number;
  readonly method?: 0 | 8;
  readonly name: string | Buffer;
}

const zipFixture = (entries: ReadonlyArray<FixtureEntry>) => {
  const localParts: Array<Buffer> = [];
  const centralParts: Array<Buffer> = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name);
    const extra = entry.extra ?? Buffer.alloc(0);
    const descriptor = entry.descriptor ?? true;
    const flags = entry.flags ?? (descriptor ? 0x0008 : 0);
    const method = entry.method ?? 0;
    const compressed = Buffer.concat([
      method === 0 ? entry.bytes : deflateRawSync(entry.bytes),
      entry.compressedSuffix ?? Buffer.alloc(0),
    ]);
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (!descriptor) {
      local.writeUInt32LE(checksum, 14);
      local.writeUInt32LE(compressed.byteLength, 18);
      local.writeUInt32LE(entry.bytes.byteLength, 22);
    }
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(extra.byteLength, 28);
    const descriptorBytes = descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (descriptor) {
      descriptorBytes.writeUInt32LE(0x08074b50, 0);
      descriptorBytes.writeUInt32LE(checksum, 4);
      descriptorBytes.writeUInt32LE(compressed.byteLength, 8);
      descriptorBytes.writeUInt32LE(entry.bytes.byteLength, 12);
    }
    localParts.push(local, name, extra, compressed, descriptorBytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x032d, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.byteLength, 20);
    central.writeUInt32LE(entry.bytes.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt16LE(extra.byteLength, 30);
    central.writeUInt32LE(entry.externalAttributes ?? 0x81a40020, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name, extra);
    localOffset += local.byteLength + name.byteLength + extra.byteLength + compressed.byteLength
      + descriptorBytes.byteLength;
  }
  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.byteLength, 12);
  end.writeUInt32LE(localBytes.byteLength, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
};

const extract = (zipBytes: Buffer, expectedFiles = ["one.json"], override = policy) =>
  extractStrictFlatZip({ zipBytes, expectedFiles, label: "fixture", policy: override });

describe("strict flat ZIP protocol", () => {
  it("binds the no-checkout projection and checkout workflow to one exact parser source", async () => {
    const projection = policy.protectedProjection;
    const sourceBytes = await readFile(resolve(root, projection.sourcePath));
    expect(sourceBytes.byteLength).toBe(projection.sourceBytes);
    expect(`sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`).toBe(projection.sourceDigest);

    const protectedWorkflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const encoded = protectedWorkflow.match(/const strictFlatZipProjectionBase64 = "([A-Za-z0-9+/=]+)";/u)?.[1];
    expect(encoded).toBeTypeOf("string");
    const compressed = Buffer.from(encoded!, "base64");
    expect(compressed.toString("base64")).toBe(encoded);
    expect(compressed.byteLength).toBe(projection.compressedBytes);
    expect(inflateRawSync(compressed, { maxOutputLength: projection.sourceBytes })).toEqual(sourceBytes);
    expect(protectedWorkflow).not.toMatch(/command\("unzip"|\bunzip\s+-/u);

    const verificationWorkflow = await readFile(
      resolve(root, ".github/workflows/release-verification.yml"),
      "utf8",
    );
    expect(verificationWorkflow).toContain(
      'import { extractStrictFlatZip } from "./scripts/release/zip-protocol.mjs";',
    );
    expect(verificationWorkflow).toContain("zipProtocolBytes.byteLength !== projection.sourceBytes");
    expect(verificationWorkflow).not.toMatch(/\bunzip\s+-/u);
  });

  it("accepts exact stored/deflated members and signed descriptors", () => {
    const stored = zipFixture([{ bytes: Buffer.from("one\n"), name: "one.json" }]);
    expect(extract(stored).get("one.json")?.toString()).toBe("one\n");
    const deflated = zipFixture([{
      bytes: Buffer.from("deflated evidence\n"),
      descriptor: false,
      method: 8,
      name: "one.json",
    }]);
    expect(extract(deflated).get("one.json")?.toString()).toBe("deflated evidence\n");
  });

  it("rejects ambiguous topology, features, paths, types, and record correlations", () => {
    const valid = zipFixture([{ bytes: Buffer.from("one\n"), name: "one.json" }]);
    const mutate = (offset: number, size: 2 | 4, value: number) => {
      const changed = Buffer.from(valid);
      if (size === 2) changed.writeUInt16LE(value, offset);
      else changed.writeUInt32LE(value, offset);
      return changed;
    };
    const centralOffset = valid.readUInt32LE(valid.byteLength - 6);
    const descriptorOffset = centralOffset - 16;
    const unsupportedFlags = Buffer.from(valid);
    unsupportedFlags.writeUInt16LE(0x0010, 6);
    unsupportedFlags.writeUInt16LE(0x0010, centralOffset + 8);
    const localNameMismatch = Buffer.from(valid);
    localNameMismatch[30] = "t".charCodeAt(0);
    const payloadCorruption = Buffer.from(valid);
    payloadCorruption[38] = payloadCorruption[38]! ^ 1;
    const truncatedDescriptor = Buffer.concat([
      valid.subarray(0, centralOffset - 1),
      valid.subarray(centralOffset),
    ]);
    truncatedDescriptor.writeUInt32LE(centralOffset - 1, truncatedDescriptor.byteLength - 6);
    const hostile: ReadonlyArray<{
      readonly bytes: Buffer;
      readonly label: string;
      readonly override?: typeof policy;
    }> = [
      { bytes: Buffer.concat([Buffer.from("prefix"), valid]), label: "prepended bytes" },
      { bytes: Buffer.concat([valid, Buffer.from("trailer")]), label: "trailing bytes" },
      { bytes: mutate(valid.byteLength - 18, 2, 1), label: "multidisk EOCD" },
      { bytes: mutate(valid.byteLength - 14, 2, 0), label: "disk entry-count mismatch" },
      { bytes: mutate(valid.byteLength - 12, 2, 0xffff), label: "Zip64 entry-count sentinel" },
      { bytes: mutate(valid.byteLength - 2, 2, 1), label: "EOCD comment" },
      { bytes: mutate(centralOffset + 4, 2, 0x0014), label: "non-GitHub creator platform" },
      { bytes: mutate(centralOffset + 6, 2, 10), label: "wrong version-needed" },
      { bytes: unsupportedFlags, label: "unsupported general-purpose flag" },
      { bytes: mutate(centralOffset + 10, 2, 12), label: "unsupported compression method" },
      { bytes: mutate(centralOffset + 12, 2, 1), label: "local-central timestamp mismatch" },
      { bytes: localNameMismatch, label: "local-central name mismatch" },
      { bytes: mutate(centralOffset + 20, 4, 0xffffffff), label: "Zip64 size sentinel" },
      { bytes: mutate(centralOffset + 38, 4, 0xa1ff0020), label: "symlink Unix mode" },
      { bytes: mutate(centralOffset + 38, 4, 0x21a40020), label: "device Unix mode" },
      { bytes: mutate(descriptorOffset, 4, 0), label: "unsigned data descriptor" },
      { bytes: truncatedDescriptor, label: "truncated data descriptor" },
      { bytes: payloadCorruption, label: "payload CRC mismatch" },
      {
        bytes: zipFixture([{
          bytes: Buffer.from("one\n"),
          compressedSuffix: Buffer.from([0xde, 0xad, 0xbe, 0xef]),
          descriptor: false,
          method: 8,
          name: "one.json",
        }]),
        label: "trailing bytes inside declared deflate member",
      },
      {
        bytes: zipFixture([
          { bytes: Buffer.from("one\n"), name: "one.json" },
          { bytes: Buffer.from("two\n"), name: "one.json" },
        ]),
        label: "duplicate member name",
      },
      {
        bytes: zipFixture([{ bytes: Buffer.from("one\n"), name: "../one.json" }]),
        label: "traversal member name",
      },
      {
        bytes: zipFixture([{ bytes: Buffer.from("one\n"), name: Buffer.from([0xff]) }]),
        label: "invalid UTF-8 name",
      },
      {
        bytes: zipFixture([{
          bytes: Buffer.from("one\n"),
          extra: Buffer.from([0x02, 0x00, 0x00, 0x00]),
          name: "one.json",
        }]),
        label: "unsupported extra field",
      },
      {
        bytes: zipFixture([{
          bytes: Buffer.from("one\n"),
          extra: Buffer.from([0x02, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]),
          name: "one.json",
        }]),
        label: "duplicate extra field",
        override: { ...policy, allowedExtraFieldIds: [2] },
      },
    ];
    for (const fixture of hostile) {
      expect(() => extract(fixture.bytes, ["one.json"], fixture.override), fixture.label).toThrow();
    }
  });

  it("enforces member, aggregate, ratio, entry, and archive byte limits before inflation", () => {
    const compressedBomb = zipFixture([{
      bytes: Buffer.alloc(32_768, 0x61),
      method: 8,
      name: "one.json",
    }]);
    expect(() => extract(compressedBomb)).toThrow(/ratio/u);

    const two = zipFixture([
      { bytes: Buffer.from("12345"), name: "one.json" },
      { bytes: Buffer.from("67890"), name: "two.json" },
    ]);
    expect(() =>
      extract(two, ["one.json", "two.json"], {
        ...policy,
        maximumTotalUncompressedBytes: 9,
      })
    ).toThrow(/aggregate uncompressed/u);
    expect(() =>
      extract(two, ["one.json", "two.json"], {
        ...policy,
        maximumEntries: 1,
      })
    ).toThrow(/expected file policy/u);
    expect(() =>
      extract(two, ["one.json", "two.json"], {
        ...policy,
        maximumArchiveBytes: two.byteLength - 1,
      })
    ).toThrow(/archive byte length/u);
    expect(() =>
      extract(zipFixture([{ bytes: Buffer.from("12345"), name: "one.json" }]), ["one.json"], {
        ...policy,
        maximumMemberCompressedBytes: 4,
      })
    ).toThrow(/compressed size/u);
    expect(() =>
      extract(zipFixture([{ bytes: Buffer.from("12345"), name: "one.json" }]), ["one.json"], {
        ...policy,
        maximumMemberUncompressedBytes: 4,
      })
    ).toThrow(/size/u);
  });
});
