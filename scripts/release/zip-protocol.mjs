import { inflateRawSync } from "node:zlib";

export function createStrictFlatZipProtocol(inflateRaw) {
const centralSignature = 0x02014b50;
const dataDescriptorSignature = 0x08074b50;
const endSignature = 0x06054b50;
const localSignature = 0x04034b50;
const zip64ExtraField = 0x0001;
const zip64Uint16 = 0xffff;
const zip64Uint32 = 0xffffffff;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const fail = (label, reason) => {
  throw new Error(`${label} ZIP ${reason}`);
};

const uint16 = (bytes, offset, label) => {
  if (offset < 0 || offset + 2 > bytes.byteLength) fail(label, "record is truncated");
  return bytes.readUInt16LE(offset);
};

const uint32 = (bytes, offset, label) => {
  if (offset < 0 || offset + 4 > bytes.byteLength) fail(label, "record is truncated");
  return bytes.readUInt32LE(offset);
};

const exactPolicy = (policy, label) => {
  if (
    !isRecord(policy)
    || policy.protocol !== "effect-build/strict-flat-zip@1"
    || !Array.isArray(policy.allowedCompressionMethods)
    || policy.allowedCompressionMethods.length === 0
    || new Set(policy.allowedCompressionMethods).size !== policy.allowedCompressionMethods.length
    || policy.allowedCompressionMethods.some((value) => ![0, 8].includes(value))
    || policy.allowedGeneralPurposeBitMask !== 2056
    || !Array.isArray(policy.allowedExtraFieldIds)
    || new Set(policy.allowedExtraFieldIds).size !== policy.allowedExtraFieldIds.length
    || policy.allowedExtraFieldIds.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 0xffff)
    || policy.creatorVersionMadeBy !== 813
    || policy.requiredVersionNeeded !== 20
    || !isRecord(policy.protectedProjection)
    || policy.protectedProjection.sourcePath !== "scripts/release/zip-protocol.mjs"
    || !Number.isSafeInteger(policy.protectedProjection.sourceBytes)
    || policy.protectedProjection.sourceBytes <= 0
    || !/^sha256:[0-9a-f]{64}$/u.test(policy.protectedProjection.sourceDigest ?? "")
    || !Number.isSafeInteger(policy.protectedProjection.compressedBytes)
    || policy.protectedProjection.compressedBytes <= 0
    || policy.protectedProjection.compressedBytes >= policy.protectedProjection.sourceBytes
    || policy.protectedProjection.encoding !== "deflate-raw-base64-data-url-exact-source"
    || !Number.isSafeInteger(policy.maximumArchiveBytes)
    || policy.maximumArchiveBytes <= 0
    || !Number.isSafeInteger(policy.maximumEntries)
    || policy.maximumEntries <= 0
    || !Number.isSafeInteger(policy.maximumNameBytes)
    || policy.maximumNameBytes <= 0
    || !Number.isSafeInteger(policy.maximumExtraBytes)
    || policy.maximumExtraBytes < 0
    || !Number.isSafeInteger(policy.maximumMemberCompressedBytes)
    || policy.maximumMemberCompressedBytes <= 0
    || !Number.isSafeInteger(policy.maximumMemberUncompressedBytes)
    || policy.maximumMemberUncompressedBytes <= 0
    || !Number.isSafeInteger(policy.maximumTotalUncompressedBytes)
    || policy.maximumTotalUncompressedBytes <= 0
    || !Number.isSafeInteger(policy.maximumCompressionRatio)
    || policy.maximumCompressionRatio <= 0
    || policy.dataDescriptor !== "required-signed-16-byte-exact-central-correlation-when-bit-3-set"
    || policy.topology !== "single-disk-zero-comment-no-zip64-no-prefix-trailer-or-record-gaps"
    || policy.members !== "unique-flat-utf8-regular-files-only"
    || policy.encryption !== "forbidden"
    || policy.crc32 !== "required-before-admission"
  ) fail(label, "policy is missing or ambiguous");
  return policy;
};

