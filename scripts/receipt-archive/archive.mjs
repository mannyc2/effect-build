import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

export const archiveRef = "refs/heads/evidence/receipts-v1";
const archiveRefApiName = "heads/evidence/receipts-v1";
const sourceRepository = "mannyc2/effect-build";
const certificationFileName = "certification-receipt.json";
const releaseFileName = "release-terminal-receipt.json";
const maximumArchiveBytes = 1_048_576;
const maximumMemberBytes = 524_288;
const maximumEntries = 4;
const maximumJsonDepth = 32;
const maximumJsonNodes = 4096;
const releasePackageNames = Object.freeze([
  "effect-build",
  "effect-build-apple",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
]);
const certificationPackageNames = Object.freeze([...releasePackageNames, "effect-build-rolldown"]);
const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class ArchiveConflict extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ArchiveConflict";
  }
}

export class ArchiveUpdateUnknown extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ArchiveUpdateUnknown";
  }
}

export class GitHubHttpError extends Error {
  constructor(method, path, status) {
    super(`GitHub REST ${method} ${path} returned ${status}`);
    this.name = "GitHubHttpError";
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const githubDigest = (bytes) => `sha256:${sha256(bytes)}`;

const exactFields = (value, fields, subject) => {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be an object`);
  }
  const actual = Object.keys(value).sort(compareUtf16);
  const expected = [...fields].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${subject} field mismatch: ${actual.join(",")}`);
  }
  return value;
};

const boundedText = (value, field, maximum = 256) => {
  if (
    typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${field} must be bounded non-control text`);
  }
  return value;
};

const exactLiteral = (value, allowed, field) => {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${field} is not admitted`);
  return value;
};

const positiveDecimal = (value, field) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${field} must be a positive decimal string`);
  }
  return value;
};

const safeDecimal = (value, field) => {
  positiveDecimal(value, field);
  if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds lossless GitHub JSON range`);
  return value;
};

const apiId = (value, field) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} is not a lossless positive API ID`);
  return String(value);
};

const lowercaseHex = (value, length, field) => {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) {
    throw new Error(`${field} must be lowercase ${length}-hex`);
  }
  return value;
};

const exactGithubDigest = (value, field) => {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${field} must be a GitHub SHA-256 digest`);
  }
  return value;
};

const semver = (value, field) => {
  if (
    typeof value !== "string"
    || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      value,
    )
  ) throw new Error(`${field} must be canonical SemVer without build metadata`);
  return value;
};

const hasLoneSurrogate = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
};

const validateJsonTree = (root) => {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > maximumJsonNodes) throw new Error("canonical JSON exceeds node bound");
    if (depth > maximumJsonDepth) throw new Error("canonical JSON exceeds depth bound");
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (Buffer.byteLength(value, "utf8") > maximumMemberBytes || hasLoneSurrogate(value)) {
        throw new Error("canonical JSON string exceeds bound or contains a lone surrogate");
      }
      continue;
    }
    if (typeof value === "number") throw new Error("canonical JSON forbids numbers");
    if (Array.isArray(value)) {
      if (value.length > maximumJsonNodes) throw new Error("canonical JSON array exceeds bound");
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], depth: depth + 1 });
      continue;
    }
    if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error("canonical JSON requires plain objects");
    }
    for (const [key, child] of Object.entries(value)) {
      if (/[\u0000-\u001f\u007f]/u.test(key) || hasLoneSurrogate(key)) {
        throw new Error("canonical JSON object key contains control text or a lone surrogate");
      }
      stack.push({ value: child, depth: depth + 1 });
    }
  }
};

