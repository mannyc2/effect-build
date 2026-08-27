import { chmod, lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import { approvedCertifierIdentity } from "./certifier.mjs";
import {
  collectEvidenceFiles,
  coordinateSlug,
  maximumEvidenceBytes,
  maximumPriorEvidenceManifestBytes,
  maximumReceiptBytes,
  packageVersion,
  priorEvidenceDependencies,
  priorEvidenceManifestProtocol,
  readBoundedRegularFile,
  validateCertificationEvidenceCrossLinks,
  validatePriorEvidenceManifest,
  validateReceipt,
  validatedEvidenceRecord,
} from "./receipt.mjs";

const exactFiles = (records) => records.flatMap((record) => [
  record.priorEvidenceManifestName,
  record.receiptName,
  record.evidenceName,
]).sort();

const snapshotBytes = new WeakMap();
const snapshotDirectoryMode = 0o500;
const snapshotFileMode = 0o400;
const compareUtf16 = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const requirePosixSnapshotModes = () => {
  if (process.platform === "win32") {
    throw new Error("Apple certification prior-evidence snapshots require POSIX read-only mode semantics");
  }
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

const requireSnapshotDirectory = async (root, captured) => {
  const metadata = await lstat(root, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("prior-evidence snapshot root must remain a directory and must not be a symbolic link");
  }
  if (exactMode(metadata) !== snapshotDirectoryMode) {
    throw new Error("prior-evidence snapshot root must remain mode 0500");
  }
  if (captured !== undefined) requireCapturedIdentity(metadata, captured, "prior-evidence snapshot root");
  return metadata;
};

const collectSnapshotFiles = async (identity) => {
  await requireSnapshotDirectory(identity.snapshotRoot, identity.filesystem);
  const entries = await readdir(identity.snapshotRoot, { withFileTypes: true });
  const names = entries.map(({ name }) => name).sort(compareUtf16);
  if (JSON.stringify(names) !== JSON.stringify(identity.expectedFiles)) {
    throw new Error("prior-evidence snapshot exact file set changed after capture");
  }
  const files = new Map();
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`prior-evidence snapshot entry must remain a regular file and must not be a symbolic link: ${entry.name}`);
    }
    files.set(entry.name, join(identity.snapshotRoot, entry.name));
  }
  return files;
};

