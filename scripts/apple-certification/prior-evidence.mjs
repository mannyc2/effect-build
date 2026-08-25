import { lstat, mkdir, writeFile } from "node:fs/promises";
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

const requireReadOnlyRegularFile = async (path, subject) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || (metadata.mode & 0o222) !== 0) {
    throw new Error(`${subject} must remain a read-only regular file`);
  }
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
  return Object.freeze({
    category,
    coordinate,
    snapshotRoot,
    manifestPath,
    manifestBytes,
    manifestSha256: sha256(manifestBytes),
    entries,
    records,
    expectedFiles: exactFiles(records),
  });
};

export const reauthenticatePriorEvidenceSnapshot = async (identity) => {
  await requireReadOnlyRegularFile(identity.manifestPath, "prior-evidence manifest snapshot");
  const manifestBytes = await readBoundedRegularFile({
    path: identity.manifestPath,
    maximumBytes: maximumPriorEvidenceManifestBytes,
    subject: `${identity.coordinate} prior-evidence manifest snapshot`,
  });
  if (!manifestBytes.equals(identity.manifestBytes) || sha256(manifestBytes) !== identity.manifestSha256) {
    throw new Error("prior-evidence manifest snapshot changed before execution");
  }
  const files = await collectEvidenceFiles(identity.snapshotRoot);
  if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(identity.expectedFiles)) {
    throw new Error("prior-evidence snapshot file set changed before execution");
  }
  for (const record of identity.records) {
    for (const [name, originalBytes, maximumBytes] of [
      [record.priorEvidenceManifestName, record.priorEvidenceManifestBytes, maximumPriorEvidenceManifestBytes],
      [record.receiptName, record.receiptBytes, maximumReceiptBytes],
      [record.evidenceName, record.evidenceBytes, maximumEvidenceBytes],
    ]) {
      await requireReadOnlyRegularFile(files.get(name), `prior-evidence snapshot ${name}`);
      const bytes = await readBoundedRegularFile({
        path: files.get(name),
        maximumBytes,
        subject: `${record.coordinate} snapshotted ${name}`,
      });
      if (!bytes.equals(originalBytes)) throw new Error(`prior-evidence snapshot changed before execution: ${name}`);
    }
  }
  return identity;
};