const exactExpectedFiles = (expectedFiles, policy, label) => {
  if (
    !Array.isArray(expectedFiles)
    || expectedFiles.length === 0
    || expectedFiles.length > policy.maximumEntries
    || new Set(expectedFiles).size !== expectedFiles.length
    || expectedFiles.some((name) =>
      typeof name !== "string"
      || name.length === 0
      || name.startsWith(".")
      || name.includes("/")
      || name.includes("\\")
      || name.includes("\0")
      || Buffer.byteLength(name) > policy.maximumNameBytes
    )
  ) fail(label, "expected file policy is invalid");
  return new Set(expectedFiles);
};

const parseExtraFields = (bytes, start, length, policy, label) => {
  if (length > policy.maximumExtraBytes) fail(label, "extra fields exceed the byte bound");
  const end = start + length;
  if (end > bytes.byteLength) fail(label, "extra fields are truncated");
  const ids = new Set();
  let offset = start;
  while (offset < end) {
    if (offset + 4 > end) fail(label, "extra-field header is truncated");
    const id = uint16(bytes, offset, label);
    const size = uint16(bytes, offset + 2, label);
    offset += 4;
    if (offset + size > end) fail(label, "extra-field payload is truncated");
    if (id === zip64ExtraField) fail(label, "Zip64 is forbidden");
    if (ids.has(id) || !policy.allowedExtraFieldIds.includes(id)) {
      fail(label, "extra-field identity is duplicate or unsupported");
    }
    ids.add(id);
    offset += size;
  }
  if (offset !== end) fail(label, "extra fields have trailing bytes");
};

const decodeName = (bytes, policy, label) => {
  if (bytes.byteLength === 0 || bytes.byteLength > policy.maximumNameBytes) {
    fail(label, "member name length is invalid");
  }
  let name;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(label, "member name is not UTF-8");
  }
  if (
    !Buffer.from(name).equals(bytes)
    || name.startsWith(".")
    || name.includes("/")
    || name.includes("\\")
    || name.includes("\0")
  ) fail(label, "member name is not one canonical flat name");
  return name;
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

