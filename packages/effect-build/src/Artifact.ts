import { Schema } from "effect";
import type { Observation as ToolObservation } from "./Author/Tool.js";
import {
  describe as describeSystemTarget,
  type SystemTarget,
  SystemTarget as SystemTargetSchema,
} from "./SystemTarget.js";

/** Canonical, non-negative, unbounded base-10 byte count. */
export type DecimalBytes = string & { readonly _effectBuildScalar: "DecimalBytes" };

/** Exactly 64 lowercase hexadecimal characters. */
export type Sha256Value = string & { readonly _effectBuildScalar: "Sha256Value" };

export interface Digest {
  readonly algorithm: "sha256";
  readonly value: Sha256Value;
}

export class ArtifactInvalid extends Schema.TaggedError<ArtifactInvalid>()("ArtifactInvalid", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `invalid artifact at ${this.path}: ${this.reason}`;
  }
}

export const decimalBytes = (value: string): DecimalBytes => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError("byte count must be canonical unsigned decimal");
  }
  return value as DecimalBytes;
};

export const sha256Digest = (value: string): Digest => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError("sha256 value must be 64 lowercase hexadecimal characters");
  }
  return Object.freeze({ algorithm: "sha256" as const, value: value as Sha256Value });
};

const isNormalizedSegment = (segment: string): boolean => segment.length > 0 && segment !== "." && segment !== "..";

const hasNormalizedSegments = (value: string, separator: "/" | "\\"): boolean => {
  const segments = value.split(separator);
  const last = segments.at(-1);
  const body = last === "" ? segments.slice(0, -1) : segments;
  return body.length > 0 && body.every(isNormalizedSegment);
};

const isNormalizedPosixAbsolutePath = (value: string): boolean => {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return value === "/" || hasNormalizedSegments(value.slice(1), "/");
};

const isNormalizedWindowsDriveAbsolutePath = (value: string): boolean => {
  if (!/^[A-Za-z]:\\/.test(value) || value.includes("/")) return false;
  return value.length === 3 || hasNormalizedSegments(value.slice(3), "\\");
};

const windowsVolumeGuid = /^Volume\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}\\/u;

const isNormalizedWindowsVolumeAbsolutePath = (value: string): boolean => {
  if (value.includes("/")) return false;
  const root = windowsVolumeGuid.exec(value)?.[0];
  if (root === undefined) return false;
  const remainder = value.slice(root.length);
  return remainder.length === 0 || hasNormalizedSegments(remainder, "\\");
};

const isNormalizedWindowsFilesystemNamespacePath = (value: string): boolean =>
  isNormalizedWindowsDriveAbsolutePath(value) || isNormalizedWindowsVolumeAbsolutePath(value);

const isNormalizedWindowsShare = (value: string, rootRequiresTrailingSeparator: boolean): boolean => {
  if (value.includes("/")) return false;
  const segments = value.split("\\");
  const last = segments.at(-1);
  const body = last === "" ? segments.slice(0, -1) : segments;
  if (body.length < 2 || !body.every(isNormalizedSegment)) return false;
  return !rootRequiresTrailingSeparator || body.length > 2 || last === "";
};

const isNormalizedWindowsUncAbsolutePath = (value: string): boolean => {
  if (value.startsWith("\\\\?\\UNC\\")) return isNormalizedWindowsShare(value.slice(8), false);
  if (value.startsWith("\\\\?\\")) return isNormalizedWindowsFilesystemNamespacePath(value.slice(4));
  if (value.startsWith("\\\\.\\")) return isNormalizedWindowsFilesystemNamespacePath(value.slice(4));
  return value.startsWith("\\\\") && isNormalizedWindowsShare(value.slice(2), true);
};

const isAbsolutePath = (value: string): boolean =>
  value.length > 0
  && !value.includes("\0")
  && (isNormalizedPosixAbsolutePath(value)
    || isNormalizedWindowsDriveAbsolutePath(value)
    || isNormalizedWindowsUncAbsolutePath(value));

/** A lexically absolute path normalized for one supported host path grammar. */
export const AbsolutePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      isAbsolutePath(value) ? true : "path must be absolute, normalized, non-empty, and contain no NUL"
    ),
  ),
  Schema.brand("effect-build/Artifact/AbsolutePath"),
);
export type AbsolutePath = typeof AbsolutePath.Type;

