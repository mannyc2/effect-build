import { inflateRawSync } from "node:zlib";

export function createStrictPackageTarProtocol(inflateRaw) {
  const gzipHeaderBytes = 10;
  const gzipTrailerBytes = 8;
  const gzipMagic = Buffer.from([0x1f, 0x8b, 0x08]);
  const tarBlockBytes = 512;

  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const zeroBytes = (value) => value.every((byte) => byte === 0);
  const fail = (label, reason) => {
    throw new Error(`${label} ${reason}`);
  };

  const exactPolicy = (policy, label) => {
    if (
      !isRecord(policy)
      || policy.protocol !== "effect-build/strict-npm-package-ustar-gzip@1"
      || policy.blockBytes !== tarBlockBytes
      || !Array.isArray(policy.allowedTypes)
      || JSON.stringify(policy.allowedTypes) !== JSON.stringify(["regular", "directory"])
      || policy.manifestPath !== "package/package.json"
      || policy.root !== "package"
      || !Number.isSafeInteger(policy.maximumCompressedBytes)
      || policy.maximumCompressedBytes <= gzipHeaderBytes + gzipTrailerBytes
      || !Number.isSafeInteger(policy.maximumUnpackedBytes)
      || policy.maximumUnpackedBytes < tarBlockBytes * 2
      || !Number.isSafeInteger(policy.maximumEntryBytes)
      || policy.maximumEntryBytes <= 0
      || policy.maximumEntryBytes > policy.maximumUnpackedBytes
      || !Number.isSafeInteger(policy.maximumTotalEntryBytes)
      || policy.maximumTotalEntryBytes <= 0
      || policy.maximumTotalEntryBytes > policy.maximumUnpackedBytes
      || !Number.isSafeInteger(policy.maximumManifestBytes)
      || policy.maximumManifestBytes <= 0
      || policy.maximumManifestBytes > policy.maximumEntryBytes
      || !Number.isSafeInteger(policy.maximumEntries)
      || policy.maximumEntries <= 0
      || policy.gzip
        !== "single-member-rfc1952-fixed-header-no-optional-fields-exact-deflate-consumption-crc32-isize"
      || policy.ustar
        !== "posix-ustar-magic-version-octal-only-checksummed-no-pax-gnu-base256-links-or-specials"
      || policy.endMarker !== "two-zero-blocks-followed-only-by-whole-zero-padding-blocks"
      || policy.members !== "unique-safe-package-root-regular-files-and-directories-only"
      || !isRecord(policy.protectedProjection)
      || policy.protectedProjection.sourcePath !== "scripts/release/tar-protocol.mjs"
      || !Number.isSafeInteger(policy.protectedProjection.sourceBytes)
      || policy.protectedProjection.sourceBytes <= 0
      || !/^sha256:[0-9a-f]{64}$/u.test(policy.protectedProjection.sourceDigest ?? "")
      || !Number.isSafeInteger(policy.protectedProjection.compressedBytes)
      || policy.protectedProjection.compressedBytes <= 0
      || policy.protectedProjection.compressedBytes >= policy.protectedProjection.sourceBytes
      || policy.protectedProjection.encoding !== "deflate-raw-base64-data-url-exact-source"
    ) fail(label, "policy is missing or ambiguous");
    return policy;
  };

  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  const crc32 = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };

  const tarText = (header, offset, length, field, label) => {
    const bytes = header.subarray(offset, offset + length);
    const terminator = bytes.indexOf(0);
    const encoded = terminator === -1 ? bytes : bytes.subarray(0, terminator);
    if (terminator !== -1 && !zeroBytes(bytes.subarray(terminator))) {
      fail(label, `${field} has data after its terminator`);
    }
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
      if (!Buffer.from(value).equals(encoded)) fail(label, `${field} is not canonical UTF-8`);
      return value;
    } catch {
      fail(label, `${field} is not canonical UTF-8`);
    }
  };

  const tarOctal = (header, offset, length, field, label) => {
    const encoded = header.subarray(offset, offset + length);
    if (encoded.some((byte) => byte > 0x7f)) fail(label, `${field} uses base-256 or non-ASCII encoding`);
    const value = encoded.toString("ascii").replaceAll("\0", " ").trim();
    if (!/^[0-7]+$/u.test(value)) fail(label, `${field} is not canonical octal`);
    const parsed = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(parsed) || parsed < 0) fail(label, `${field} is out of range`);
    return parsed;
  };

  const safeMember = (name, type, root, label) => {
    const segments = name.split("/");
    if (
      name.startsWith("/")
      || name.includes("\\")
      || name.includes("\0")
      || segments.includes(".")
      || segments.includes("..")
      || segments[0] !== root
      || segments.some((segment, index) => segment === "" && index !== segments.length - 1)
      || (type === "regular") === name.endsWith("/")
    ) fail(label, `contains an unsafe or type-confused member: ${name}`);
  };

  const inflateGzip = (tarballBytes, policy, label) => {
    const compressed = Buffer.isBuffer(tarballBytes) ? tarballBytes : Buffer.from(tarballBytes ?? []);
    if (
      compressed.byteLength < gzipHeaderBytes + gzipTrailerBytes + 1
      || compressed.byteLength > policy.maximumCompressedBytes
      || !compressed.subarray(0, 3).equals(gzipMagic)
      || compressed[3] !== 0
      || ![0, 2, 4].includes(compressed[8])
    ) fail(label, "is not one bounded fixed-header gzip member");
    const deflate = compressed.subarray(gzipHeaderBytes, compressed.byteLength - gzipTrailerBytes);
    let result;
    try {
      result = inflateRaw(deflate, { info: true, maxOutputLength: policy.maximumUnpackedBytes });
    } catch {
      fail(label, "cannot be inflated within the contract bound");
    }
    const archive = Buffer.from(result?.buffer ?? []);
    if (
      !Number.isSafeInteger(result?.engine?.bytesWritten)
      || result.engine.bytesWritten !== deflate.byteLength
      || archive.byteLength === 0
      || archive.byteLength > policy.maximumUnpackedBytes
      || compressed.readUInt32LE(compressed.byteLength - 8) !== crc32(archive)
      || compressed.readUInt32LE(compressed.byteLength - 4) !== archive.byteLength
    ) fail(label, "gzip stream has trailing members, bytes, or an invalid trailer");
    return archive;
  };

  const extractStrictPackageManifest = ({ tarballBytes, policy, label = "package tarball" }) => {
    const bounds = exactPolicy(policy, label);
    const archive = inflateGzip(tarballBytes, bounds, label);
    if (archive.byteLength % tarBlockBytes !== 0) fail(label, "ustar bytes are not block aligned");
    const names = new Set();
    let entries = 0;
    let manifestBytes;
    let offset = 0;
    let totalEntryBytes = 0;
    while (offset + tarBlockBytes <= archive.byteLength) {
      const header = archive.subarray(offset, offset + tarBlockBytes);
      if (zeroBytes(header)) {
        const second = archive.subarray(offset + tarBlockBytes, offset + tarBlockBytes * 2);
        if (
          second.byteLength !== tarBlockBytes
          || !zeroBytes(second)
          || !zeroBytes(archive.subarray(offset + tarBlockBytes * 2))
        ) fail(label, "does not have one exact zero-padded ustar end marker");
        if (!(manifestBytes instanceof Buffer)) fail(label, `does not contain ${bounds.manifestPath}`);
        return manifestBytes;
      }
      entries += 1;
      if (entries > bounds.maximumEntries) fail(label, "contains too many ustar members");
      const expectedChecksum = tarOctal(header, 148, 8, "header checksum", label);
      const observedChecksum = header.reduce(
        (sum, byte, index) => sum + (index >= 148 && index < 156 ? 0x20 : byte),
        0,
      );
      if (observedChecksum !== expectedChecksum) fail(label, "has an invalid ustar header checksum");
      if (
        !header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii"))
        || !header.subarray(263, 265).equals(Buffer.from("00", "ascii"))
      ) fail(label, "is not exact POSIX ustar");
      tarOctal(header, 100, 8, "mode", label);
      tarOctal(header, 108, 8, "uid", label);
      tarOctal(header, 116, 8, "gid", label);
      const size = tarOctal(header, 124, 12, "entry size", label);
      tarOctal(header, 136, 12, "mtime", label);
      if (size > bounds.maximumEntryBytes) fail(label, "contains an oversized ustar member");
      totalEntryBytes += size;
      if (totalEntryBytes > bounds.maximumTotalEntryBytes) fail(label, "contains oversized aggregate member bytes");
      const typeByte = header[156];
      const type = typeByte === 0 || typeByte === 0x30
        ? "regular"
        : typeByte === 0x35
        ? "directory"
        : undefined;
      if (type === undefined || !bounds.allowedTypes.includes(type)) {
        fail(label, "contains PAX, GNU, link, device, or other special members");
      }
      if (!zeroBytes(header.subarray(157, 257))) fail(label, "contains a link target");
      const leaf = tarText(header, 0, 100, "entry name", label);
      const prefix = tarText(header, 345, 155, "entry prefix", label);
      const name = prefix === "" ? leaf : `${prefix}/${leaf}`;
      if (name.length === 0 || names.has(name)) fail(label, "contains an empty or duplicate member name");
      names.add(name);
      safeMember(name, type, bounds.root, label);
      if (type === "directory" && size !== 0) fail(label, "contains a directory with a body");
      const bodyOffset = offset + tarBlockBytes;
      const paddedBytes = Math.ceil(size / tarBlockBytes) * tarBlockBytes;
      const nextOffset = bodyOffset + paddedBytes;
      if (nextOffset > archive.byteLength) fail(label, `contains a truncated member: ${name}`);
      if (!zeroBytes(archive.subarray(bodyOffset + size, nextOffset))) {
        fail(label, `contains nonzero member padding: ${name}`);
      }
      if (name === bounds.manifestPath) {
        if (type !== "regular" || manifestBytes !== undefined || size > bounds.maximumManifestBytes) {
          fail(label, `does not contain exactly one bounded regular ${bounds.manifestPath}`);
        }
        manifestBytes = Buffer.from(archive.subarray(bodyOffset, bodyOffset + size));
      }
      offset = nextOffset;
    }
    fail(label, "has no canonical ustar end marker");
  };

  return { extractStrictPackageManifest };
}

export const { extractStrictPackageManifest } = createStrictPackageTarProtocol(inflateRawSync);
