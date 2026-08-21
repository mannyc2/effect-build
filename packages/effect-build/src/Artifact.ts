import { Schema } from "effect";
import type { SystemTarget } from "./SystemTarget.js";

export type { DecimalBytes, Digest, Sha256Value } from "./Author/Tool.js";
import type { DecimalBytes, Digest } from "./Author/Tool.js";

const isNormalizedSegment = (segment: string): boolean => segment.length > 0 && segment !== "." && segment !== "..";

const hasNormalizedSegments = (value: string, separator: "/" | "\\"): boolean => {
  const segments = value.split(separator);
  const last = segments.at(-1);
  const body = last === "" ? segments.slice(0, -1) : segments;
  return body.length > 0 && body.every(isNormalizedSegment);
};

const isNormalizedPosixAbsolutePath = (value: string): boolean => {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value === "/") return true;
  return hasNormalizedSegments(value.slice(1), "/");
};

const isNormalizedWindowsDriveAbsolutePath = (value: string): boolean => {
  if (!/^[A-Za-z]:\\/.test(value) || value.includes("/")) return false;
  if (value.length === 3) return true;
  return hasNormalizedSegments(value.slice(3), "\\");
};

const windowsVolumeGuid = /^Volume\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}\\/;

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
  if (value.startsWith("\\\\?\\UNC\\")) {
    return isNormalizedWindowsShare(value.slice("\\\\?\\UNC\\".length), false);
  }
  if (value.startsWith("\\\\?\\")) {
    return isNormalizedWindowsFilesystemNamespacePath(value.slice("\\\\?\\".length));
  }
  if (value.startsWith("\\\\.\\")) {
    return isNormalizedWindowsFilesystemNamespacePath(value.slice("\\\\.\\".length));
  }
  if (!value.startsWith("\\\\")) return false;
  return isNormalizedWindowsShare(value.slice(2), true);
};

const isAbsolutePath = (value: string): boolean =>
  value.length > 0
  && !value.includes("\0")
  && (
    isNormalizedPosixAbsolutePath(value)
    || isNormalizedWindowsDriveAbsolutePath(value)
    || isNormalizedWindowsUncAbsolutePath(value)
  );

/** A lexically absolute path normalized for one supported host path grammar. */
export const AbsolutePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      isAbsolutePath(value)
        ? true
        : "path must be absolute, normalized, non-empty, and contain no NUL"
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

interface RuntimeObservation {
  readonly name: string;
  readonly version: string;
}

interface ExecutableFields {
  readonly path: AbsolutePath;
  readonly bytes: DecimalBytes;
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: RuntimeObservation;
  readonly target: SystemTarget;
  readonly publication: {
    readonly commit: "same-parent-rename";
    readonly committed: true;
  };
}

export interface UnhashedExecutable extends ExecutableFields {
  readonly _tag: "UnhashedExecutable";
}

export interface HashedExecutable extends ExecutableFields {
  readonly _tag: "HashedExecutable";
  readonly digest: Digest;
}

export type Executable<Mode extends ObservationMode> = Mode extends "hashed" ? HashedExecutable
  : UnhashedExecutable;
