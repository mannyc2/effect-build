import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  realpath,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const WINDOWS_LOCK_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export class AuthorLawFailure extends Error {
  constructor(tag, fields = {}, options) {
    super(tag, options);
    this.name = "AuthorLawFailure";
    this._tag = tag;
    Object.assign(this, fields);
  }
}

const revisionOf = (information) => ({
  device: information.dev.toString(10),
  inode: information.ino.toString(10),
  mode: information.mode.toString(10),
  size: information.size.toString(10),
  modifiedNanoseconds: information.mtimeNs.toString(10),
  changedNanoseconds: information.ctimeNs.toString(10),
});

const sameRevision = (left, right) =>
  left.device === right.device
  && left.inode === right.inode
  && left.mode === right.mode
  && left.size === right.size
  && left.modifiedNanoseconds === right.modifiedNanoseconds
  && left.changedNanoseconds === right.changedNanoseconds;

const digest = (hash) => ({
  algorithm: "sha256",
  value: hash.digest("hex"),
});

export const normalizeRelative = (candidate) => {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0")) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate });
  }
  const portable = candidate.replaceAll("\\", "/");
  if (portable.startsWith("/") || /^[A-Za-z]:\//.test(portable)) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate });
  }
  const segments = [];
  for (const segment of portable.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate });
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate });
  }
  return segments.join("/");
};

const portableRelative = (root, candidate) => {
  const value = relative(root, candidate).split(sep).join("/");
  const normalized = normalizeRelative(value);
  const reconstructed = resolve(root, ...normalized.split("/"));
  if (reconstructed !== resolve(candidate)) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate });
  }
  return normalized;
};

const streamFile = async (path, mode, options = {}) => {
  const highWaterMark = options.highWaterMark ?? 64 * 1024;
  if (!Number.isSafeInteger(highWaterMark) || highWaterMark < 1) {
    throw new TypeError("highWaterMark must be a positive safe integer");
  }
  const before = await stat(path, { bigint: true });
  if (!before.isFile()) {
    throw new AuthorLawFailure("BorrowedOutputObservationFailed", {
      path,
      reason: "not-a-regular-file",
    });
  }
  const hash = mode === "hashed" ? createHash("sha256") : undefined;
  let bytes = 0n;
  let chunks = 0;
  let maxChunkBytes = 0;
  let prefix = Buffer.alloc(0);
  for await (const chunk of createReadStream(path, { highWaterMark })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += BigInt(buffer.byteLength);
    chunks += 1;
    maxChunkBytes = Math.max(maxChunkBytes, buffer.byteLength);
    hash?.update(buffer);
    if (prefix.byteLength < 4) {
      prefix = Buffer.concat([prefix, buffer.subarray(0, 4 - prefix.byteLength)]);
    }
    await options.onChunk?.({ path, chunks, bytes: bytes.toString(10) });
  }
  const after = await stat(path, { bigint: true });
  const beforeRevision = revisionOf(before);
  const afterRevision = revisionOf(after);
  if (!sameRevision(beforeRevision, afterRevision) || bytes !== before.size) {
    throw new AuthorLawFailure("BorrowedOutputChanged", {
      path,
      mismatch: "file-mutated-during-observation",
    });
  }
  const metrics = { chunks, maxChunkBytes, highWaterMark, bufferedWholeFile: false };
  options.onTraversal?.(metrics);
  return {
    bytes: bytes.toString(10),
    digest: hash === undefined ? undefined : digest(hash),
    prefix,
    revision: afterRevision,
    metrics,
  };
};

const fileObservation = (canonical, mode, streamed) => {
  if (mode === "hashed") {
    return {
      _tag: "HashedFileObservation",
      path: canonical,
      kind: "file",
      bytes: streamed.bytes,
      digest: streamed.digest,
    };
  }
  return {
    _tag: "UnhashedFileObservation",
    path: canonical,
    kind: "file",
    bytes: streamed.bytes,
  };
};

const observeFileInternal = async (path, mode, options = {}) => {
  const requested = resolve(path);
  const requestedInformation = await lstat(requested, { bigint: true }).catch((cause) => {
    throw new AuthorLawFailure("BorrowedOutputMissing", { path }, { cause });
  });
  if (requestedInformation.isSymbolicLink()) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate: requested, reason: "symbolic-link" });
  }
  const canonical = await realpath(requested);
  const streamed = await streamFile(canonical, mode, options);
  return {
    observation: fileObservation(canonical, mode, streamed),
    revision: streamed.revision,
    metrics: streamed.metrics,
  };
};

const manifestLine = (entry) =>
  entry.kind === "directory"
    ? `directory\0${entry.relativePath}\0\n`
    : `file\0${entry.relativePath}\0${entry.bytes}\0${entry.digest?.value ?? "unhashed"}\n`;

