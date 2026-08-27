import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  assertCertificationHost as assertD13CertificationHost,
  certificationHostDefinition,
  observedSystemTarget,
} from "../certification-host.mjs";

export const root = new URL("../../", import.meta.url);
/** Canonical product and private evidence-control authority. */
export const researchContract = JSON.parse(
  await readFile(new URL("../../tooling/research-complete-contract.json", import.meta.url), "utf8"),
);
export const evidenceControl = Object.freeze(researchContract.evidenceControl);
export const nodeProfile = evidenceControl.nodeMainExecutable;
export const capability = nodeProfile.targetFinalization.capability;
export const compatibility = evidenceControl;
export const appleCertification = Object.freeze(evidenceControl.appleCertification);

if (researchContract.schema !== "effect-build/research-complete-contract@1") {
  throw new Error("research-complete product scope is unavailable");
}
if (researchContract.releaseControl?.candidateSchema !== "effect-build/release-candidate@3") {
  throw new Error("research-complete release control is unavailable");
}
export const releaseControl = Object.freeze(researchContract.releaseControl);
export const releaseCandidateIdentity = Object.freeze({
  ...releaseControl.candidateIdentity,
  schema: releaseControl.candidateSchema,
});
export const releaseCandidatePackageRecordFields = Object.freeze(
  [...releaseControl.candidatePackageRecordFields],
);
export const releaseCandidatePublicNodeSeaEvidenceFields = Object.freeze(
  [...releaseControl.candidatePublicNodeSeaEvidenceFields],
);
const releasePackedPackages = compatibility.coordinateRules.packedConsumers.axes.package;
const conditionalPackedPackages = compatibility.coordinateRules.packedConditionalProviderCandidates.axes.package;
if (JSON.stringify([...releasePackedPackages].sort()) !== JSON.stringify([...researchContract.invariants.firstPartyPackages].sort())) {
  throw new Error("packed release-train axes differ from the admitted research-complete package train");
}
if (JSON.stringify(releasePackedPackages) !== JSON.stringify(researchContract.releaseControl.orderedPackages)) {
  throw new Error("packed release-train axes differ from current release-control order");
}
if (
  JSON.stringify([...conditionalPackedPackages].sort())
  !== JSON.stringify([...researchContract.invariants.conditionalPackageCandidates].sort())
) {
  throw new Error("packed conditional-package axes differ from research-complete candidates");
}
if (
  JSON.stringify(conditionalPackedPackages)
  !== JSON.stringify(researchContract.releaseControl.conditionalPackageCandidates)
) {
  throw new Error("packed conditional-package axes differ from current release control");
}
if (releasePackedPackages.includes("effect-build-rolldown")) {
  throw new Error("deferred Rolldown package entered the packed release-train matrix");
}
if (JSON.stringify(conditionalPackedPackages) !== JSON.stringify(["effect-build-rolldown"])) {
  throw new Error("Rolldown must remain the one separately accounted conditional packed-package candidate");
}
const researchCertificationHosts = researchContract.invariants.certificationHosts;
const evidenceCertificationHosts = compatibility.certificationHosts.map(({ id }) => id);
if (JSON.stringify(researchCertificationHosts) !== JSON.stringify(evidenceCertificationHosts)) {
  throw new Error("private evidence hosts do not cover the exact research-complete D13 host set");
}
const nodeRole = researchContract.supplemental.profiles.find(({ id }) => id === "PROFILE-NODE-SEALED-MAIN");
if (nodeRole === undefined) throw new Error("research-complete scope omits the portable Node role");
const nodeSeaLane = researchContract.targetPublicSurface.providerLanes.find(
  ({ package: packageName }) => packageName === "effect-build-node-sea",
);
if (
  nodeSeaLane === undefined
  || nodeSeaLane.lanes.length !== 1
  || nodeSeaLane.lanes[0]?.lane !== "Command"
) {
  throw new Error("public Node SEA authority must remain the one truthful Command lane");
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const digest = (bytes) => ({ algorithm: "sha256", value: sha256(bytes) });
export const nodeMainExpectedStdout = "effect-build-node-main-ok\n";
export const nodeMainExecutionExpectation = Object.freeze({
  executionExitCode: "0",
  stdoutSha256: sha256(Buffer.from(nodeMainExpectedStdout)),
  stderrSha256: sha256(Buffer.alloc(0)),
});
export const artifactDownloadTimeoutMs = 180_000;

export const nodeBuiltinInventoryProgram = [
  'const { builtinModules, isBuiltin } = require("node:module");',
  'const prefixOnlyCandidates = ["node:ffi", "node:sea", "node:sqlite", "node:test", "node:test/reporters"];',
  'const normalized = builtinModules.map((specifier) => specifier.startsWith("node:") ? specifier : `node:${specifier}`);',
  "const inventory = [...new Set([...normalized, ...prefixOnlyCandidates])].filter((specifier) => isBuiltin(specifier));",
  "process.stdout.write(JSON.stringify(inventory));",
].join("");

export const canonicalNodeBuiltinInventory = (value) => {
  if (!Array.isArray(value)) throw new Error("Node built-in inventory must be an array");
  const normalized = value.map((specifier) => {
    if (typeof specifier !== "string") {
      throw new Error(`invalid Node built-in specifier ${String(specifier)}`);
    }
    const bare = specifier.startsWith("node:") ? specifier.slice("node:".length) : specifier;
    if (!/^[a-z0-9_./-]+$/u.test(bare)) {
      throw new Error(`invalid Node built-in specifier ${specifier}`);
    }
    return `node:${bare}`;
  });
  return Object.freeze([...new Set(normalized)].sort((left, right) => left.localeCompare(right)));
};

export const admitsNodeBuiltins = (inventory, required) => {
  const available = new Set(inventory);
  return required.every((specifier) => available.has(specifier));
};

const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const canonicalValue = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "bigint" || value === undefined) {
    throw new Error("canonical control JSON forbids numbers, bigint, and undefined");
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("canonical control JSON requires plain objects");
  }
  return `{${Object.keys(value).sort(compareUtf16).map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
};

export const canonicalBytes = (value) => Buffer.from(`${canonicalValue(value)}\n`, "utf8");

export const decodeCanonical = (bytes, expectedFields) => {
  const source = Buffer.from(bytes);
  if (source.length === 0 || source.at(-1) !== 0x0a || source.subarray(0, -1).includes(0x0a)) {
    throw new Error("control record must have exactly one final LF");
  }
  const value = JSON.parse(source.subarray(0, -1).toString("utf8"));
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("control record must be an object");
  const actual = Object.keys(value).sort(compareUtf16);
  const expected = [...expectedFields].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`control record field mismatch: ${actual.join(",")}`);
  }
  if (!source.equals(canonicalBytes(value))) throw new Error("control record is not canonically encoded");
  return value;
};

export const positiveDecimal = (value, field) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) throw new Error(`${field} is not a positive decimal string`);
  return value;
};

export const hex = (value, length, field) => {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) {
    throw new Error(`${field} is not lowercase ${length}-hex`);
  }
  return value;
};

export const githubDigest = (value, field) => {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error(`${field} is not a GitHub SHA-256 digest`);
  return value;
};

export const githubActionArtifactDigest = (value, field) =>
  `sha256:${hex(value, 64, field)}`;

export const targetCell = (target) => {
  const cell = nodeProfile.intendedEvidenceCells.find((candidate) => candidate.target === target);
  if (cell === undefined) throw new Error(`unsupported Node target ${target}`);
  return cell;
};

export const targetHost = (target) => {
  const host = compatibility.targetExecutionHosts.find((candidate) => candidate.target === target);
  if (host === undefined) throw new Error(`missing target runner for ${target}`);
  return host;
};

export const certificationHost = certificationHostDefinition;
export const assertCertificationHost = assertD13CertificationHost;

/** Strict structural inspection shared by construction and target execution. */
export const inspectNativeExecutable = (input, target) => {
  const bytes = Buffer.from(input);
  if (target.startsWith("linux-")) {
    if (bytes.length < 20 || !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      throw new Error("executable is not ELF");
    }
    if (bytes[4] !== 2 || bytes[5] !== 1) throw new Error("executable is not 64-bit little-endian ELF");
    const machine = bytes.readUInt16LE(18);
    const architecture = machine === 62 ? "x64" : machine === 183 ? "aarch64" : undefined;
    if (architecture === undefined || !target.includes(architecture === "aarch64" ? "aarch64" : "x64")) {
      throw new Error(`ELF architecture mismatch: ${machine}`);
    }
    return Object.freeze({ nativeFormat: "elf", inspectedArchitecture: architecture });
  }
  if (target.startsWith("windows-")) {
    if (bytes.length < 64 || bytes.subarray(0, 2).toString("ascii") !== "MZ") {
      throw new Error("executable is not PE");
    }
    const pe = bytes.readUInt32LE(0x3c);
    if (pe > bytes.length - 6 || bytes.subarray(pe, pe + 4).toString("binary") !== "PE\0\0") {
      throw new Error("PE signature missing");
    }
    const machine = bytes.readUInt16LE(pe + 4);
    const architecture = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "aarch64" : undefined;
    if (architecture === undefined || !target.endsWith(architecture)) {
      throw new Error(`PE architecture mismatch: ${machine}`);
    }
    return Object.freeze({ nativeFormat: "pe", inspectedArchitecture: architecture });
  }
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf) {
    throw new Error("executable is not 64-bit little-endian Mach-O");
  }
  const cpu = bytes.readUInt32LE(4);
  const architecture = cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "aarch64" : undefined;
  if (architecture === undefined || !target.endsWith(architecture)) {
    throw new Error(`Mach-O architecture mismatch: ${cpu}`);
  }
  return Object.freeze({ nativeFormat: "mach-o", inspectedArchitecture: architecture });
};

export const distributionDescriptorFields = Object.freeze([
  "protocol",
  "nodeVersion",
  "target",
  "executable",
  "executableBytes",
  "executableSha256",
  "archiveName",
  "archiveSha256",
]);

export const decodeDistributionDescriptor = (bytes) => {
  const descriptor = decodeCanonical(bytes, distributionDescriptorFields);
  if (descriptor.protocol !== "effect-build/authenticated-node-distribution-executable@1") {
    throw new Error("authenticated Node distribution descriptor protocol mismatch");
  }
  if (descriptor.nodeVersion !== "26.7.0") throw new Error("authenticated Node version mismatch");
  positiveDecimal(descriptor.executableBytes, "executableBytes");
  hex(descriptor.executableSha256, 64, "executableSha256");
  hex(descriptor.archiveSha256, 64, "archiveSha256");
  if (!isAbsolute(descriptor.executable) || normalize(descriptor.executable) !== descriptor.executable) {
    throw new Error("authenticated Node executable path must be absolute and normalized");
  }
  const cell = targetCell(descriptor.target);
  if (descriptor.archiveName !== cell.distribution || descriptor.archiveSha256 !== cell.sha256) {
    throw new Error("authenticated Node distribution descriptor is outside the frozen target cell");
  }
  return Object.freeze(descriptor);
};

export const coordinate = ({ producerGroup, format, constructionHost, target }) => {
  const axes = compatibility.coordinateRules.nodeMainExecutable.axes;
  if (!axes.producerGroup.includes(producerGroup)) throw new Error(`unknown producer group ${producerGroup}`);
  if (!axes.mainFormat.includes(format)) throw new Error(`unknown main format ${format}`);
  if (!axes.constructionHost.includes(constructionHost)) throw new Error(`unknown construction host ${constructionHost}`);
  if (!axes.target.includes(target)) throw new Error(`unknown target ${target}`);
  return `node-main--${producerGroup}--${format}--from-${constructionHost}--to-${target}`;
};

export const nodeMainRule = Object.freeze(compatibility.coordinateRules.nodeMainExecutable);
const rejectedNodeTargets = new Set(nodeMainRule.explicitUnsupportedTargets.map(({ target }) => target));
export const nodeMainApplicableTargets = Object.freeze(
  nodeMainRule.axes.target.filter((target) => !rejectedNodeTargets.has(target)),
);
export const nodeMainApplicableCoordinates = Object.freeze(
  nodeMainRule.axes.producerGroup.flatMap((producerGroup) =>
    nodeMainRule.axes.mainFormat.flatMap((format) =>
      nodeMainRule.axes.constructionHost.flatMap((constructionHost) =>
        nodeMainApplicableTargets.map((target) => Object.freeze({ producerGroup, format, constructionHost, target }))
      )
    )
  ),
);
if (
  nodeMainApplicableCoordinates.length !== nodeMainRule.expectedCoordinateCount
  || nodeMainRule.explicitUnsupportedCoordinates.length !== nodeMainRule.expectedUnsupportedCoordinateCount
  || nodeMainApplicableCoordinates.length + nodeMainRule.explicitUnsupportedCoordinates.length
    !== nodeMainRule.expectedCartesianCoordinateCount
) throw new Error("Node executable coordinate accounting is inconsistent");

export const systemTarget = observedSystemTarget;

export const assertExactTargetHost = (target) => {
  const observed = systemTarget();
  if (observed !== target) throw new Error(`target finalizer host mismatch: expected ${target}, observed ${observed}`);
};

const u16 = (bytes, offset) => bytes.readUInt16LE(offset);
const u32 = (bytes, offset) => bytes.readUInt32LE(offset);
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Strictly reads the regular top-level entries from one GitHub artifact ZIP. */
export const readArtifactZip = (input) => {
  const bytes = Buffer.from(input);
  let eocd = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) {
    if (u32(bytes, offset) === 0x06054b50) eocd = offset;
  }
  if (eocd < 0) throw new Error("ZIP end record missing");
  const entries = u16(bytes, eocd + 10);
  if (entries !== u16(bytes, eocd + 8)) throw new Error("multi-disk ZIP is forbidden");
  const directoryBytes = u32(bytes, eocd + 12);
  const directoryOffset = u32(bytes, eocd + 16);
  if (directoryOffset + directoryBytes > eocd) throw new Error("ZIP central directory bounds are invalid");
  const result = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new Error("ZIP central entry missing");
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const expectedCrc = u32(bytes, cursor + 16);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const externalAttributes = u32(bytes, cursor + 38);
    const localOffset = u32(bytes, cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if ((flags & 1) !== 0) throw new Error("encrypted ZIP entries are forbidden");
    if (name.length === 0 || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      throw new Error(`unsafe or non-top-level ZIP entry ${name}`);
    }
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0o170000;
    if (fileType !== 0 && fileType !== 0o100000) throw new Error(`non-regular ZIP entry ${name}`);
    if (result.has(name)) throw new Error(`duplicate ZIP entry ${name}`);
    if (u32(bytes, localOffset) !== 0x04034b50) throw new Error(`local ZIP entry missing for ${name}`);
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name) throw new Error(`ZIP local/central name mismatch for ${name}`);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(start, start + compressedSize);
    const contents = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : undefined;
    if (contents === undefined) throw new Error(`unsupported ZIP compression ${method}`);
    if (contents.length !== uncompressedSize) throw new Error(`ZIP length mismatch for ${name}`);
    if (crc32(contents) !== expectedCrc) throw new Error(`ZIP CRC mismatch for ${name}`);
    result.set(name, contents);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== directoryOffset + directoryBytes) throw new Error("ZIP central directory has trailing records");
  return result;
};

export const requireEntries = (entries, expected) => {
  const actual = [...entries.keys()].sort(compareUtf16);
  const wanted = [...expected].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`artifact layout mismatch: ${actual.join(",")}`);
};

const githubHeaders = (token) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

export const githubJson = async (path, token) => {
  const response = await fetch(`https://api.github.com${path}`, { headers: githubHeaders(token), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GitHub REST ${path} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 1_048_576) throw new Error(`GitHub REST ${path} exceeded response bound`);
  return JSON.parse(bytes.toString("utf8"));
};

