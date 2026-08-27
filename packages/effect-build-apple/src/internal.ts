import { Context, Crypto, Effect, FileSystem, Option, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { PublishFailed, ToolFailed } from "effect-build/BuildError";
import type { ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import type { AppleToolOptions } from "./Model.js";
import { FileArtifactIdentityMismatch } from "./Model.js";
import type { Sha256 } from "./Model.js";

export type PlatformServices =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

export interface ResolvedTool {
  readonly executable: string;
  readonly tool: Artifact.Tool;
}

export interface VerifiedFileArtifact {
  readonly source: string;
  readonly contents: Uint8Array;
  readonly bytes: number;
  readonly sha256: Sha256;
}

const testedAppleVersions: Toolchain.TestedRange = { minimum: "15.0", before: "27.0" };

/** Resolve once, perform one harmless native probe, and retain exact caller-selected provenance. */
export const resolveAppleTool = (
  name: string,
  options: AppleToolOptions,
  probeArgs: readonly string[],
  toolName = name,
): Effect.Effect<
  ResolvedTool,
  ToolNotFound | ToolFailed,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const executable = yield* Toolchain.resolveExecutable({ name, executable: options.executable });
    yield* Toolchain.runOrFail({ tool: toolName, executable, args: probeArgs });
    yield* Toolchain.warnIfUntested({ tool: toolName, version: options.version, tested: testedAppleVersions });
    return { executable, tool: { name: toolName, version: options.version } };
  });

export const capturePlatformServices = Effect.gen(function*() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
    Context.add(Path.Path, path),
    Context.add(Crypto.Crypto, crypto),
    Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );
  return { fileSystem, path, services } as const;
});

export const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Independently verifies a core FileArtifact before an Apple operation reads or mutates it. */
export const verifyFileArtifact = (
  operation: string,
  artifact: Artifact.FileArtifact,
): Effect.Effect<
  VerifiedFileArtifact,
  FileArtifactIdentityMismatch,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = path.resolve(artifact.path);
    const expectedSha256 = artifact.sha256;
    const mismatch = (
      reason: string,
      observedBytes?: number,
      observedSha256?: Sha256,
    ): FileArtifactIdentityMismatch =>
      new FileArtifactIdentityMismatch({
        operation,
        path: source,
        expectedBytes: artifact.bytes,
        ...(
          expectedSha256 === undefined || !/^[0-9a-f]{64}$/.test(expectedSha256)
            ? {}
            : { expectedSha256: expectedSha256 as Sha256 }
        ),
        ...(observedBytes === undefined ? {} : { observedBytes }),
        ...(observedSha256 === undefined ? {} : { observedSha256 }),
        reason,
      });
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) {
      return yield* mismatch("finalized byte length is not a non-negative safe integer");
    }
    if (expectedSha256 === undefined || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
      return yield* mismatch("a lowercase finalized SHA-256 is required");
    }
    const information = yield* fileSystem.stat(source).pipe(
      Effect.mapError((error) => mismatch(`stat failed: ${describe(error)}`)),
    );
    if (information.type !== "File") return yield* mismatch(`expected a regular file, observed ${information.type}`);
    const statBytes = Number(information.size);
    if (statBytes !== artifact.bytes) {
      return yield* mismatch("finalized byte length does not match the observed file", statBytes);
    }
    const contents = yield* Toolchain.readVerifiedFile({
      path: source,
      bytes: artifact.bytes,
      sha256: expectedSha256,
    }).pipe(
      Effect.mapError((error) => mismatch(error.reason, statBytes)),
    );
    return { source, contents, bytes: contents.byteLength, sha256: expectedSha256 as Sha256 };
  });

export const publishFailure = (destination: string, action: string) => (error: unknown): PublishFailed =>
  new PublishFailed({ destination, reason: `${action}: ${describe(error)}` });

/** Preflight an exact pair destination so rollback never removes caller-owned state. */
export const ensureNewDestination = (
  destination: string,
): Effect.Effect<void, PublishFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved = path.resolve(destination);
    const link = yield* Effect.option(fileSystem.readLink(resolved));
    const exists = Option.isSome(link)
      ? true
      : yield* fileSystem.exists(resolved).pipe(
        Effect.mapError(publishFailure(resolved, "inspect exact pair destination")),
      );
    if (exists) {
      return yield* new PublishFailed({
        destination: resolved,
        reason: "destination already exists; exact pairs never overlay",
      });
    }
  });

export const scrub = (text: string, values: readonly string[]): string => {
  let result = text;
  for (const value of values) {
    if (value.length > 0) result = result.split(value).join("<redacted>");
  }
  return result;
};

export const scrubToolFailure = (error: ToolFailed, values: readonly string[]): ToolFailed =>
  new ToolFailed({
    tool: error.tool,
    exitCode: error.exitCode,
    stdout: scrub(error.stdout, values),
    stderr: scrub(error.stderr, values),
  });

export const isSafeRelative = (value: string): boolean => {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) return false;
  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

export const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
