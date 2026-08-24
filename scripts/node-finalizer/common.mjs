import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

export const root = new URL("../../", import.meta.url);
export const contract = JSON.parse(await readFile(new URL("../../tooling/v05-contract.json", import.meta.url), "utf8"));
export const nodeProfile = contract.profiles.nodeMainExecutable;
export const capability = nodeProfile.targetFinalization.capability;
export const compatibility = contract.requiredCompatibilityEvidencePoints;

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const digest = (bytes) => ({ algorithm: "sha256", value: sha256(bytes) });

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

export const coordinate = ({ producerGroup, format, constructionHost, target }) => {
  const axes = compatibility.coordinateRules.nodeMainExecutable.axes;
  if (!axes.producerGroup.includes(producerGroup)) throw new Error(`unknown producer group ${producerGroup}`);
  if (!axes.mainFormat.includes(format)) throw new Error(`unknown main format ${format}`);
  if (!axes.constructionHost.includes(constructionHost)) throw new Error(`unknown construction host ${constructionHost}`);
  if (!axes.target.includes(target)) throw new Error(`unknown target ${target}`);
  return `node-main--${producerGroup}--${format}--from-${constructionHost}--to-${target}`;
};

export const systemTarget = () => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "macos-aarch64" : "macos-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "windows-aarch64" : "windows-x64";
  if (process.platform === "linux") return process.arch === "arm64" ? "linux-aarch64-gnu" : "linux-x64-gnu";
  throw new Error(`unsupported runner ${process.platform}/${process.arch}`);
};

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

export const observeArtifact = async ({ repository, runId, name, token }) => {
  for (const delay of [0, 1000, 3000]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const page = await githubJson(`/repos/${repository}/actions/runs/${runId}/artifacts?name=${encodeURIComponent(name)}&per_page=100`, token);
      const matches = page.artifacts.filter((artifact) => artifact.name === name);
      if (matches.length !== 1) throw new Error(`expected exactly one artifact named ${name}, observed ${matches.length}`);
      const artifact = matches[0];
      if (artifact.expired || new Date(artifact.expires_at).getTime() <= Date.now()) throw new Error(`artifact ${name} is expired`);
      githubDigest(artifact.digest, `${name}.digest`);
      return artifact;
    } catch (error) {
      if (delay === 3000) throw error;
    }
  }
  throw new Error(`artifact ${name} observation exhausted`);
};

export const observeRun = async ({ repository, runId, token }) =>
  githubJson(`/repos/${repository}/actions/runs/${runId}`, token);

export const observeJob = async ({ repository, runId, name, token }) => {
  const matches = [];
  for (let page = 1; page <= 4; page += 1) {
    const response = await githubJson(
      `/repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
      token,
    );
    matches.push(...response.jobs.filter((job) => job.name === name));
    if (response.jobs.length < 100) break;
  }
  if (matches.length !== 1) throw new Error(`expected exactly one job named ${name}, observed ${matches.length}`);
  return matches[0];
};

export const downloadArtifact = async (artifact, token) => {
  const response = await fetch(artifact.archive_download_url, {
    headers: githubHeaders(token),
    redirect: "follow",
    signal: AbortSignal.timeout(35_000),
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