const runJobs = new Map();
const runArtifacts = new Map();
const runKey = ({ repository, runId }) => `${repository}\0${runId}`;
const runResourceKey = (options) =>
  `${runKey(options)}\0${options.resource}\0${options.query ?? ""}`;

const listRunResources = async ({ repository, runId, token, resource, query = "" }) => {
  const values = [];
  let totalCount;
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubJson(
      `/repos/${repository}/actions/runs/${runId}/${resource}?${query}per_page=100&page=${page}`,
      token,
    );
    if (!Number.isSafeInteger(response.total_count) || response.total_count < 0 || response.total_count > 1000) {
      throw new Error(`${resource} total_count is outside the bounded run snapshot`);
    }
    if (!Array.isArray(response[resource])) throw new Error(`${resource} run snapshot is malformed`);
    if (totalCount === undefined) totalCount = response.total_count;
    if (response.total_count !== totalCount) throw new Error(`${resource} run snapshot changed during pagination`);
    values.push(...response[resource]);
    if (values.length === totalCount) return Object.freeze(values);
    if (values.length > totalCount || response[resource].length !== 100) {
      throw new Error(`${resource} run snapshot pagination is incomplete`);
    }
  }
  throw new Error(`${resource} run snapshot exceeds ten pages`);
};

const cachedRunResources = (cache, options) => {
  const key = runResourceKey(options);
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = listRunResources(options);
    cache.set(key, pending);
    pending.catch(() => {
      if (cache.get(key) === pending) cache.delete(key);
    });
  }
  return pending;
};