const observeTreeInternal = async (root, mode, options = {}) => {
  const requested = resolve(root);
  const requestedInformation = await lstat(requested, { bigint: true }).catch((cause) => {
    throw new AuthorLawFailure("BorrowedOutputMissing", { path: root }, { cause });
  });
  if (requestedInformation.isSymbolicLink()) {
    throw new AuthorLawFailure("BorrowedOutputEscaped", { candidate: requested, reason: "symbolic-link" });
  }
  const canonical = await realpath(requested);
  const rootInformation = await lstat(canonical, { bigint: true });
  if (!rootInformation.isDirectory()) {
    throw new AuthorLawFailure("BorrowedOutputObservationFailed", {
      path: canonical,
      reason: "tree-root-is-not-a-directory",
    });
  }
  const entries = [];
  const revisions = new Map([[".", revisionOf(rootInformation)]]);
  let totalBytes = 0n;
  const traversal = { chunks: 0, maxChunkBytes: 0, highWaterMark: options.highWaterMark ?? 64 * 1024 };

  const visit = async (directory) => {
    const children = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      const information = await lstat(path, { bigint: true });
      const relativePath = portableRelative(canonical, path);
      if (information.isSymbolicLink()) {
        throw new AuthorLawFailure("BorrowedOutputEscaped", {
          candidate: relativePath,
          reason: "symbolic-link",
        });
      }
      revisions.set(relativePath, revisionOf(information));
      if (information.isDirectory()) {
        entries.push({ relativePath, kind: "directory" });
        await visit(path);
        continue;
      }
      if (!information.isFile()) {
        throw new AuthorLawFailure("BorrowedOutputObservationFailed", {
          path,
          reason: "unsupported-tree-entry",
        });
      }
      const streamed = await streamFile(path, mode, {
        highWaterMark: options.highWaterMark,
        onChunk: options.onChunk,
      });
      if (!sameRevision(revisions.get(relativePath), streamed.revision)) {
        throw new AuthorLawFailure("BorrowedOutputChanged", {
          path,
          mismatch: "tree-entry-mutated-during-observation",
        });
      }
      totalBytes += BigInt(streamed.bytes);
      traversal.chunks += streamed.metrics.chunks;
      traversal.maxChunkBytes = Math.max(traversal.maxChunkBytes, streamed.metrics.maxChunkBytes);
      entries.push(mode === "hashed"
        ? {
          relativePath,
          kind: "file",
          bytes: streamed.bytes,
          digest: streamed.digest,
        }
        : { relativePath, kind: "file", bytes: streamed.bytes });
    }
  };
  await visit(canonical);
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const finalRoot = await lstat(canonical, { bigint: true });
  if (!sameRevision(revisions.get("."), revisionOf(finalRoot))) {
    throw new AuthorLawFailure("BorrowedOutputChanged", {
      path: canonical,
      mismatch: "tree-root-mutated-during-observation",
    });
  }
  traversal.bufferedWholeFile = false;
  options.onTraversal?.(traversal);
  const base = {
    root: canonical,
    entries,
    totalBytes: totalBytes.toString(10),
  };
  const observation = mode === "hashed"
    ? {
      _tag: "HashedTreeObservation",
      ...base,
      manifestDigest: digest(createHash("sha256").update(entries.map(manifestLine).join(""))),
    }
    : { _tag: "UnhashedTreeObservation", ...base };
  return { observation, revisions, metrics: traversal };
};

const sameRevisionMap = (left, right) => {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (other === undefined || !sameRevision(value, other)) return false;
  }
  return true;
};

export const createDrainingAuthority = (closeUnderlying) => {
  let state = "open";
  let active = 0;
  let closePromise;
  let resolveDrain;
  const acquire = () => {
    if (state !== "open") {
      throw new AuthorLawFailure("BorrowedOutputExpired", { state });
    }
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      if (state === "closing" && active === 0) resolveDrain?.();
    };
  };
  const use = async (operation) => {
    const release = acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const close = () => {
    if (closePromise !== undefined) return closePromise;
    state = "closing";
    closePromise = (async () => {
      if (active > 0) {
        await new Promise((resolveDrainPromise) => {
          resolveDrain = resolveDrainPromise;
        });
      }
      await closeUnderlying();
      state = "closed";
    })();
    return closePromise;
  };
  return {
    use,
    close,
    state: () => state,
    active: () => active,
  };
};