const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const windowsForbidden = /[<>:"|?*]/u;

const isPortableRelativePath = (value: string): boolean => {
  if (
    value.length === 0
    || value.normalize("NFC") !== value
    || value.includes("\\")
    || value.startsWith("/")
    || value.endsWith("/")
    || value.includes("\0")
  ) return false;
  return value.split("/").every((component) =>
    component.length > 0
    && component !== "."
    && component !== ".."
    && !windowsForbidden.test(component)
    && !Array.from(component).some((character) => character.charCodeAt(0) <= 0x1f)
    && !component.endsWith(".")
    && !component.endsWith(" ")
    && !windowsReserved.test(component)
  );
};

/** Normalized slash-separated path safe in every supported artifact target grammar. */
export const PortableRelativePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => isPortableRelativePath(value) ? true : "path is not portable and relative"),
  ),
  Schema.brand("effect-build/Artifact/PortableRelativePath"),
);
export type PortableRelativePath = typeof PortableRelativePath.Type;

export const portableRelativePath = (value: string): PortableRelativePath => {
  if (!isPortableRelativePath(value)) throw new TypeError("path must be normalized, portable, and relative");
  return value as PortableRelativePath;
};

/** Portable permission bits retained by exact file and tree observations. */
export type FileMode = number & { readonly _effectBuildScalar: "FileMode" };

export const fileMode = (value: number): FileMode => {
  if (!Number.isInteger(value) || value < 0 || value > 0o7777) {
    throw new TypeError("file mode must be an integer between 0 and 07777");
  }
  return value as FileMode;
};

export type ObservationMode = "hashed" | "unhashed";

interface DirectFilePublication {
  readonly scope: "file";
  readonly commit: "same-parent-no-replace-link";
  readonly committed: true;
}

interface TreePublication {
  readonly scope: "tree";
  readonly commit: "same-parent-rename";
  readonly committed: true;
}

interface TreeFileProjectionPublication {
  readonly scope: "tree-file-projection";
  readonly commit: "same-parent-rename";
  readonly committed: true;
  readonly treeRoot: AbsolutePath;
  readonly relativePath: PortableRelativePath;
  readonly treeManifestDigest: Digest;
}

/** Exact commit mechanism, including files projected from one atomic tree generation. */
export type Publication = DirectFilePublication | TreePublication | TreeFileProjectionPublication;

type FilePublication = DirectFilePublication | TreeFileProjectionPublication;

/** Provenance for operations that genuinely have no selected external tool. */
export interface IntrinsicProvenance {
  readonly _tag: "IntrinsicProvenance";
  readonly producer: string;
}

/** Exact selected-tool observation, or an honest intrinsic producer identity. */
export type Provenance = ToolObservation<string> | IntrinsicProvenance;

export const intrinsicProvenance = (producer: string): IntrinsicProvenance => {
  if (producer.length === 0 || producer.includes("\0")) throw new TypeError("producer identity must be non-empty");
  return Object.freeze({ _tag: "IntrinsicProvenance" as const, producer });
};

export interface UnhashedFileIdentity {
  readonly path: AbsolutePath;
  readonly bytes: DecimalBytes;
}

export interface HashedFileIdentity extends UnhashedFileIdentity {
  readonly digest: Digest;
}

export interface UnhashedFileObservation extends UnhashedFileIdentity {
  readonly _tag: "UnhashedFileObservation";
  readonly kind: "file";
}

export interface HashedFileObservation extends HashedFileIdentity {
  readonly _tag: "HashedFileObservation";
  readonly kind: "file";
}

export type FileObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedFileObservation
  : UnhashedFileObservation;

interface DurableFields<Commit extends Publication> {
  readonly provenance: Provenance;
  readonly publication: Commit;
}

export interface UnhashedFile extends UnhashedFileIdentity, DurableFields<FilePublication> {
  readonly _tag: "UnhashedFile";
}

export interface HashedFile extends HashedFileIdentity, DurableFields<FilePublication> {
  readonly _tag: "HashedFile";
}