const inspectStrictFlatZip = ({ zipBytes, expectedFiles, policy, label = "artifact" }) => {
  const bounds = exactPolicy(policy, label);
  const expected = exactExpectedFiles(expectedFiles, bounds, label);
  const bytes = Buffer.from(zipBytes ?? []);
  if (bytes.byteLength < 22 || bytes.byteLength > bounds.maximumArchiveBytes) {
    fail(label, "archive byte length is outside the bound");
  }
  const endOffset = bytes.byteLength - 22;
  if (uint32(bytes, endOffset, label) !== endSignature) fail(label, "has no exact terminal EOCD record");
  const disk = uint16(bytes, endOffset + 4, label);
  const centralDisk = uint16(bytes, endOffset + 6, label);
  const diskEntries = uint16(bytes, endOffset + 8, label);
  const entryCount = uint16(bytes, endOffset + 10, label);
  const centralSize = uint32(bytes, endOffset + 12, label);
  const centralOffset = uint32(bytes, endOffset + 16, label);
  const commentLength = uint16(bytes, endOffset + 20, label);
  if (
    disk !== 0
    || centralDisk !== 0
    || diskEntries !== entryCount
    || entryCount === 0
    || entryCount === zip64Uint16
    || entryCount > bounds.maximumEntries
    || centralSize === zip64Uint32
    || centralOffset === zip64Uint32
    || commentLength !== 0
    || centralOffset === 0
    || centralOffset + centralSize !== endOffset
  ) fail(label, "EOCD topology is multidisk, Zip64, commented, prefixed, or noncontiguous");

  const entries = [];
  const names = new Set();
  let centralCursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(bytes, centralCursor, label) !== centralSignature) {
      fail(label, "central directory record is missing or out of order");
    }
    if (centralCursor + 46 > endOffset) fail(label, "central directory record is truncated");
    const versionMadeBy = uint16(bytes, centralCursor + 4, label);
    const versionNeeded = uint16(bytes, centralCursor + 6, label);
    const flags = uint16(bytes, centralCursor + 8, label);
    const method = uint16(bytes, centralCursor + 10, label);
    const modifiedTime = uint16(bytes, centralCursor + 12, label);
    const modifiedDate = uint16(bytes, centralCursor + 14, label);
    const checksum = uint32(bytes, centralCursor + 16, label);
    const compressedSize = uint32(bytes, centralCursor + 20, label);
    const uncompressedSize = uint32(bytes, centralCursor + 24, label);
    const nameLength = uint16(bytes, centralCursor + 28, label);
    const extraLength = uint16(bytes, centralCursor + 30, label);
    const entryCommentLength = uint16(bytes, centralCursor + 32, label);
    const startDisk = uint16(bytes, centralCursor + 34, label);
    const externalAttributes = uint32(bytes, centralCursor + 38, label);
    const localOffset = uint32(bytes, centralCursor + 42, label);
    if (
      versionMadeBy !== bounds.creatorVersionMadeBy
      || versionNeeded !== bounds.requiredVersionNeeded
      || (flags & ~bounds.allowedGeneralPurposeBitMask) !== 0
      || !bounds.allowedCompressionMethods.includes(method)
      || compressedSize === zip64Uint32
      || uncompressedSize === zip64Uint32
      || compressedSize === 0
      || uncompressedSize === 0
      || nameLength === 0
      || nameLength > bounds.maximumNameBytes
      || entryCommentLength !== 0
      || startDisk !== 0
      || localOffset === zip64Uint32
      || localOffset >= centralOffset
      || (externalAttributes & 0x10) !== 0
    ) fail(label, "central member flags, sizes, type, or topology are unsupported");
    if (uncompressedSize > bounds.maximumMemberUncompressedBytes) {
      fail(label, "member uncompressed size exceeds the bound");
    }
    if (compressedSize > bounds.maximumMemberCompressedBytes) {
      fail(label, "member compressed size exceeds the bound");
    }
    if (uncompressedSize / compressedSize > bounds.maximumCompressionRatio) {
      fail(label, "member compression ratio exceeds the bound");
    }
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((unixMode & 0xf000) !== 0x8000) {
      fail(label, "central member is not a regular Unix file");
    }
    const nameStart = centralCursor + 46;
    const extraStart = nameStart + nameLength;
    const nextCentral = extraStart + extraLength + entryCommentLength;
    if (nextCentral > endOffset) fail(label, "central member record is truncated");
    const nameBytes = bytes.subarray(nameStart, extraStart);
    const name = decodeName(nameBytes, bounds, label);
    if (!expected.has(name) || names.has(name)) fail(label, "member set is unexpected or duplicate");
    names.add(name);
    parseExtraFields(bytes, extraStart, extraLength, bounds, label);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > bounds.maximumTotalUncompressedBytes) {
      fail(label, "aggregate uncompressed size exceeds the bound");
    }
    entries.push({
      checksum,
      compressedSize,
      flags,
      localOffset,
      method,
      modifiedDate,
      modifiedTime,
      name,
      nameBytes: Buffer.from(nameBytes),
      uncompressedSize,
      versionNeeded,
    });
    centralCursor = nextCentral;
  }
  if (centralCursor !== endOffset || names.size !== expected.size) {
    fail(label, "central directory has trailing, missing, or additional members");
  }

  const byOffset = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  if (byOffset[0]?.localOffset !== 0) fail(label, "has prepended bytes before the first member");
  for (let index = 0; index < byOffset.length; index += 1) {
    const entry = byOffset[index];
    const nextOffset = byOffset[index + 1]?.localOffset ?? centralOffset;
    if (uint32(bytes, entry.localOffset, label) !== localSignature || entry.localOffset + 30 > centralOffset) {
      fail(label, "local member header is missing or truncated");
    }
    const localVersion = uint16(bytes, entry.localOffset + 4, label);
    const localFlags = uint16(bytes, entry.localOffset + 6, label);
    const localMethod = uint16(bytes, entry.localOffset + 8, label);
    const localModifiedTime = uint16(bytes, entry.localOffset + 10, label);
    const localModifiedDate = uint16(bytes, entry.localOffset + 12, label);
    const localChecksum = uint32(bytes, entry.localOffset + 14, label);
    const localCompressedSize = uint32(bytes, entry.localOffset + 18, label);
    const localUncompressedSize = uint32(bytes, entry.localOffset + 22, label);
    const localNameLength = uint16(bytes, entry.localOffset + 26, label);
    const localExtraLength = uint16(bytes, entry.localOffset + 28, label);
    const localNameStart = entry.localOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    if (
      localVersion !== entry.versionNeeded
      || localFlags !== entry.flags
      || localMethod !== entry.method
      || localModifiedTime !== entry.modifiedTime
      || localModifiedDate !== entry.modifiedDate
      || localNameLength !== entry.nameBytes.byteLength
      || dataStart > nextOffset
      || !bytes.subarray(localNameStart, localExtraStart).equals(entry.nameBytes)
    ) fail(label, "local and central member identity differ");
    parseExtraFields(bytes, localExtraStart, localExtraLength, bounds, label);
    const dataEnd = dataStart + entry.compressedSize;
    const descriptor = (entry.flags & 0x0008) !== 0;
    if (descriptor) {
      if (
        localChecksum !== 0
        || localCompressedSize !== 0
        || localUncompressedSize !== 0
        || dataEnd + 16 !== nextOffset
        || uint32(bytes, dataEnd, label) !== dataDescriptorSignature
        || uint32(bytes, dataEnd + 4, label) !== entry.checksum
        || uint32(bytes, dataEnd + 8, label) !== entry.compressedSize
        || uint32(bytes, dataEnd + 12, label) !== entry.uncompressedSize
      ) fail(label, "signed data descriptor does not exactly match the central record");
    } else if (
      localChecksum !== entry.checksum
      || localCompressedSize !== entry.compressedSize
      || localUncompressedSize !== entry.uncompressedSize
      || dataEnd !== nextOffset
    ) fail(label, "local member size or CRC does not exactly match the central record");
    entry.dataEnd = dataEnd;
    entry.dataStart = dataStart;
  }
  return { bytes, entries };
};