export const borrowFile = async (path, mode, options = {}) => {
  const initial = await observeFileInternal(path, mode, options);
  const authority = createDrainingAuthority(options.closeUnderlying ?? (async () => {}));
  return {
    path: initial.observation.path,
    initial: initial.observation,
    observe: () => authority.use(async () => {
      const current = await observeFileInternal(initial.observation.path, mode, options);
      if (!sameRevision(initial.revision, current.revision)) {
        throw new AuthorLawFailure("BorrowedOutputChanged", {
          path: initial.observation.path,
          mismatch: "file-revision",
        });
      }
      if (
        mode === "hashed"
        && current.observation.digest.value !== initial.observation.digest.value
      ) {
        throw new AuthorLawFailure("BorrowedOutputChanged", {
          path: initial.observation.path,
          mismatch: "file-digest",
        });
      }
      return current.observation;
    }),
    close: authority.close,
    state: authority.state,
    active: authority.active,
  };
};

export const borrowTree = async (root, mode, options = {}) => {
  const initial = await observeTreeInternal(root, mode, options);
  const authority = createDrainingAuthority(options.closeUnderlying ?? (async () => {}));
  return {
    root: initial.observation.root,
    initial: initial.observation,
    observe: () => authority.use(async () => {
      const current = await observeTreeInternal(initial.observation.root, mode, options);
      if (!sameRevisionMap(initial.revisions, current.revisions)) {
        throw new AuthorLawFailure("BorrowedOutputChanged", {
          path: initial.observation.root,
          mismatch: "tree-revision",
        });
      }
      if (
        mode === "hashed"
        && current.observation.manifestDigest.value !== initial.observation.manifestDigest.value
      ) {
        throw new AuthorLawFailure("BorrowedOutputChanged", {
          path: initial.observation.root,
          mismatch: "tree-manifest-digest",
        });
      }
      return current.observation;
    }),
    close: authority.close,
    state: authority.state,
    active: authority.active,
  };
};

export const classifyCommitError = (platform, error, destination) => {
  const code = error !== null && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
  if (platform === "win32" && code !== undefined && WINDOWS_LOCK_CODES.has(code)) {
    return new AuthorLawFailure("ExecutableDestinationLocked", { destination, code }, { cause: error });
  }
  return new AuthorLawFailure("ExecutableCommitFailed", {
    destination,
    reason: error instanceof Error ? error.message : String(error),
  }, { cause: error });
};

const nativeFormat = (prefix) => {
  if (prefix[0] === 0x7f && prefix.subarray(1, 4).toString("ascii") === "ELF") return "elf";
  if (prefix[0] === 0x4d && prefix[1] === 0x5a) return "pe";
  const magic = prefix.readUInt32BE(0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return "mach-o";
  throw new AuthorLawFailure("ExecutableInspectionFailed", { reason: "unknown-native-format" });
};

export const publishExecutable = async ({
  destination,
  observation,
  runtime,
  target,
  produce,
  highWaterMark = 64 * 1024,
  onTraversal,
  renameOperation = rename,
  platform = process.platform,
}) => {
  if (!isAbsolute(destination)) {
    throw new AuthorLawFailure("ExecutableCommitFailed", {
      destination,
      reason: "destination-must-be-absolute",
    });
  }
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const candidate = join(parent, `.${randomBytes(12).toString("hex")}.effect-build-candidate`);
  try {
    await produce(candidate);
    const information = await stat(candidate, { bigint: true }).catch((cause) => {
      throw new AuthorLawFailure("ExecutableCandidateMissing", { stagedPath: candidate }, { cause });
    });
    if (!information.isFile()) {
      throw new AuthorLawFailure("ExecutableInspectionFailed", {
        stagedPath: candidate,
        reason: "candidate-is-not-a-regular-file",
      });
    }
    await chmod(candidate, 0o755);
    const streamed = await streamFile(candidate, observation, { highWaterMark, onTraversal });
    const format = nativeFormat(streamed.prefix);
    const expectedFormat = target.os === "linux" ? "elf" : target.os === "macos" ? "mach-o" : "pe";
    if (format !== expectedFormat) {
      throw new AuthorLawFailure("ExecutableInspectionFailed", {
        stagedPath: candidate,
        reason: `native-format-${format}-does-not-match-${expectedFormat}`,
      });
    }
    try {
      await renameOperation(candidate, destination);
    } catch (error) {
      throw classifyCommitError(platform, error, destination);
    }
    const base = {
      path: destination,
      bytes: streamed.bytes,
      nativeFormat: format,
      runtime,
      target,
      publication: { commit: "same-parent-rename", committed: true },
    };
    return observation === "hashed"
      ? { _tag: "HashedExecutableArtifact", ...base, digest: streamed.digest }
      : { _tag: "UnhashedExecutableArtifact", ...base };
  } finally {
    await rm(candidate, { force: true });
  }
};

export const assertDecimalByteCounts = (value) => {
  if (!DECIMAL.test(value)) throw new Error(`not a canonical decimal byte count: ${value}`);
  return value;
};