/** One durable regular-file handoff. */
export type File<Mode extends ObservationMode = ObservationMode> = Mode extends "hashed" ? HashedFile : UnhashedFile;

export interface TreeDirectoryEntry {
  readonly kind: "directory";
  readonly relativePath: PortableRelativePath;
  readonly mode: FileMode;
}

export interface TreeSymbolicLinkEntry {
  readonly kind: "symbolic-link";
  readonly relativePath: PortableRelativePath;
  /** Exact relative link text; absolute and escaping targets are invalid. */
  readonly target: string;
}

export interface UnhashedTreeFileEntry {
  readonly kind: "file";
  readonly relativePath: PortableRelativePath;
  readonly mode: FileMode;
  readonly bytes: DecimalBytes;
}

export interface HashedTreeFileEntry extends UnhashedTreeFileEntry {
  readonly digest: Digest;
}

export type UnhashedTreeEntry = TreeDirectoryEntry | TreeSymbolicLinkEntry | UnhashedTreeFileEntry;
export type HashedTreeEntry = TreeDirectoryEntry | TreeSymbolicLinkEntry | HashedTreeFileEntry;

export interface UnhashedTreeObservation {
  readonly _tag: "UnhashedTreeObservation";
  readonly root: AbsolutePath;
  readonly rootMode: FileMode;
  readonly entries: readonly UnhashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
}