export const observeArtifact = async ({ repository, runId, name, token }) => {
  const options = {
    repository,
    runId,
    token,
    resource: "artifacts",
    query: `name=${encodeURIComponent(name)}&`,
  };
  for (const delay of [0, 1000, 3000]) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      runArtifacts.delete(runResourceKey(options));
    }
    try {
      const artifacts = await cachedRunResources(runArtifacts, options);
      const matches = artifacts.filter((artifact) => artifact.name === name);
      if (matches.length !== 1) throw new Error(`expected exactly one artifact named ${name}, observed ${matches.length}`);
      const artifact = matches[0];
      if (String(artifact.workflow_run?.id) !== String(runId)) {
        throw new Error(`artifact ${name} workflow-run binding mismatch`);
      }
      if (artifact.expired || new Date(artifact.expires_at).getTime() <= Date.now()) throw new Error(`artifact ${name} is expired`);
      githubDigest(artifact.digest, `${name}.digest`);
      return artifact;
    } catch (error) {
      if (delay === 3000) throw error;
    }
  }
  throw new Error(`artifact ${name} observation exhausted`);
};

export const observeArtifactById = async ({ repository, artifactId, token }) => {
  positiveDecimal(String(artifactId), "artifactId");
  return githubJson(`/repos/${repository}/actions/artifacts/${artifactId}`, token);
};

export const observeRun = async ({ repository, runId, token }) =>
  githubJson(`/repos/${repository}/actions/runs/${runId}`, token);

export const observeJob = async ({ repository, runId, runAttempt, name, token }) => {
  const jobs = await cachedRunResources(runJobs, {
    repository,
    runId,
    token,
    resource: "jobs",
    query: "filter=all&",
  });
  const matches = jobs.filter((job) =>
    job.name === name && (runAttempt === undefined || String(job.run_attempt) === String(runAttempt))
  );
  if (matches.length !== 1) throw new Error(`expected exactly one job named ${name}, observed ${matches.length}`);
  return matches[0];
};

export const downloadArtifact = async (artifact, token) => {
  const response = await fetch(artifact.archive_download_url, {
    headers: githubHeaders(token),
    redirect: "follow",
    signal: AbortSignal.timeout(artifactDownloadTimeoutMs),
  });
  if (!response.ok) throw new Error(`artifact download returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha256:${sha256(bytes)}` !== artifact.digest) throw new Error(`artifact wrapper digest mismatch for ${artifact.name}`);
  return bytes;
};

export const requireEnvironment = (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing ${name}`);
  return value;
};
