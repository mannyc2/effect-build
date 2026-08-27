import { lstat, open, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { appleCertification, hex, sha256 } from "../node-finalizer/common.mjs";

const maximumCertifierBytes = 16 * 1024 * 1024;

const authority = appleCertification.certifierAuthority;

const required = (environment, name) => {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`missing ${name}`);
  return value;
};

const canonicalPath = (value, field) => {
  if (!isAbsolute(value) || normalize(value) !== value) throw new Error(`${field} must be a normalized absolute path`);
  return value;
};

export const approvedCertifierIdentities = (environment = process.env) => {
  const primary = Object.freeze({
    path: canonicalPath(required(environment, authority.primaryPathVariable), authority.primaryPathVariable),
    sha256: hex(required(environment, authority.primaryDigestVariable), 64, authority.primaryDigestVariable),
  });
  const cleanHost = Object.freeze({
    path: canonicalPath(required(environment, authority.cleanHostPathVariable), authority.cleanHostPathVariable),
    sha256: hex(required(environment, authority.cleanHostDigestVariable), 64, authority.cleanHostDigestVariable),
  });
  if (primary.sha256 === cleanHost.sha256) {
    throw new Error("distribution/cell and clean-host certifier digests must be distinct");
  }
  return Object.freeze({ primary, cleanHost });
};

export const approvedCertifierIdentity = (category, environment = process.env) => {
  const identities = approvedCertifierIdentities(environment);
  return category === "clean-host" ? identities.cleanHost : identities.primary;
};

const readRegularFile = async (path, subject) => {
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > maximumCertifierBytes) {
      throw new Error(`${subject} must be a non-empty regular file no larger than ${maximumCertifierBytes} bytes`);
    }
    const bytes = Buffer.alloc(metadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error(`${subject} was truncated while it was read`);
      offset += bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, bytes.length)).bytesRead !== 0) {
      throw new Error(`${subject} grew while it was read`);
    }
    if ((await handle.stat()).size !== metadata.size) throw new Error(`${subject} changed while it was read`);
    return bytes;
  } finally {
    await handle.close();
  }
};

export const snapshotApprovedCertifier = async ({ category, temporaryRoot, environment = process.env }) => {
  const approved = approvedCertifierIdentity(category, environment);
  if ((await lstat(approved.path)).isSymbolicLink()) throw new Error("approved certifier path must not be a symbolic link");
  const resolved = await realpath(approved.path);
  const sourceBytes = await readRegularFile(resolved, "approved certifier");
  if (sha256(sourceBytes) !== approved.sha256) throw new Error("approved certifier digest mismatch");
  const snapshotPath = join(temporaryRoot, "authenticated-apple-certifier");
  await writeFile(snapshotPath, sourceBytes, { flag: "wx", mode: 0o500 });
  const snapshotBytes = await readRegularFile(snapshotPath, "certifier snapshot");
  if (!snapshotBytes.equals(sourceBytes) || sha256(snapshotBytes) !== approved.sha256) {
    throw new Error("certifier snapshot authentication failed");
  }
  return Object.freeze({ ...approved, snapshotPath, bytes: String(snapshotBytes.length) });
};

export const reauthenticateCertifierSnapshot = async (identity) => {
  const metadata = await lstat(identity.snapshotPath);
  if (metadata.isSymbolicLink()) {
    throw new Error("certifier snapshot must not be a symbolic link");
  }
  if (!metadata.isFile() || (metadata.mode & 0o222) !== 0) {
    throw new Error("certifier snapshot must remain a read-only regular file");
  }
  const bytes = await readRegularFile(identity.snapshotPath, "certifier snapshot");
  if (String(bytes.length) !== identity.bytes || sha256(bytes) !== identity.sha256) {
    throw new Error("certifier snapshot changed before execution");
  }
  return identity;
};