export interface HashedTreeObservation {
  readonly _tag: "HashedTreeObservation";
  readonly root: AbsolutePath;
  readonly rootMode: FileMode;
  readonly entries: readonly HashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

export type TreeObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedTreeObservation
  : UnhashedTreeObservation;

export interface UnhashedTree extends DurableFields<TreePublication> {
  readonly _tag: "UnhashedTree";
  readonly root: AbsolutePath;
  readonly rootMode: FileMode;
  readonly entries: readonly UnhashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
}

export interface HashedTree extends DurableFields<TreePublication> {
  readonly _tag: "HashedTree";
  readonly root: AbsolutePath;
  readonly rootMode: FileMode;
  readonly entries: readonly HashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

/** One durable, symlink-aware tree handoff. */
export type Tree<Mode extends ObservationMode = ObservationMode> = Mode extends "hashed" ? HashedTree : UnhashedTree;

export interface RuntimeObservation {
  readonly name: string;
  readonly version: string;
}

interface ExecutableFields extends DurableFields<DirectFilePublication> {
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: RuntimeObservation;
  readonly target: SystemTarget;
}

export interface UnhashedExecutable extends UnhashedFileIdentity, ExecutableFields {
  readonly _tag: "UnhashedExecutable";
}

export interface HashedExecutable extends HashedFileIdentity, ExecutableFields {
  readonly _tag: "HashedExecutable";
}

/** Durable bytes plus executable facts established by an executable inspector. */
export type Executable<Mode extends ObservationMode = ObservationMode> = Mode extends "hashed" ? HashedExecutable
  : UnhashedExecutable;

export const adoptionProtocol = "effect-build/artifact-adoption@1" as const;

export interface FileAdoption {
  readonly protocol: typeof adoptionProtocol;
  readonly kind: "file";
  readonly logicalName: string;
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
}

export interface TreeAdoption {
  readonly protocol: typeof adoptionProtocol;
  readonly kind: "tree";
  readonly logicalName: string;
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

export type Adoption = FileAdoption | TreeAdoption;

const checkedLogicalName = (logicalName: string): string => {
  if (logicalName.length === 0 || logicalName.includes("\0")) {
    throw new TypeError("logical name must be non-empty and contain no NUL");
  }
  return logicalName;
};

/** Path-free identity that a downstream owner can place in its own adoption plan. */
export const adoptFile = (logicalName: string, artifact: HashedFileIdentity): FileAdoption =>
  Object.freeze({
    protocol: adoptionProtocol,
    kind: "file" as const,
    logicalName: checkedLogicalName(logicalName),
    bytes: artifact.bytes,
    digest: Object.freeze({ ...artifact.digest }),
  });

/** Path-free identity of one exact durable tree generation. */
export const adoptTree = (logicalName: string, artifact: HashedTree): TreeAdoption =>
  Object.freeze({
    protocol: adoptionProtocol,
    kind: "tree" as const,
    logicalName: checkedLogicalName(logicalName),
    totalBytes: artifact.totalBytes,
    manifestDigest: Object.freeze({ ...artifact.manifestDigest }),
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDecimalBytes = (value: unknown): value is DecimalBytes =>
  typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);

const isDigest = (value: unknown): value is Digest =>
  isRecord(value)
  && value.algorithm === "sha256"
  && typeof value.value === "string"
  && /^[0-9a-f]{64}$/u.test(value.value);

const isAbsolute = Schema.is(AbsolutePath);
const isPortable = Schema.is(PortableRelativePath);

const isContentIdentity = (value: unknown): boolean =>
  isRecord(value) && isDecimalBytes(value.bytes) && isDigest(value.digest);

const isParticipantIdentity = (value: unknown): boolean =>
  isRecord(value)
  && [value.role, value.name, value.version, value.revision, value.channel].every(
    (field) => typeof field === "string" && field.length > 0 && !field.includes("\0"),
  )
  && isContentIdentity(value.content);

const isCapabilityObservation = (value: unknown): boolean => {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return false;
  if (value._tag === "Present") return typeof value.evidence === "string";
  if (value._tag === "Missing" || value._tag === "Indeterminate") return typeof value.reason === "string";
  return false;
};

const isToolObservation = (value: unknown): value is ToolObservation<string> =>
  isRecord(value)
  && typeof value.name === "string"
  && value.name.length > 0
  && Array.isArray(value.participants)
  && value.participants.length > 0
  && value.participants.every(isParticipantIdentity)
  && Array.isArray(value.capabilities)
  && value.capabilities.every(isCapabilityObservation);

export const isProvenance = (value: unknown): value is Provenance =>
  isToolObservation(value)
  || (
    isRecord(value)
    && value._tag === "IntrinsicProvenance"
    && typeof value.producer === "string"
    && value.producer.length > 0
    && !value.producer.includes("\0")
  );

const isDirectFilePublication = (value: unknown): value is DirectFilePublication =>
  isRecord(value)
  && value.scope === "file"
  && value.commit === "same-parent-no-replace-link"
  && value.committed === true;

const isTreePublication = (value: unknown): value is TreePublication =>
  isRecord(value)
  && value.scope === "tree"
  && value.commit === "same-parent-rename"
  && value.committed === true;

const projectedFilePath = (root: AbsolutePath, relativePath: PortableRelativePath): string => {
  const separator = root.startsWith("/") ? "/" : "\\";
  return `${root.endsWith(separator) ? root : `${root}${separator}`}${relativePath.replaceAll("/", separator)}`;
};

const isTreeFileProjectionPublication = (
  value: unknown,
  filePath: AbsolutePath,
): value is TreeFileProjectionPublication =>
  isRecord(value)
  && value.scope === "tree-file-projection"
  && value.commit === "same-parent-rename"
  && value.committed === true
  && typeof value.treeRoot === "string"
  && isAbsolute(value.treeRoot)
  && typeof value.relativePath === "string"
  && isPortable(value.relativePath)
  && isDigest(value.treeManifestDigest)
  && projectedFilePath(value.treeRoot, value.relativePath) === filePath;

const isUnhashedFileIdentity = (value: unknown): value is UnhashedFileIdentity =>
  isRecord(value) && typeof value.path === "string" && isAbsolute(value.path) && isDecimalBytes(value.bytes);

const isHashedFileIdentity = (value: unknown): value is HashedFileIdentity =>
  isRecord(value) && isUnhashedFileIdentity(value) && isDigest(value.digest);

export const isHashedFileObservation = (value: unknown): value is HashedFileObservation =>
  isRecord(value)
  && isHashedFileIdentity(value)
  && value._tag === "HashedFileObservation"
  && value.kind === "file";

export const isHashedFile = (value: unknown): value is HashedFile =>
  isRecord(value)
  && isHashedFileIdentity(value)
  && value._tag === "HashedFile"
  && isProvenance(value.provenance)
  && (
    isDirectFilePublication(value.publication)
    || isTreeFileProjectionPublication(value.publication, value.path)
  );

const isFileMode = (value: unknown): value is FileMode =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0o7777;

export const FileModeSchema = Schema.declare<FileMode>(isFileMode, { title: "FileMode" });

const pathEncoder = new TextEncoder();
const comparePortablePath = (left: string, right: string): number => {
  const a = pathEncoder.encode(left);
  const b = pathEncoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.byteLength - b.byteLength;
};

const isTreeEntry = (value: unknown): value is HashedTreeEntry => {
  if (!isRecord(value) || typeof value.relativePath !== "string" || !isPortable(value.relativePath)) return false;
  if (value.kind === "directory") return isFileMode(value.mode);
  if (value.kind === "symbolic-link") {
    return typeof value.target === "string" && value.target.length > 0 && !value.target.includes("\0");
  }
  return value.kind === "file"
    && isFileMode(value.mode)
    && isDecimalBytes(value.bytes)
    && isDigest(value.digest);
};

const hasCanonicalTreeEntries = (entries: readonly HashedTreeEntry[]): boolean => {
  let previous: string | undefined;
  const folded = new Set<string>();
  for (const entry of entries) {
    if (previous !== undefined && comparePortablePath(previous, entry.relativePath) >= 0) return false;
    previous = entry.relativePath;
    const key = entry.relativePath.toLowerCase();
    if (folded.has(key)) return false;
    folded.add(key);
  }
  return true;
};

export const isHashedTreeObservation = (value: unknown): value is HashedTreeObservation => {
  if (
    !isRecord(value)
    || value._tag !== "HashedTreeObservation"
    || typeof value.root !== "string"
    || !isAbsolute(value.root)
    || !isFileMode(value.rootMode)
    || !Array.isArray(value.entries)
    || !value.entries.every(isTreeEntry)
    || !isDecimalBytes(value.totalBytes)
    || !isDigest(value.manifestDigest)
  ) return false;
  if (!hasCanonicalTreeEntries(value.entries)) return false;
  const observedTotal = value.entries.reduce(
    (total, entry) => entry.kind === "file" ? total + BigInt(entry.bytes) : total,
    0n,
  );
  return `${observedTotal}` === value.totalBytes;
};

export const isHashedTree = (value: unknown): value is HashedTree =>
  isRecord(value)
  && value._tag === "HashedTree"
  && isHashedTreeObservation({ ...value, _tag: "HashedTreeObservation" })
  && isProvenance(value.provenance)
  && isTreePublication(value.publication);

export const isHashedExecutable = (value: unknown): value is HashedExecutable => {
  if (
    !isRecord(value)
    || value._tag !== "HashedExecutable"
    || !isHashedFileIdentity(value)
    || !isProvenance(value.provenance)
    || !isDirectFilePublication(value.publication)
    || (value.nativeFormat !== "elf" && value.nativeFormat !== "mach-o" && value.nativeFormat !== "pe")
    || !isRecord(value.runtime)
    || typeof value.runtime.name !== "string"
    || value.runtime.name.length === 0
    || typeof value.runtime.version !== "string"
    || value.runtime.version.length === 0
    || typeof value.target !== "string"
  ) return false;
  return Schema.is(SystemTargetSchema)(value.target)
    && describeSystemTarget(value.target).nativeFormat === value.nativeFormat;
};

export const DecimalBytesSchema = Schema.declare<DecimalBytes>(isDecimalBytes, { title: "DecimalBytes" });
export const DigestSchema = Schema.declare<Digest>(isDigest, { title: "Sha256Digest" });
export const ProvenanceSchema = Schema.declare<Provenance>(isProvenance, { title: "ArtifactProvenance" });
export const HashedFileObservationSchema = Schema.declare<HashedFileObservation>(isHashedFileObservation, {
  title: "HashedFileObservation",
});
export const HashedFileSchema = Schema.declare<HashedFile>(isHashedFile, { title: "HashedFile" });
export const HashedTreeObservationSchema = Schema.declare<HashedTreeObservation>(isHashedTreeObservation, {
  title: "HashedTreeObservation",
});
export const HashedTreeSchema = Schema.declare<HashedTree>(isHashedTree, { title: "HashedTree" });
export const HashedExecutableSchema = Schema.declare<HashedExecutable>(isHashedExecutable, {
  title: "HashedExecutable",
});