const extractStrictFlatZip = (arguments_) => {
  const { bytes, entries } = inspectStrictFlatZip(arguments_);
  const output = new Map();
  for (const entry of entries) {
    const compressed = bytes.subarray(entry.dataStart, entry.dataEnd);
    let payload;
    try {
      if (entry.method === 0) {
        payload = Buffer.from(compressed);
      } else {
        const inflated = inflateRaw(compressed, {
          info: true,
          maxOutputLength: entry.uncompressedSize,
        });
        if (inflated.engine.bytesWritten !== compressed.byteLength) {
          fail(arguments_.label ?? "artifact", `member ${entry.name} has trailing compressed bytes`);
        }
        payload = inflated.buffer;
      }
    } catch {
      fail(arguments_.label ?? "artifact", `member ${entry.name} could not be inflated within its bound`);
    }
    if (payload.byteLength !== entry.uncompressedSize || crc32(payload) !== entry.checksum) {
      fail(arguments_.label ?? "artifact", `member ${entry.name} size or CRC is invalid`);
    }
    output.set(entry.name, payload);
  }
  return output;
};

return { extractStrictFlatZip, inspectStrictFlatZip };
}

export const { extractStrictFlatZip, inspectStrictFlatZip } = createStrictFlatZipProtocol(inflateRawSync);