const canonicalValue = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  return `{${Object.keys(value).sort(compareUtf16).map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
};

export const canonicalBytes = (value) => {
  validateJsonTree(value);
  return Buffer.from(`${canonicalValue(value)}\n`, "utf8");
};

export const decodeCanonical = (input) => {
  const bytes = Buffer.from(input);
  if (bytes.length === 0 || bytes.length > maximumMemberBytes || bytes.at(-1) !== 0x0a || bytes.subarray(0, -1).includes(0x0a)) {
    throw new Error("receipt JSON must be bounded with exactly one final LF");
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, -1));
  } catch (cause) {
    throw new Error("receipt JSON is not valid UTF-8", { cause });
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    throw new Error("receipt JSON is malformed", { cause });
  }
  validateJsonTree(value);
  if (!bytes.equals(canonicalBytes(value))) throw new Error("receipt JSON is not canonically encoded");
  return value;
};

const u16 = (bytes, offset, subject) => {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error(`${subject} is outside ZIP bounds`);
  return bytes.readUInt16LE(offset);
};
const u32 = (bytes, offset, subject) => {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error(`${subject} is outside ZIP bounds`);
  return bytes.readUInt32LE(offset);
};

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const decodeZipName = (bytes) => {
  let name;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error("ZIP member name is not valid UTF-8", { cause });
  }
  if (!Buffer.from(name, "utf8").equals(bytes)) throw new Error("ZIP member name is not canonical UTF-8");
  return name;
};

const safeMemberName = (name) => {
  if (
    name.length === 0 || name.length > 128 || name.startsWith("/") || /^[A-Za-z]:/u.test(name)
    || name.includes("/") || name.includes("\\") || name === "." || name === ".."
    || /[\u0000-\u001f\u007f]/u.test(name)
  ) throw new Error(`unsafe ZIP member name ${name}`);
};

/** Reads one hostile GitHub artifact ZIP without extracting it to the filesystem. */
export const readReceiptZip = (input, expectedName) => {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > maximumArchiveBytes) throw new Error("ZIP wrapper exceeds archive bound");
  const eocd = bytes.length - 22;
  if (u32(bytes, eocd, "ZIP end record") !== 0x06054b50) throw new Error("ZIP end record is missing or commented");
  if (
    u16(bytes, eocd + 4, "ZIP disk") !== 0 || u16(bytes, eocd + 6, "ZIP directory disk") !== 0
    || u16(bytes, eocd + 20, "ZIP comment") !== 0
  ) throw new Error("multi-disk, ZIP64, and commented ZIP wrappers are forbidden");
  const entries = u16(bytes, eocd + 10, "ZIP entry count");
  if (entries !== u16(bytes, eocd + 8, "ZIP disk entry count") || entries === 0 || entries > maximumEntries) {
    throw new Error("ZIP entry count exceeds bound");
  }
  const directoryBytes = u32(bytes, eocd + 12, "ZIP directory size");
  const directoryOffset = u32(bytes, eocd + 16, "ZIP directory offset");
  if (directoryOffset + directoryBytes !== eocd) throw new Error("ZIP central directory bounds are invalid");
  const members = new Map();
  const dataRanges = [];
  let totalUncompressed = 0;
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (u32(bytes, cursor, "ZIP central entry") !== 0x02014b50) throw new Error("ZIP central entry is missing");
    const flags = u16(bytes, cursor + 8, "ZIP flags");
    const method = u16(bytes, cursor + 10, "ZIP method");
    const expectedCrc = u32(bytes, cursor + 16, "ZIP CRC");
    const compressedSize = u32(bytes, cursor + 20, "ZIP compressed size");
    const uncompressedSize = u32(bytes, cursor + 24, "ZIP uncompressed size");
    const nameLength = u16(bytes, cursor + 28, "ZIP name length");
    const extraLength = u16(bytes, cursor + 30, "ZIP extra length");
    const commentLength = u16(bytes, cursor + 32, "ZIP member comment length");
    const diskStart = u16(bytes, cursor + 34, "ZIP member disk");
    const externalAttributes = u32(bytes, cursor + 38, "ZIP external attributes");
    const localOffset = u32(bytes, cursor + 42, "ZIP local offset");
    if ((flags & 0x01) !== 0 || (flags & ~0x0800) !== 0) throw new Error("encrypted or extended ZIP flags are forbidden");
    if (method !== 0 && method !== 8) throw new Error(`unsupported ZIP compression method ${method}`);
    if (extraLength !== 0 || commentLength !== 0 || diskStart !== 0) {
      throw new Error("ZIP extra fields, hardlink metadata, comments, and split members are forbidden");
    }
    if (nameLength === 0 || cursor + 46 + nameLength > eocd) throw new Error("ZIP central name exceeds bounds");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeZipName(nameBytes);
    safeMemberName(name);
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0o170000;
    if (fileType !== 0 && fileType !== 0o100000) throw new Error(`ZIP member ${name} is not one regular file`);
    if (unixMode !== 0 && unixMode !== 0o100644) throw new Error(`ZIP member ${name} has noncanonical or executable mode`);
    if (members.has(name)) throw new Error(`duplicate ZIP member ${name}`);
    if (uncompressedSize > maximumMemberBytes) throw new Error(`ZIP member ${name} exceeds member bound`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maximumMemberBytes) throw new Error("ZIP members exceed total uncompressed bound");
    if (u32(bytes, localOffset, "ZIP local entry") !== 0x04034b50) throw new Error(`ZIP local entry is missing for ${name}`);
    const localFlags = u16(bytes, localOffset + 6, "ZIP local flags");
    const localMethod = u16(bytes, localOffset + 8, "ZIP local method");
    const localCrc = u32(bytes, localOffset + 14, "ZIP local CRC");
    const localCompressedSize = u32(bytes, localOffset + 18, "ZIP local compressed size");
    const localUncompressedSize = u32(bytes, localOffset + 22, "ZIP local uncompressed size");
    const localNameLength = u16(bytes, localOffset + 26, "ZIP local name length");
    const localExtraLength = u16(bytes, localOffset + 28, "ZIP local extra length");
    if (
      localFlags !== flags || localMethod !== method || localCrc !== expectedCrc
      || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize
      || localExtraLength !== 0 || localNameLength !== nameLength
    ) throw new Error(`ZIP local/central metadata mismatch for ${name}`);
    const localNameStart = localOffset + 30;
    const localName = bytes.subarray(localNameStart, localNameStart + localNameLength);
    if (!localName.equals(nameBytes)) throw new Error(`ZIP local/central name mismatch for ${name}`);
    const dataStart = localNameStart + localNameLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > directoryOffset) throw new Error(`ZIP member data exceeds bounds for ${name}`);
    if (dataRanges.some(([start, end]) => localOffset < end && dataEnd > start)) {
      throw new Error(`ZIP member data overlaps for ${name}`);
    }
    dataRanges.push([localOffset, dataEnd]);
    if (compressedSize > 0 && uncompressedSize > 8192 && uncompressedSize > compressedSize * 200) {
      throw new Error(`ZIP member ${name} exceeds compression-ratio bound`);
    }
    const compressed = bytes.subarray(dataStart, dataEnd);
    let contents;
    try {
      contents = method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: maximumMemberBytes });
    } catch (cause) {
      throw new Error(`ZIP decompression failed for ${name}`, { cause });
    }
    if (contents.length !== uncompressedSize) throw new Error(`ZIP length mismatch for ${name}`);
    if (crc32(contents) !== expectedCrc) throw new Error(`ZIP CRC mismatch for ${name}`);
    members.set(name, contents);
    cursor += 46 + nameLength;
  }
  dataRanges.sort((left, right) => left[0] - right[0]);
  let localCursor = 0;
  for (const [start, end] of dataRanges) {
    if (start !== localCursor) throw new Error("ZIP has prepended, hidden, or gapped local records");
    localCursor = end;
  }
  if (localCursor !== directoryOffset) throw new Error("ZIP has hidden bytes before its central directory");
  if (cursor !== eocd || members.size !== 1 || !members.has(expectedName)) {
    throw new Error(`unexpected ZIP members: ${[...members.keys()].sort(compareUtf16).join(",")}`);
  }
  return members.get(expectedName);
};

const conclusionValues = Object.freeze([
  "success",
  "failure",
  "cancelled",
  "timed_out",
  "skipped",
  "neutral",
  "stale",
  "action_required",
  "startup_failure",
  "unknown",
]);

const validateSortedRecords = (value, subject, key, validate, { nonEmpty = true } = {}) => {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) throw new Error(`${subject} must be a non-empty array`);
  let previous;
  return value.map((record, index) => {
    const validated = validate(record, `${subject}[${index}]`);
    const identity = validated[key];
    if (previous !== undefined && compareUtf16(previous, identity) >= 0) {
      throw new Error(`${subject} must be uniquely sorted by ${key}`);
    }
    previous = identity;
    return validated;
  });
};

const validateConclusion = (record, subject, expectedOnly = false) => {
  exactFields(record, ["name", "conclusion"], subject);
  boundedText(record.name, `${subject}.name`);
  exactLiteral(record.conclusion, expectedOnly ? ["success"] : conclusionValues, `${subject}.conclusion`);
  return record;
};

const validateConclusionPair = (receipt, requireSuccess) => {
  const expected = validateSortedRecords(
    receipt.expectedConclusions,
    "expectedConclusions",
    "name",
    (record, subject) => validateConclusion(record, subject, true),
  );
  const actual = validateSortedRecords(
    receipt.actualConclusions,
    "actualConclusions",
    "name",
    (record, subject) => validateConclusion(record, subject),
  );
  if (JSON.stringify(expected.map(({ name }) => name)) !== JSON.stringify(actual.map(({ name }) => name))) {
    throw new Error("expected and actual conclusion names differ");
  }
  if (requireSuccess && actual.some(({ conclusion }) => conclusion !== "success")) {
    throw new Error("successful terminal status requires every actual conclusion to succeed");
  }
};

const validateAssertions = (records, requirePass) => {
  const assertions = validateSortedRecords(records, "assertions", "name", (record, subject) => {
    exactFields(record, ["name", "outcome"], subject);
    boundedText(record.name, `${subject}.name`);
    exactLiteral(record.outcome, ["pass", "fail", "unknown"], `${subject}.outcome`);
    return record;
  });
  if (requirePass && assertions.some(({ outcome }) => outcome !== "pass")) {
    throw new Error("successful terminal status requires every assertion to pass");
  }
};

const validateCandidates = (records, receiptClass) => {
  const candidates = validateSortedRecords(
    records,
    "candidateIdentities",
    "package",
    (record, subject) => {
      exactFields(record, ["package", "bytes", "sha256"], subject);
      boundedText(record.package, `${subject}.package`);
      positiveDecimal(record.bytes, `${subject}.bytes`);
      exactGithubDigest(record.sha256, `${subject}.sha256`);
      return record;
    },
    { nonEmpty: true },
  );
  const names = candidates.map((record) => record.package);
  if (receiptClass === "release" && JSON.stringify(names) !== JSON.stringify(releasePackageNames)) {
    throw new Error("release candidate identities must name the admitted six-package train");
  }
  if (
    receiptClass === "certification"
    && JSON.stringify(names) !== JSON.stringify(releasePackageNames)
    && JSON.stringify(names) !== JSON.stringify(certificationPackageNames)
  ) {
    throw new Error("certification candidate identities must name the admitted train with optional Rolldown");
  }
  return candidates;
};

const validateInnerReceipts = (records, sourceSha) => {
  validateSortedRecords(records, "innerReceipts", "name", (record, subject) => {
    exactFields(record, ["name", "sourceSha", "sha256"], subject);
    boundedText(record.name, `${subject}.name`);
    lowercaseHex(record.sourceSha, 40, `${subject}.sourceSha`);
    exactGithubDigest(record.sha256, `${subject}.sha256`);
    if (record.sourceSha !== sourceSha) throw new Error(`${subject} names a different source SHA`);
    return record;
  });
};

const authorityFields = Object.freeze([
  "sourceRepository",
  "sourceSha",
  "workflowId",
  "workflowPath",
  "workflowRunId",
  "workflowRunAttempt",
  "workflowRunHeadSha",
  "workflowEvent",
  "workflowRef",
]);

const validateReceiptAuthority = (receipt) => {
  if (receipt.sourceRepository !== sourceRepository) throw new Error("receipt source repository is not allowlisted");
  lowercaseHex(receipt.sourceSha, 40, "sourceSha");
  positiveDecimal(receipt.workflowId, "workflowId");
  boundedText(receipt.workflowPath, "workflowPath");
  positiveDecimal(receipt.workflowRunId, "workflowRunId");
  positiveDecimal(receipt.workflowRunAttempt, "workflowRunAttempt");
  lowercaseHex(receipt.workflowRunHeadSha, 40, "workflowRunHeadSha");
  boundedText(receipt.workflowEvent, "workflowEvent");
  boundedText(receipt.workflowRef, "workflowRef");
  if (receipt.workflowRunHeadSha !== receipt.sourceSha) throw new Error("receipt source and run head SHA diverge");
};

const certificationFields = Object.freeze([
  "schema",
  "receiptClass",
  ...authorityFields,
  "terminalStatus",
  "expectedConclusions",
  "actualConclusions",
  "hostObservations",
  "providerObservations",
  "candidateIdentities",
  "assertions",
  "innerReceipts",
]);

const releaseFields = Object.freeze([
  "schema",
  "receiptClass",
  ...authorityFields,
  "version",
  "terminalStatus",
  "candidateReceiptDigest",
  "expectedConclusions",
  "actualConclusions",
  "assertions",
  "candidateIdentities",
  "externalSubjects",
  "innerReceipts",
]);

const validateCertification = (receipt) => {
  exactFields(receipt, certificationFields, "certification receipt");
  if (
    receipt.schema !== "effect-build/certification-receipt@1" || receipt.receiptClass !== "certification"
    || receipt.terminalStatus !== "certified"
  ) throw new Error("certification receipt protocol or terminal status mismatch");
  validateReceiptAuthority(receipt);
  validateConclusionPair(receipt, true);
  validateSortedRecords(receipt.hostObservations, "hostObservations", "coordinate", (record, subject) => {
    exactFields(record, ["coordinate", "host", "conclusion"], subject);
    boundedText(record.coordinate, `${subject}.coordinate`);
    boundedText(record.host, `${subject}.host`);
    if (record.conclusion !== "success") throw new Error(`${subject}.conclusion must be success`);
    return record;
  });
  validateSortedRecords(receipt.providerObservations, "providerObservations", "coordinate", (record, subject) => {
    exactFields(record, ["coordinate", "provider", "version", "conclusion"], subject);
    boundedText(record.coordinate, `${subject}.coordinate`);
    boundedText(record.provider, `${subject}.provider`);
    boundedText(record.version, `${subject}.version`);
    if (record.conclusion !== "success") throw new Error(`${subject}.conclusion must be success`);
    return record;
  });
  validateCandidates(receipt.candidateIdentities, "certification");
  validateAssertions(receipt.assertions, true);
  validateInnerReceipts(receipt.innerReceipts, receipt.sourceSha);
  return receipt;
};

const expectedReleaseSubjects = (version, sourceSha, candidates) => {
  const candidateByPackage = new Map(candidates.map((record) => [record.package, record.sha256]));
  return [
    { kind: "github-release", name: `v${version}`, expectedIdentity: sourceSha },
    { kind: "tag", name: `v${version}`, expectedIdentity: sourceSha },
    ...releasePackageNames.map((name) => ({
      kind: "candidate-byte",
      name: `${name}@${version}`,
      expectedIdentity: candidateByPackage.get(name),
    })),
    ...releasePackageNames.map((name) => ({
      kind: "registry-package",
      name: `${name}@${version}`,
      expectedIdentity: candidateByPackage.get(name),
    })),
  ].sort((left, right) => compareUtf16(`${left.kind}:${left.name}`, `${right.kind}:${right.name}`));
};

const validateExternalIdentity = (kind, value, field) =>
  kind === "tag" || kind === "github-release"
    ? lowercaseHex(value, 40, field)
    : exactGithubDigest(value, field);

const validateRelease = (receipt) => {
  exactFields(receipt, releaseFields, "release terminal receipt");
  if (receipt.receiptClass !== "release") {
    throw new Error("release terminal receipt protocol mismatch");
  }
  validateReceiptAuthority(receipt);
  const version = semver(receipt.version, "version");
  exactGithubDigest(receipt.candidateReceiptDigest, "candidateReceiptDigest");
  const status = exactLiteral(receipt.terminalStatus, ["success", "partial", "failed", "unknown"], "terminalStatus");
  const success = status === "success";
  const expectedSchema = success
    ? "effect-build/release-activation-receipt@1"
    : "effect-build/release-attempt-receipt@1";
  if (receipt.schema !== expectedSchema) throw new Error("release success and non-success require distinct schemas");
  validateConclusionPair(receipt, success);
  validateAssertions(receipt.assertions, success);
  const candidates = validateCandidates(receipt.candidateIdentities, "release");
  const expected = expectedReleaseSubjects(version, receipt.sourceSha, candidates);
  const subjects = validateSortedRecords(receipt.externalSubjects, "externalSubjects", "identity", (record, subject) => {
    exactFields(record, ["identity", "kind", "name", "state", "expectedIdentity", "observedIdentity"], subject);
    boundedText(record.identity, `${subject}.identity`);
    exactLiteral(record.kind, ["tag", "github-release", "registry-package", "candidate-byte"], `${subject}.kind`);
    boundedText(record.name, `${subject}.name`);
    exactLiteral(record.state, ["absent", "matching", "mismatching", "unknown"], `${subject}.state`);
    validateExternalIdentity(record.kind, record.expectedIdentity, `${subject}.expectedIdentity`);
    boundedText(record.observedIdentity, `${subject}.observedIdentity`);
    if (record.identity !== `${record.kind}:${record.name}`) throw new Error(`${subject}.identity is not canonical`);
    if (record.state === "matching" && record.observedIdentity !== record.expectedIdentity) {
      throw new Error(`${subject} matching identity diverges`);
    }
    if (record.state === "mismatching" && record.observedIdentity === record.expectedIdentity) {
      throw new Error(`${subject} mismatching identity is equivalent`);
    }
    if (record.state === "mismatching") {
      validateExternalIdentity(record.kind, record.observedIdentity, `${subject}.observedIdentity`);
    }
    if (record.state === "absent" && record.observedIdentity !== "absent") throw new Error(`${subject} absent state diverges`);
    if (record.state === "unknown" && record.observedIdentity !== "unknown") throw new Error(`${subject} unknown state diverges`);
    return record;
  });
  if (
    JSON.stringify(subjects.map(({ kind, name, expectedIdentity }) => ({ kind, name, expectedIdentity })))
      !== JSON.stringify(expected)
  ) throw new Error("release terminal receipt omits or changes an external subject");
  if (success && subjects.some(({ state }) => state !== "matching")) {
    throw new Error("successful release requires every external subject to match");
  }
  validateInnerReceipts(receipt.innerReceipts, receipt.sourceSha);
  return receipt;
};

export const validateReceipt = (bytes, receiptClass) => {
  const receipt = decodeCanonical(bytes);
  return receiptClass === "certification"
    ? validateCertification(receipt)
    : receiptClass === "release"
    ? validateRelease(receipt)
    : (() => {
      throw new Error("receiptClass is not admitted");
    })();
};

const producerShapes = Object.freeze({
  certification: Object.freeze({
    paths: [".github/workflows/ci.yml", ".github/workflows/apple-certification.yml"],
    event: "workflow_dispatch",
    ref: "refs/heads/main",
  }),
  release: Object.freeze({
    paths: [".github/workflows/release.yml"],
    event: "workflow_dispatch",
    ref: "refs/heads/main",
  }),
});

const validateRequest = (request) => {
  exactFields(request, ["receiptClass", "producerRunId", "producerRunAttempt", "artifactId", "artifactDigest", "sourceSha"], "archive request");
  exactLiteral(request.receiptClass, ["certification", "release"], "receiptClass");
  safeDecimal(request.producerRunId, "producerRunId");
  safeDecimal(request.producerRunAttempt, "producerRunAttempt");
  safeDecimal(request.artifactId, "artifactId");
  exactGithubDigest(request.artifactDigest, "artifactDigest");
  lowercaseHex(request.sourceSha, 40, "sourceSha");
  return request;
};

const validatePolicy = (policy, receiptClass) => {
  exactFields(
    policy,
    [
      "repository",
      "repositoryId",
      "producerClass",
      "workflowId",
      "workflowPath",
      "workflowBlobSha",
      "event",
      "ref",
      "actorId",
      "triggeringActorId",
      "artifactNamePrefix",
      "expectedConclusionsSha256",
      "expectedInnerReceiptNamesSha256",
      "environmentId",
      "rulesetId",
      "reviewerId",
    ],
    "archive policy",
  );
  if (policy.repository !== sourceRepository) throw new Error("archive repository is not allowlisted");
  if (policy.producerClass !== receiptClass) throw new Error("protected producer class does not match request");
  safeDecimal(policy.repositoryId, "policy.repositoryId");
  safeDecimal(policy.workflowId, "policy.workflowId");
  safeDecimal(policy.actorId, "policy.actorId");
  safeDecimal(policy.triggeringActorId, "policy.triggeringActorId");
  lowercaseHex(policy.workflowBlobSha, 40, "policy.workflowBlobSha");
  boundedText(policy.artifactNamePrefix, "policy.artifactNamePrefix");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(policy.artifactNamePrefix)) {
    throw new Error("policy.artifactNamePrefix is not one safe fixed prefix");
  }
  exactGithubDigest(policy.expectedConclusionsSha256, "policy.expectedConclusionsSha256");
  exactGithubDigest(policy.expectedInnerReceiptNamesSha256, "policy.expectedInnerReceiptNamesSha256");
  safeDecimal(policy.environmentId, "policy.environmentId");
  safeDecimal(policy.rulesetId, "policy.rulesetId");
  safeDecimal(policy.reviewerId, "policy.reviewerId");
  const shape = producerShapes[receiptClass];
  if (!shape.paths.includes(policy.workflowPath) || policy.event !== shape.event || policy.ref !== shape.ref) {
    throw new Error("protected producer policy is outside the hardcoded allowlist");
  }
  return policy;
};

const refBranch = (ref) => ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;

const archivePath = (receipt, runId, runAttempt) => receipt.receiptClass === "certification"
  ? `receipts/v1/certifications/${receipt.sourceSha}/${runId}-${runAttempt}.json`
  : `receipts/v1/releases/${receipt.version}/${runId}-${runAttempt}.json`;

const archivedSchema = (receipt) => receipt.receiptClass === "certification"
  ? "effect-build/archived-certification-receipt@1"
  : receipt.terminalStatus === "success"
  ? "effect-build/archived-release-activation-receipt@1"
  : "effect-build/archived-release-attempt-receipt@1";

export const authenticateReceipt = async ({ client, request: rawRequest, policy: rawPolicy, now = new Date() }) => {
  const request = validateRequest(rawRequest);
  const policy = validatePolicy(rawPolicy, request.receiptClass);
  const [run, artifact] = await Promise.all([
    client.getRun(policy.repository, request.producerRunId, request.producerRunAttempt),
    client.getArtifact(policy.repository, request.artifactId),
  ]);
  if (
    apiId(run.id, "run.id") !== request.producerRunId
    || apiId(run.run_attempt, "run.run_attempt") !== request.producerRunAttempt
    || apiId(run.workflow_id, "run.workflow_id") !== policy.workflowId || run.path !== policy.workflowPath
    || run.event !== policy.event || apiId(run.repository?.id, "run.repository.id") !== policy.repositoryId
    || run.repository?.full_name !== policy.repository
    || apiId(run.head_repository?.id, "run.head_repository.id") !== policy.repositoryId
    || run.head_repository?.full_name !== policy.repository
    || apiId(run.actor?.id, "run.actor.id") !== policy.actorId
    || apiId(run.triggering_actor?.id, "run.triggering_actor.id") !== policy.triggeringActorId
    || run.head_sha !== request.sourceSha || run.head_branch !== refBranch(policy.ref)
    || run.status !== "completed" || run.conclusion === null || run.conclusion === undefined
  ) throw new Error("producer workflow run authority mismatch");
  const runConclusion = exactLiteral(
    run.conclusion,
    conclusionValues.filter((value) => value !== "unknown"),
    "producer workflow conclusion",
  );
  if (run.referenced_workflows !== undefined && (!Array.isArray(run.referenced_workflows) || run.referenced_workflows.length !== 0)) {
    throw new Error("producer uses a reusable workflow revision outside the no-reusable-workflow profile");
  }
  if (request.receiptClass === "certification" && runConclusion !== "success") {
    throw new Error("certification producer did not conclude successfully");
  }
  const workflowFile = await client.getFileMetadata(policy.repository, policy.workflowPath, request.sourceSha);
  if (
    workflowFile === null || workflowFile.type !== "file" || workflowFile.path !== policy.workflowPath
    || workflowFile.sha !== policy.workflowBlobSha
  ) throw new Error("producer workflow revision is not approved");
  const expectedArtifactName = `${policy.artifactNamePrefix}-run-${request.producerRunId}-attempt-${request.producerRunAttempt}`;
  const artifactBytes = apiId(artifact.size_in_bytes, "artifact.size_in_bytes");
  const expiry = new Date(artifact.expires_at).getTime();
  if (
    apiId(artifact.id, "artifact.id") !== request.artifactId || artifact.name !== expectedArtifactName
    || artifact.digest !== request.artifactDigest || artifact.expired !== false
    || apiId(artifact.workflow_run?.id, "artifact.workflow_run.id") !== request.producerRunId
    || apiId(artifact.workflow_run?.repository_id, "artifact.workflow_run.repository_id") !== policy.repositoryId
    || apiId(artifact.workflow_run?.head_repository_id, "artifact.workflow_run.head_repository_id") !== policy.repositoryId
    || artifact.workflow_run?.head_branch !== refBranch(policy.ref)
    || artifact.workflow_run?.head_sha !== request.sourceSha
    || !Number.isFinite(expiry) || expiry <= now.getTime()
  ) throw new Error("producer artifact authority mismatch");
  const wrapperBytes = await client.downloadArtifact(artifact, maximumArchiveBytes);
  if (String(wrapperBytes.length) !== artifactBytes) throw new Error("artifact wrapper byte count does not match GitHub metadata");
  if (githubDigest(wrapperBytes) !== artifact.digest) throw new Error("artifact wrapper digest does not match GitHub metadata");
  const expectedName = request.receiptClass === "certification" ? certificationFileName : releaseFileName;
  const receiptBytes = readReceiptZip(wrapperBytes, expectedName);
  const receipt = validateReceipt(receiptBytes, request.receiptClass);
  if (receipt.receiptClass === "release" && receipt.terminalStatus === "success" && runConclusion !== "success") {
    throw new Error("successful release receipt requires a successful producer conclusion");
  }
  if (
    receipt.sourceRepository !== policy.repository || receipt.sourceSha !== request.sourceSha
    || receipt.workflowId !== policy.workflowId || receipt.workflowPath !== policy.workflowPath
    || receipt.workflowRunId !== request.producerRunId || receipt.workflowRunAttempt !== request.producerRunAttempt
    || receipt.workflowRunHeadSha !== request.sourceSha || receipt.workflowEvent !== policy.event
    || receipt.workflowRef !== policy.ref
  ) throw new Error("receipt self-description does not match authenticated producer metadata");
  if (githubDigest(canonicalBytes(receipt.expectedConclusions)) !== policy.expectedConclusionsSha256) {
    throw new Error("receipt expected-conclusion manifest is not the protected manifest");
  }
  const innerNames = receipt.innerReceipts.map(({ name }) => name);
  if (githubDigest(canonicalBytes(innerNames)) !== policy.expectedInnerReceiptNamesSha256) {
    throw new Error("receipt inner-receipt denominator is not the protected manifest");
  }
  const producer = {
    repositoryId: policy.repositoryId,
    repository: policy.repository,
    headRepositoryId: policy.repositoryId,
    actorId: policy.actorId,
    triggeringActorId: policy.triggeringActorId,
    workflowId: policy.workflowId,
    workflowPath: policy.workflowPath,
    workflowFileBlobSha: policy.workflowBlobSha,
    workflowRunId: request.producerRunId,
    workflowRunAttempt: request.producerRunAttempt,
    workflowRunHeadSha: request.sourceSha,
    workflowEvent: policy.event,
    workflowRef: policy.ref,
    workflowConclusion: runConclusion,
    artifactId: request.artifactId,
    artifactName: artifact.name,
    artifactBytes,
    artifactDigest: artifact.digest,
    artifactExpiresAt: artifact.expires_at,
    artifactWrapperBytes: String(wrapperBytes.length),
    artifactWrapperSha256: githubDigest(wrapperBytes),
  };
  const archived = Object.freeze({
    schema: archivedSchema(receipt),
    receiptClass: request.receiptClass,
    sourceSha: request.sourceSha,
    producer,
    payloadBytes: String(receiptBytes.length),
    payloadSha256: githubDigest(receiptBytes),
    receipt,
  });
  const archivedBytes = canonicalBytes(archived);
  return Object.freeze({
    path: archivePath(receipt, request.producerRunId, request.producerRunAttempt),
    archived,
    archivedBytes,
  });
};

const validArchivePath = (path) =>
  /^receipts\/v1\/certifications\/[0-9a-f]{40}\/[1-9][0-9]*-[1-9][0-9]*\.json$/u.test(path)
  || /^receipts\/v1\/releases\/(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?\/[1-9][0-9]*-[1-9][0-9]*\.json$/u.test(
    path,
  );

const observeArchive = async (client, repository, path) => {
  const ref = await client.getRef(repository, archiveRefApiName);
  if (ref === null) return Object.freeze({ ref: null, bytes: null });
  lowercaseHex(ref.sha, 40, "evidence ref SHA");
  const bytes = await client.getContent(repository, path, ref.sha, maximumMemberBytes);
  return Object.freeze({ ref, bytes: bytes === null ? null : Buffer.from(bytes) });
};

const validEvidenceDirectory = (path) =>
  path === "receipts" || path === "receipts/v1" || path === "receipts/v1/certifications"
  || path === "receipts/v1/releases" || /^receipts\/v1\/certifications\/[0-9a-f]{40}$/u.test(path)
  || /^receipts\/v1\/releases\/(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u.test(
    path,
  );

const observeTreeBlobs = async (client, repository, treeSha) => {
  const tree = await client.getTree(repository, treeSha);
  if (tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 10_000) {
    throw new Error("evidence tree is truncated or exceeds its entry bound");
  }
  const blobs = new Map();
  for (const entry of tree.tree) {
    if (entry === null || typeof entry !== "object" || typeof entry.path !== "string") {
      throw new Error("evidence tree entry is malformed");
    }
    if (entry.type === "tree") {
      if (entry.mode !== "040000" || !validEvidenceDirectory(entry.path)) {
        throw new Error(`evidence tree directory is outside the receipt canon: ${entry.path}`);
      }
      continue;
    }
    if (
      entry.type !== "blob" || entry.mode !== "100644" || !validArchivePath(entry.path)
      || typeof entry.sha !== "string"
    ) throw new Error(`evidence tree entry is outside the receipt canon: ${entry.path}`);
    lowercaseHex(entry.sha, 40, `evidence blob ${entry.path}`);
    if (blobs.has(entry.path)) throw new Error(`duplicate evidence tree path ${entry.path}`);
    blobs.set(entry.path, entry.sha);
  }
  return blobs;
};

const assertSingleBlobAddition = (before, after, path, blobSha) => {
  if (before.has(path) || after.size !== before.size + 1 || after.get(path) !== blobSha) {
    throw new Error("candidate evidence tree is not one receipt addition");
  }
  for (const [existingPath, existingSha] of before) {
    if (after.get(existingPath) !== existingSha) throw new Error(`candidate evidence tree changed ${existingPath}`);
  }
};

const classifyObservation = (observation, bytes) => {
  if (observation.bytes === null) return "absent";
  return observation.bytes.equals(bytes) ? "identical" : "different";
};

const mutationConflict = (error) => error instanceof GitHubHttpError && (error.status === 409 || error.status === 422);

const inspectEvidenceBase = async (client, repository, observation, path) => {
  const baseSha = observation.ref?.sha;
  if (baseSha === undefined) return Object.freeze({ baseSha: undefined, baseTree: undefined, beforeBlobs: new Map() });
  const commit = await client.getCommit(repository, baseSha);
  const parents = commit?.parents;
  if (parents !== undefined && (!Array.isArray(parents) || parents.length > 1)) {
    throw new Error("evidence ref tip is not on a linear orphan history");
  }
  const baseTree = lowercaseHex(commit?.tree?.sha, 40, "base tree SHA");
  const beforeBlobs = await observeTreeBlobs(client, repository, baseTree);
  if (beforeBlobs.has(path)) throw new Error("evidence tree and exact path observation disagree");
  return Object.freeze({ baseSha, baseTree, beforeBlobs });
};

export const writeArchive = async ({ client, repository, path, bytes: input, maximumRaces = 4 }) => {
  if (repository !== sourceRepository) throw new Error("archive write repository is not allowlisted");
  if (!validArchivePath(path)) throw new Error("archive destination path is not canonical");
  const bytes = Buffer.from(input);
  if (bytes.length === 0 || bytes.length > maximumMemberBytes) throw new Error("archive record exceeds bound");
  let observation = await observeArchive(client, repository, path);
  let classification = classifyObservation(observation, bytes);
  if (classification === "identical") return Object.freeze({ _tag: "Idempotent", path, refSha: observation.ref.sha });
  if (classification === "different") throw new ArchiveConflict(`different bytes already exist at ${path}`);
  let refWasObserved = observation.ref !== null;
  let inspectedBase = await inspectEvidenceBase(client, repository, observation, path);
  const blob = await client.createBlob(repository, bytes);
  lowercaseHex(blob.sha, 40, "archive blob SHA");
  for (let race = 0; race <= maximumRaces; race += 1) {
    const { baseSha, baseTree, beforeBlobs } = inspectedBase;
    const tree = await client.createTree(repository, {
      ...(baseTree === undefined ? {} : { baseTree }),
      path,
      blobSha: blob.sha,
    });
    lowercaseHex(tree.sha, 40, "archive tree SHA");
    const afterBlobs = await observeTreeBlobs(client, repository, tree.sha);
    assertSingleBlobAddition(beforeBlobs, afterBlobs, path, blob.sha);
    const commit = await client.createCommit(repository, {
      message: `archive receipt ${path} ${githubDigest(bytes)}`,
      treeSha: tree.sha,
      parents: baseSha === undefined ? [] : [baseSha],
    });
    lowercaseHex(commit.sha, 40, "archive commit SHA");
    try {
      if (baseSha === undefined) await client.createRef(repository, archiveRef, commit.sha);
      else await client.updateRef(repository, archiveRefApiName, commit.sha, false);
      const confirmed = await observeArchive(client, repository, path);
      const confirmedClassification = classifyObservation(confirmed, bytes);
      if (confirmedClassification === "different") {
        throw new ArchiveConflict(`successful ref update exposed different bytes at ${path}`);
      }
      if (confirmedClassification !== "identical" || confirmed.ref === null) {
        throw new ArchiveUpdateUnknown("successful ref update was not observable at the exact path");
      }
      return Object.freeze({ _tag: "Created", path, refSha: confirmed.ref.sha });
    } catch (cause) {
      const reobserved = await observeArchive(client, repository, path);
      if (refWasObserved && reobserved.ref === null) {
        throw new ArchiveUpdateUnknown("the append-only evidence ref disappeared during archival", { cause });
      }
      classification = classifyObservation(reobserved, bytes);
      if (classification === "identical") {
        return Object.freeze({ _tag: "IdempotentAfterRace", path, refSha: reobserved.ref.sha });
      }
      if (classification === "different") throw new ArchiveConflict(`race wrote different bytes at ${path}`, { cause });
      const oldTip = observation.ref?.sha;
      const newTip = reobserved.ref?.sha;
      if (oldTip !== newTip) {
        observation = reobserved;
        refWasObserved ||= reobserved.ref !== null;
        inspectedBase = await inspectEvidenceBase(client, repository, observation, path);
        continue;
      }
      const reason = mutationConflict(cause) ? "non-force ref conflict remained after reobservation" : "ref update outcome remained unknown after reobservation";
      throw new ArchiveUpdateUnknown(reason, { cause });
    }
  }
  throw new ArchiveUpdateUnknown("evidence ref kept advancing beyond the bounded race limit");
};

export const archiveReceipt = async ({ client, request, policy, now }) => {
  const authenticated = await authenticateReceipt({ client, request, policy, now });
  const write = await writeArchive({
    client,
    repository: policy.repository,
    path: authenticated.path,
    bytes: authenticated.archivedBytes,
  });
  return Object.freeze({ ...write, archivedSha256: githubDigest(authenticated.archivedBytes) });
};

const repositoryPath = (repository) => repository.split("/").map(encodeURIComponent).join("/");
const contentPath = (path) => path.split("/").map(encodeURIComponent).join("/");

const readBoundedBody = async (response, maximum) => {
  if (response.body === null) throw new Error("GitHub response has no body");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > maximum)) {
    throw new Error("GitHub response exceeds declared byte bound");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("GitHub response exceeds byte bound");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
};

export class GitHubClient {
  constructor({ token, apiUrl = "https://api.github.com", fetchImplementation = fetch }) {
    if (typeof token !== "string" || token.length === 0) throw new Error("GitHub token is required");
    if (apiUrl !== "https://api.github.com") throw new Error("only the allowlisted GitHub API origin is admitted");
    this.token = token;
    this.apiUrl = apiUrl;
    this.fetch = fetchImplementation;
  }

  headers = () => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${this.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });

  async request(method, path, { body, maximum = 1_048_576, notFound = false } = {}) {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { ...this.headers(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (notFound && response.status === 404) return null;
    if (!response.ok) throw new GitHubHttpError(method, path, response.status);
    const bytes = await readBoundedBody(response, maximum);
    if (bytes.length === 0) return {};
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (cause) {
      throw new Error(`GitHub REST ${method} ${path} returned malformed JSON`, { cause });
    }
  }

  getRun = (repository, runId, runAttempt) =>
    this.request(
      "GET",
      `/repos/${repositoryPath(repository)}/actions/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(runAttempt)}`,
    );

  getArtifact = (repository, artifactId) =>
    this.request("GET", `/repos/${repositoryPath(repository)}/actions/artifacts/${encodeURIComponent(artifactId)}`);

  getFileMetadata = (repository, path, ref) =>
    this.request(
      "GET",
      `/repos/${repositoryPath(repository)}/contents/${contentPath(path)}?ref=${encodeURIComponent(ref)}`,
      { notFound: true },
    );

  async downloadArtifact(artifact, maximum) {
    const expected = `${this.apiUrl}/repos/${repositoryPath(sourceRepository)}/actions/artifacts/${artifact.id}/zip`;
    if (artifact.archive_download_url !== expected) throw new Error("artifact download URL is outside the allowlisted API route");
    const first = await this.fetch(expected, {
      headers: this.headers(),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (first.ok) return readBoundedBody(first, maximum);
    if (![301, 302, 303, 307, 308].includes(first.status)) {
      throw new GitHubHttpError("GET", new URL(expected).pathname, first.status);
    }
    const location = first.headers.get("location");
    if (location === null) throw new Error("artifact download redirect is missing");
    const target = new URL(location);
    if (target.protocol !== "https:" || target.username !== "" || target.password !== "") {
      throw new Error("artifact download redirect is unsafe");
    }
    const response = await this.fetch(target, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`artifact storage download returned ${response.status}`);
    return readBoundedBody(response, maximum);
  }

  async getRef(repository, ref) {
    const value = await this.request("GET", `/repos/${repositoryPath(repository)}/git/ref/${ref}`, { notFound: true });
    return value === null ? null : { sha: value.object?.sha };
  }

  async getContent(repository, path, ref, maximum) {
    const value = await this.request(
      "GET",
      `/repos/${repositoryPath(repository)}/contents/${contentPath(path)}?ref=${encodeURIComponent(ref)}`,
      { notFound: true, maximum: maximum * 2 },
    );
    if (value === null) return null;
    if (value.type !== "file" || value.path !== path || value.encoding !== "base64" || typeof value.content !== "string") {
      throw new Error("archive path is not one base64 file");
    }
    const encoded = value.content.replace(/\n/gu, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
      throw new Error("archive path content is not canonical base64");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > maximum || bytes.toString("base64") !== encoded) throw new Error("archive path content exceeds bound");
    return bytes;
  }

  createBlob = (repository, bytes) =>
    this.request("POST", `/repos/${repositoryPath(repository)}/git/blobs`, {
      body: { content: Buffer.from(bytes).toString("base64"), encoding: "base64" },
    });

  getCommit = (repository, sha) =>
    this.request("GET", `/repos/${repositoryPath(repository)}/git/commits/${encodeURIComponent(sha)}`);

  getTree = (repository, sha) =>
    this.request("GET", `/repos/${repositoryPath(repository)}/git/trees/${encodeURIComponent(sha)}?recursive=1`);

  createTree = (repository, { baseTree, path, blobSha }) =>
    this.request("POST", `/repos/${repositoryPath(repository)}/git/trees`, {
      body: {
        ...(baseTree === undefined ? {} : { base_tree: baseTree }),
        tree: [{ path, mode: "100644", type: "blob", sha: blobSha }],
      },
    });

  createCommit = (repository, { message, treeSha, parents }) =>
    this.request("POST", `/repos/${repositoryPath(repository)}/git/commits`, {
      body: { message, tree: treeSha, parents },
    });

  createRef = (repository, ref, sha) =>
    this.request("POST", `/repos/${repositoryPath(repository)}/git/refs`, { body: { ref, sha } });

  updateRef = (repository, ref, sha, force) =>
    this.request("PATCH", `/repos/${repositoryPath(repository)}/git/refs/${ref}`, { body: { sha, force } });
}

const requiredEnvironment = (environment, name) => {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`missing ${name}`);
  return value;
};

export const requestFromEnvironment = (environment = process.env) => ({
  receiptClass: requiredEnvironment(environment, "RECEIPT_CLASS"),
  producerRunId: requiredEnvironment(environment, "PRODUCER_RUN_ID"),
  producerRunAttempt: requiredEnvironment(environment, "PRODUCER_RUN_ATTEMPT"),
  artifactId: requiredEnvironment(environment, "RECEIPT_ARTIFACT_ID"),
  artifactDigest: requiredEnvironment(environment, "RECEIPT_ARTIFACT_DIGEST"),
  sourceSha: requiredEnvironment(environment, "CERTIFIED_SOURCE_SHA"),
});

export const policyFromEnvironment = (environment = process.env) => ({
  repository: requiredEnvironment(environment, "GITHUB_REPOSITORY"),
  repositoryId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_REPOSITORY_ID"),
  producerClass: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_CLASS"),
  workflowId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_WORKFLOW_ID"),
  workflowPath: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_WORKFLOW_PATH"),
  workflowBlobSha: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_WORKFLOW_BLOB_SHA"),
  event: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_EVENT"),
  ref: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_REF"),
  actorId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_ACTOR_ID"),
  triggeringActorId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_TRIGGERING_ACTOR_ID"),
  artifactNamePrefix: requiredEnvironment(environment, "RECEIPT_ARCHIVE_PRODUCER_ARTIFACT_NAME_PREFIX"),
  expectedConclusionsSha256: requiredEnvironment(environment, "RECEIPT_ARCHIVE_EXPECTED_CONCLUSIONS_SHA256"),
  expectedInnerReceiptNamesSha256: requiredEnvironment(
    environment,
    "RECEIPT_ARCHIVE_EXPECTED_INNER_RECEIPT_NAMES_SHA256",
  ),
  environmentId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_ENVIRONMENT_ID"),
  rulesetId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_RULESET_ID"),
  reviewerId: requiredEnvironment(environment, "RECEIPT_ARCHIVE_REVIEWER_ID"),
});

const main = async () => {
  if (
    requiredEnvironment(process.env, "GITHUB_EVENT_NAME") !== "workflow_dispatch"
    || requiredEnvironment(process.env, "GITHUB_REF") !== "refs/heads/main"
    || requiredEnvironment(process.env, "RECEIPT_ARCHIVE_PROTECTED_ENVIRONMENT") !== "receipt-archive"
  ) throw new Error("receipt archive requires the protected manual main workflow");
  const client = new GitHubClient({ token: requiredEnvironment(process.env, "GITHUB_TOKEN") });
  const result = await archiveReceipt({
    client,
    request: requestFromEnvironment(),
    policy: policyFromEnvironment(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
