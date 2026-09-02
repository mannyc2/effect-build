#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { Metadata, MetadataKind } from "@tufjs/models";

import { parseBunLockfilePackageRecords } from "./install-frozen-release-dependencies.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const exactBase64Evidence = (text, descriptor, label) => {
  if (text !== `${text.trim()}\n` || !/^[A-Za-z0-9+/]+={0,2}\n$/u.test(text)) {
    throw new Error(`${label} is not one canonical base64 evidence file`);
  }
  const bytes = Buffer.from(text.trim(), "base64");
  if (
    bytes.toString("base64") !== text.trim()
    || bytes.byteLength !== descriptor.bytes
    || sha256(bytes) !== descriptor.digest
  ) throw new Error(`${label} differs from the retained byte identity`);
  return bytes;
};

const metadata = (bytes, kind, descriptor, label) => {
  let value;
  try {
    value = Metadata.fromJSON(kind, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    throw new Error(`${label} is not valid signed TUF metadata`);
  }
  if (
    value.signed.version !== descriptor.version
    || new Date(value.signed.expires).toISOString() !== descriptor.expiresAt
  ) throw new Error(`${label} version or expiry differs`);
  return value;
};

export const verifyRetainedSigstoreTufProvenance = async ({
  tuf,
  evidence,
  trustedRootBytes,
  installedPackages,
  lockfileText,
  packageManifest,
  seedDocumentBytes,
}) => {
  if (
    tuf.mirror !== "https://tuf-repo-cdn.sigstore.dev"
    || tuf.target !== "trusted_root.json"
    || tuf.acquisition.cache !== "fresh-empty-temporary-directory"
    || tuf.acquisition.home !== "isolated-empty-directory"
    || tuf.acquisition.network !== "exact-official-mirror-only"
    || tuf.acquisition.evidenceEncoding !== "base64-of-exact-retrieved-bytes"
  ) throw new Error("Sigstore TUF acquisition boundary is not exact");
  const clients = new Map(tuf.acquisition.clients.map((entry) => [entry.package, entry]));
  const lockRecords = parseBunLockfilePackageRecords(lockfileText);
  if (
    clients.size !== 3
    || installedPackages.size !== clients.size
    || JSON.stringify([...clients.keys()]) !== JSON.stringify(["@sigstore/tuf", "tuf-js", "@tufjs/models"])
  ) throw new Error("Sigstore TUF acquisition client set differs");
  for (const [name, manifest] of installedPackages) {
    const expected = clients.get(name);
    const matchingRecords = lockRecords.filter(([recordName]) => recordName === name);
    const record = matchingRecords[0]?.[1];
    if (
      expected?.version !== manifest.version
      || expected.package !== manifest.name
      || packageManifest.devDependencies?.[name] !== expected.version
      || matchingRecords.length !== 1
      || record?.[0] !== `${name}@${expected.version}`
      || record?.at(-1) !== expected.integrity
    ) {
      throw new Error(`Sigstore TUF acquisition client differs: ${name}`);
    }
  }

  if (
    seedDocumentBytes.byteLength !== tuf.acquisition.seedRoot.clientSeedsBytes
    || sha256(seedDocumentBytes) !== tuf.acquisition.seedRoot.clientSeedsDigest
  ) throw new Error("pinned Sigstore TUF client seeds document changed");
  const seedDocument = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(seedDocumentBytes));
  const seedBytes = exactBase64Evidence(
    evidence.get(tuf.acquisition.seedRoot.path),
    tuf.acquisition.seedRoot,
    "Sigstore TUF seed root",
  );
  const seedFromClient = Buffer.from(seedDocument[tuf.mirror]?.["root.json"] ?? "", "base64");
  if (
    !seedBytes.equals(seedFromClient)
  ) throw new Error("retained Sigstore TUF seed differs from the pinned client seed");
  const rootBytes = exactBase64Evidence(
    evidence.get(tuf.acquisition.metadata.root.path),
    tuf.acquisition.metadata.root,
    "Sigstore TUF root",
  );
  const timestampBytes = exactBase64Evidence(
    evidence.get(tuf.acquisition.metadata.timestamp.path),
    tuf.acquisition.metadata.timestamp,
    "Sigstore TUF timestamp",
  );
  const snapshotBytes = exactBase64Evidence(
    evidence.get(tuf.acquisition.metadata.snapshot.path),
    tuf.acquisition.metadata.snapshot,
    "Sigstore TUF snapshot",
  );
  const targetsBytes = exactBase64Evidence(
    evidence.get(tuf.acquisition.metadata.targets.path),
    tuf.acquisition.metadata.targets,
    "Sigstore TUF targets",
  );

  const seed = metadata(seedBytes, MetadataKind.Root, tuf.acquisition.seedRoot, "Sigstore TUF seed root");
  const root = metadata(rootBytes, MetadataKind.Root, tuf.acquisition.metadata.root, "Sigstore TUF root");
  const timestamp = metadata(
    timestampBytes,
    MetadataKind.Timestamp,
    tuf.acquisition.metadata.timestamp,
    "Sigstore TUF timestamp",
  );
  const snapshot = metadata(
    snapshotBytes,
    MetadataKind.Snapshot,
    tuf.acquisition.metadata.snapshot,
    "Sigstore TUF snapshot",
  );
  const targets = metadata(
    targetsBytes,
    MetadataKind.Targets,
    tuf.acquisition.metadata.targets,
    "Sigstore TUF targets",
  );
  seed.verifyDelegate(MetadataKind.Root, seed);
  seed.verifyDelegate(MetadataKind.Root, root);
  root.verifyDelegate(MetadataKind.Root, root);
  root.verifyDelegate(MetadataKind.Timestamp, timestamp);
  timestamp.signed.snapshotMeta.verify(snapshotBytes);
  root.verifyDelegate(MetadataKind.Snapshot, snapshot);
  const targetsMeta = snapshot.signed.meta[`${MetadataKind.Targets}.json`];
  targetsMeta.verify(targetsBytes);
  root.verifyDelegate(MetadataKind.Targets, targets);
  if (
    root.signed.version !== seed.signed.version + 1
    || timestamp.signed.snapshotMeta.version !== snapshot.signed.version
    || targetsMeta.version !== targets.signed.version
  ) throw new Error("retained Sigstore TUF metadata has a rollback or version gap");
  const retrievedAt = new Date(tuf.acquisition.retrievedAt);
  if (
    Number.isNaN(retrievedAt.valueOf())
    || root.signed.isExpired(retrievedAt)
    || timestamp.signed.isExpired(retrievedAt)
    || snapshot.signed.isExpired(retrievedAt)
    || targets.signed.isExpired(retrievedAt)
  ) throw new Error("retained Sigstore TUF metadata was expired at acquisition");
  const target = targets.signed.targets[tuf.target];
  if (
    target?.length !== tuf.targetLength
    || target?.hashes.sha256 !== tuf.targetSha256.slice("sha256:".length)
    || trustedRootBytes.byteLength !== tuf.targetLength
    || sha256(trustedRootBytes) !== tuf.targetSha256
  ) throw new Error("retained Sigstore TUF target descriptor differs");
  await target.verify(Readable.from([trustedRootBytes]));
  return {
    mirror: tuf.mirror,
    retrievedAt: tuf.acquisition.retrievedAt,
    rootVersion: root.signed.version,
    timestampVersion: timestamp.signed.version,
    snapshotVersion: snapshot.signed.version,
    targetsVersion: targets.signed.version,
    target: tuf.target,
    targetDigest: tuf.targetSha256,
  };
};

export const loadRetainedSigstoreTufInputs = async () => {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const provenance = contract.releaseCertification.provenanceVerification;
  const tuf = provenance.trustedRoot.tuf;
  const evidence = new Map(await Promise.all([
    tuf.acquisition.seedRoot,
    ...Object.values(tuf.acquisition.metadata),
  ].map(async ({ path }) => [path, await readFile(resolve(repositoryRoot, path), "utf8")])));
  const installedPackages = new Map(tuf.acquisition.clients.map(({ package: name }) => [
    name,
    require(`${name}/package.json`),
  ]));
  return {
    tuf,
    evidence,
    installedPackages,
    lockfileText: await readFile(resolve(repositoryRoot, "bun.lock"), "utf8"),
    packageManifest: JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8")),
    seedDocumentBytes: await readFile(require.resolve("@sigstore/tuf/seeds.json")),
    trustedRootBytes: await readFile(resolve(repositoryRoot, provenance.trustedRoot.path)),
  };
};

const main = async () => {
  await verifyRetainedSigstoreTufProvenance(await loadRetainedSigstoreTufInputs());
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
