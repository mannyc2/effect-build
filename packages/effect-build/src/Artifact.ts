import { Schema } from "effect";
import type { SystemTarget } from "./SystemTarget.js";

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

export type ObservationMode = "hashed" | "unhashed";

export interface UnhashedFile {
  readonly path: AbsolutePath;
  readonly bytes: DecimalBytes;
}

export interface HashedFile extends UnhashedFile {
  readonly digest: Digest;
}

export type File<Mode extends ObservationMode> = Mode extends "hashed" ? HashedFile : UnhashedFile;

export interface RuntimeObservation {
  readonly name: string;
  readonly version: string;
}

interface ExecutableFields {
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: RuntimeObservation;
  readonly target: SystemTarget;
  readonly publication: {
    readonly commit: "same-parent-rename";
    readonly committed: true;
  };
}

export interface UnhashedExecutable extends UnhashedFile, ExecutableFields {
  readonly _tag: "UnhashedExecutable";
}

export interface HashedExecutable extends HashedFile, ExecutableFields {
  readonly _tag: "HashedExecutable";
}

/** Durable bytes plus executable facts established by an executable inspector. */
export type Executable<Mode extends ObservationMode = ObservationMode> = Mode extends "hashed" ? HashedExecutable
  : UnhashedExecutable;
