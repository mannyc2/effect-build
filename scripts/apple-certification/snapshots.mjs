import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { sha256 } from "../node-finalizer/common.mjs";
import { readBoundedRegularFile } from "./receipt.mjs";

const candidateBytes = new WeakMap();
const requestBytes = new WeakMap();
const candidateDirectoryMode = 0o500;
const snapshotFileMode = 0o400;
const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const exactAbsolutePath = (value, subject) => {
  if (typeof value !== "string" || !isAbsolute(value) || normalize(value) !== value) {
    throw new Error(`${subject} must be a normalized absolute path`);
  }
  return value;
};

const snapshotName = (value) => {
  if (
    typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)
    || value === "." || value === ".."
  ) throw new Error("candidate snapshot filename is not one safe basename");
  return value;
};

const exactMode = (metadata) => Number(metadata.mode & 0o777n);

const filesystemIdentity = (metadata) => Object.freeze({
  device: String(metadata.dev),
  inode: String(metadata.ino),
  size: String(metadata.size),
  mtimeNs: String(metadata.mtimeNs),
  ctimeNs: String(metadata.ctimeNs),
});

const requireCapturedIdentity = (metadata, captured, subject) => {
  if (
    String(metadata.dev) !== captured.device || String(metadata.ino) !== captured.inode
    || String(metadata.size) !== captured.size || String(metadata.mtimeNs) !== captured.mtimeNs
    || String(metadata.ctimeNs) !== captured.ctimeNs
  ) throw new Error(`${subject} no longer has its captured filesystem identity`);
};

const requireCandidateDirectory = async (root, captured) => {
  const metadata = await lstat(root, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("candidate snapshot root must remain a directory and must not be a symbolic link");
  }
  if (exactMode(metadata) !== candidateDirectoryMode) {
    throw new Error("candidate snapshot root must remain mode 0500");
  }
  if (captured !== undefined) requireCapturedIdentity(metadata, captured, "candidate snapshot root");
  return metadata;
};

const collectCandidateFiles = async (identity) => {
  await requireCandidateDirectory(identity.root, identity.filesystem);
  const entries = await readdir(identity.root, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort(compareUtf16);
  if (JSON.stringify(names) !== JSON.stringify(identity.names)) {
    throw new Error("candidate snapshot exact file set changed after capture");
  }
  const files = new Map();
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`candidate snapshot entry must remain a regular file and must not be a symbolic link: ${entry.name}`);
    }
    files.set(entry.name, join(identity.root, entry.name));
  }
  return files;
};

const readExactSnapshotFile = async ({ path, originalBytes, expectedSha256, captured, subject }) => {
  const before = await lstat(path, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${subject} must remain a regular file and must not be a symbolic link`);
  }
  if (exactMode(before) !== snapshotFileMode) throw new Error(`${subject} must remain mode 0400`);
  if (captured !== undefined) requireCapturedIdentity(before, captured, subject);
  const bytes = await readBoundedRegularFile({ path, maximumBytes: originalBytes.length, subject });
  const after = await lstat(path, { bigint: true });
  if (after.isSymbolicLink() || !after.isFile() || exactMode(after) !== snapshotFileMode) {
    throw new Error(`${subject} mode or file type changed while it was authenticated`);
  }
  if (captured !== undefined) requireCapturedIdentity(after, captured, subject);
  if (
    before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || bytes.length !== originalBytes.length || sha256(bytes) !== expectedSha256 || !bytes.equals(originalBytes)
  ) throw new Error(`${subject} length, digest, or bytes changed after capture`);
  return Object.freeze({ bytes, filesystem: filesystemIdentity(after) });
};

export const captureCandidateSnapshot = async ({ root: rawRoot, entries }) => {
  const root = exactAbsolutePath(rawRoot, "candidate snapshot root");
  const originals = new Map();
  for (const [rawName, rawBytes] of entries) {
    const name = snapshotName(rawName);
    if (originals.has(name)) throw new Error(`duplicate candidate snapshot filename: ${name}`);
    if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
      throw new Error(`candidate snapshot entry must be non-empty bytes: ${name}`);
    }
    originals.set(name, Buffer.from(rawBytes));
  }
  if (originals.size === 0) throw new Error("candidate snapshot must contain at least one file");
  const names = Object.freeze([...originals.keys()].sort(compareUtf16));
  const rootFilesystem = filesystemIdentity(await requireCandidateDirectory(root));
  const provisional = { root, names, filesystem: rootFilesystem };
  const paths = await collectCandidateFiles(provisional);
  const records = [];
  for (const name of names) {
    const originalBytes = originals.get(name);
    const expectedSha256 = sha256(originalBytes);
    const captured = await readExactSnapshotFile({
      path: paths.get(name),
      originalBytes,
      expectedSha256,
      subject: `candidate snapshot ${name}`,
    });
    records.push(Object.freeze({
      name,
      path: paths.get(name),
      mode: "0400",
      bytes: String(originalBytes.length),
      sha256: expectedSha256,
      filesystem: captured.filesystem,
    }));
  }
  await collectCandidateFiles(provisional);
  const files = Object.freeze(records);
  const identity = Object.freeze({ root, mode: "0500", names, filesystem: rootFilesystem, files });
  candidateBytes.set(identity, originals);
  await reauthenticateCandidateSnapshot(identity);
  return identity;
};

export const reauthenticateCandidateSnapshot = async (identity) => {
  const originals = candidateBytes.get(identity);
  if (originals === undefined) throw new Error("candidate snapshot identity was not captured by this verifier");
  const firstFiles = await collectCandidateFiles(identity);
  for (const record of identity.files) {
    const originalBytes = originals.get(record.name);
    await readExactSnapshotFile({
      path: firstFiles.get(record.name),
      originalBytes,
      expectedSha256: record.sha256,
      captured: record.filesystem,
      subject: `candidate snapshot ${record.name}`,
    });
  }
  await collectCandidateFiles(identity);
  return identity;
};

export const captureRequestSnapshot = async ({ path: rawPath, bytes: rawBytes }) => {
  const path = exactAbsolutePath(rawPath, "certification request snapshot path");
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    throw new Error("certification request snapshot must contain non-empty bytes");
  }
  const originalBytes = Buffer.from(rawBytes);
  const expectedSha256 = sha256(originalBytes);
  const captured = await readExactSnapshotFile({
    path,
    originalBytes,
    expectedSha256,
    subject: "certification request snapshot",
  });
  const identity = Object.freeze({
    path,
    mode: "0400",
    bytes: String(originalBytes.length),
    sha256: expectedSha256,
    filesystem: captured.filesystem,
  });
  requestBytes.set(identity, originalBytes);
  await reauthenticateRequestSnapshot(identity);
  return identity;
};

export const reauthenticateRequestSnapshot = async (identity) => {
  const originalBytes = requestBytes.get(identity);
  if (originalBytes === undefined) throw new Error("certification request identity was not captured by this verifier");
  await readExactSnapshotFile({
    path: identity.path,
    originalBytes,
    expectedSha256: identity.sha256,
    captured: identity.filesystem,
    subject: "certification request snapshot",
  });
  return identity;
};