const readExactSnapshotFile = async ({ path, originalBytes, maximumBytes, captured, subject }) => {
  const before = await lstat(path, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${subject} must remain a regular file and must not be a symbolic link`);
  }
  if (exactMode(before) !== snapshotFileMode) throw new Error(`${subject} must remain mode 0400`);
  if (captured !== undefined) requireCapturedIdentity(before, captured, subject);
  const bytes = await readBoundedRegularFile({ path, maximumBytes, subject });
  const after = await lstat(path, { bigint: true });
  if (after.isSymbolicLink() || !after.isFile() || exactMode(after) !== snapshotFileMode) {
    throw new Error(`${subject} mode or file type changed while it was authenticated`);
  }
  if (captured !== undefined) requireCapturedIdentity(after, captured, subject);
  if (
    before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || bytes.length !== originalBytes.length || sha256(bytes) !== sha256(originalBytes) || !bytes.equals(originalBytes)
  ) throw new Error(`${subject} length, digest, or bytes changed after capture`);
  return Object.freeze({ filesystem: filesystemIdentity(after) });
};

const readDependency = async ({ files, dependency, environment, expected }) => {
  const slug = coordinateSlug(dependency.category, dependency.coordinate);
  const priorEvidenceManifestName = `${slug}.prior-evidence.json`;
  const receiptName = `${slug}.receipt.json`;
  const evidenceName = `${slug}.evidence.json`;
  const paths = {
    priorEvidenceManifest: files.get(priorEvidenceManifestName),
    receipt: files.get(receiptName),
    evidence: files.get(evidenceName),
  };
  if (Object.values(paths).some((path) => path === undefined)) {
    throw new Error(`prior evidence omits ${dependency.category}/${dependency.coordinate}`);
  }
  const [priorEvidenceManifestBytes, receiptBytes, evidenceBytes] = await Promise.all([
    readBoundedRegularFile({
      path: paths.priorEvidenceManifest,
      maximumBytes: maximumPriorEvidenceManifestBytes,
      subject: `${dependency.coordinate} prior-evidence manifest`,
    }),
    readBoundedRegularFile({
      path: paths.receipt,
      maximumBytes: maximumReceiptBytes,
      subject: `${dependency.coordinate} receipt`,
    }),
    readBoundedRegularFile({
      path: paths.evidence,
      maximumBytes: maximumEvidenceBytes,
      subject: `${dependency.coordinate} evidence`,
    }),
  ]);
  const certifier = approvedCertifierIdentity(dependency.category, environment);
  const receipt = validateReceipt({
    priorEvidenceManifestBytes,
    receiptBytes,
    evidenceBytes,
    expected: {
      ...expected,
      ...dependency,
      certifierPath: certifier.path,
      certifierSha256: certifier.sha256,
      priorEvidenceManifestSha256: sha256(priorEvidenceManifestBytes),
    },
  });
  const validationRecord = validatedEvidenceRecord({
    receipt,
    priorEvidenceManifestBytes,
    receiptBytes,
    evidenceBytes,
  });
  return Object.freeze({
    ...validationRecord,
    priorEvidenceManifestName,
    priorEvidenceManifestBytes,
    receiptName,
    receiptBytes,
    evidenceName,
    evidenceBytes,
    certifierPath: certifier.path,
    certifierSha256: certifier.sha256,
  });
};

const manifestEntry = (record) => ({
  category: record.category,
  coordinate: record.coordinate,
  certifierPath: record.certifierPath,
  certifierSha256: record.certifierSha256,
  priorEvidenceManifestName: record.priorEvidenceManifestName,
  priorEvidenceManifestBytes: String(record.priorEvidenceManifestBytes.length),
  priorEvidenceManifestSha256: record.priorEvidenceManifestSha256,
  receiptName: record.receiptName,
  receiptBytes: String(record.receiptBytes.length),
  receiptSha256: record.receiptSha256,
  evidenceName: record.evidenceName,
  evidenceBytes: String(record.evidenceBytes.length),
  evidenceSha256: record.evidenceSha256,
  artifactIdentityKind: record.artifactIdentityKind,
  artifactBytes: record.artifactBytes,
  artifactSha256: record.artifactSha256,
});

export const snapshotPriorEvidence = async ({
  category,
  coordinate,
  inputRoot,
  temporaryRoot,
  environment = process.env,
  expected,
}) => {
  requirePosixSnapshotModes();
  const dependencies = priorEvidenceDependencies(category, coordinate);
  if (dependencies.length > 0 && inputRoot === undefined) {
    throw new Error(`${category}/${coordinate} requires authenticated prior evidence`);
  }
  const snapshotRoot = join(temporaryRoot, "authenticated-prior-evidence");
  await mkdir(snapshotRoot, { mode: 0o700 });
  const files = dependencies.length === 0 ? new Map() : await collectEvidenceFiles(inputRoot);
  const records = [];
  for (const dependency of dependencies) records.push(await readDependency({ files, dependency, environment, expected }));
  validateCertificationEvidenceCrossLinks(records);
  for (const record of records) {
    for (const [name, bytes] of [
      [record.priorEvidenceManifestName, record.priorEvidenceManifestBytes],
      [record.receiptName, record.receiptBytes],
      [record.evidenceName, record.evidenceBytes],
    ]) await writeFile(join(snapshotRoot, name), bytes, { flag: "wx", mode: 0o400 });
  }
  const entries = records.map(manifestEntry);
  const manifest = {
    protocol: priorEvidenceManifestProtocol,
    packageVersion,
    category,
    coordinate,
    sourceSha: expected.sourceSha,
    candidateWorkflowRunId: expected.candidateWorkflowRunId,
    candidateDescriptorDigest: expected.candidateDescriptorDigest,
    certificationWorkflowRunId: expected.certificationWorkflowRunId,
    bunLockSha256: expected.bunLockSha256,
    entries,
  };
  const manifestBytes = canonicalBytes(manifest);
  validatePriorEvidenceManifest({ manifestBytes, expected: { ...expected, category, coordinate, entries } });
  const manifestPath = join(temporaryRoot, "prior-evidence-manifest.json");
  await writeFile(manifestPath, manifestBytes, { flag: "wx", mode: 0o400 });
  await chmod(snapshotRoot, snapshotDirectoryMode);
  const expectedFiles = exactFiles(records);
  const provisional = {
    snapshotRoot,
    expectedFiles,
    filesystem: filesystemIdentity(await requireSnapshotDirectory(snapshotRoot)),
  };
  const paths = await collectSnapshotFiles(provisional);
  const originals = new Map();
  const filesIdentity = [];
  for (const record of records) {
    for (const [name, bytes, maximumBytes] of [
      [record.priorEvidenceManifestName, record.priorEvidenceManifestBytes, maximumPriorEvidenceManifestBytes],
      [record.receiptName, record.receiptBytes, maximumReceiptBytes],
      [record.evidenceName, record.evidenceBytes, maximumEvidenceBytes],
    ]) {
      const originalBytes = Buffer.from(bytes);
      originals.set(name, originalBytes);
      const captured = await readExactSnapshotFile({
        path: paths.get(name),
        originalBytes,
        maximumBytes,
        subject: `prior-evidence snapshot ${name}`,
      });
      filesIdentity.push(Object.freeze({
        name,
        path: paths.get(name),
        mode: "0400",
        maximumBytes,
        bytes: String(originalBytes.length),
        sha256: sha256(originalBytes),
        filesystem: captured.filesystem,
      }));
    }
  }
  const manifestOriginalBytes = Buffer.from(manifestBytes);
  const manifestCaptured = await readExactSnapshotFile({
    path: manifestPath,
    originalBytes: manifestOriginalBytes,
    maximumBytes: maximumPriorEvidenceManifestBytes,
    subject: "prior-evidence manifest snapshot",
  });
  await collectSnapshotFiles(provisional);
  const identity = Object.freeze({
    category,
    coordinate,
    snapshotRoot,
    mode: "0500",
    filesystem: provisional.filesystem,
    manifestPath,
    manifestBytes,
    manifestSha256: sha256(manifestBytes),
    manifestFilesystem: manifestCaptured.filesystem,
    entries,
    expectedFiles,
    files: Object.freeze(filesIdentity),
  });
  snapshotBytes.set(identity, Object.freeze({ manifest: manifestOriginalBytes, files: originals }));
  await reauthenticatePriorEvidenceSnapshot(identity);
  return identity;
};

export const reauthenticatePriorEvidenceSnapshot = async (identity) => {
  const originals = snapshotBytes.get(identity);
  if (originals === undefined) throw new Error("prior-evidence snapshot identity was not captured by this verifier");
  await readExactSnapshotFile({
    path: identity.manifestPath,
    originalBytes: originals.manifest,
    maximumBytes: maximumPriorEvidenceManifestBytes,
    subject: `${identity.coordinate} prior-evidence manifest snapshot`,
    captured: identity.manifestFilesystem,
  });
  const files = await collectSnapshotFiles(identity);
  for (const record of identity.files) {
    await readExactSnapshotFile({
      path: files.get(record.name),
      originalBytes: originals.files.get(record.name),
      maximumBytes: record.maximumBytes,
      captured: record.filesystem,
      subject: `prior-evidence snapshot ${record.name}`,
    });
  }
  await collectSnapshotFiles(identity);
  return identity;
};
