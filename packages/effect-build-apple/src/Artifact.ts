import { Cause, Effect, FileSystem, Path, Schema } from "effect";
import * as Sha256 from "./internal/Sha256.js";

export type ArtifactKind =
  | "mach-o"
  | "entitlements"
  | "resource"
  | "app-bundle"
  | "zip"
  | "disk-image"
  | "installer-package";

export type FileArtifactKind = Exclude<ArtifactKind, "app-bundle">;
export type TreeArtifactKind = "app-bundle" | "resource";

export interface Digest {
  readonly algorithm: "sha256";
  readonly value: string;
}

export interface FileIdentity {
  readonly _tag: "FileIdentity";
  readonly bytes: number;
  readonly mode: number;
  readonly digest: Digest;
}

export type TreeEntry =
  | { readonly _tag: "Directory"; readonly path: string; readonly mode: number }
  | {
    readonly _tag: "File";
    readonly path: string;
    readonly bytes: number;
    readonly mode: number;
    readonly digest: Digest;
  }
  | { readonly _tag: "SymbolicLink"; readonly path: string; readonly target: string };

export interface TreeIdentity {
  readonly _tag: "TreeIdentity";
  readonly entries: readonly TreeEntry[];
  readonly digest: Digest;
}

declare const ArtifactTypeId: unique symbol;

export interface FileArtifact<K extends FileArtifactKind = FileArtifactKind> {
  readonly _tag: "FileArtifact";
  readonly [ArtifactTypeId]: typeof ArtifactTypeId;
  readonly kind: K;
  readonly path: string;
  readonly identity: FileIdentity;
}

export interface TreeArtifact<K extends TreeArtifactKind = TreeArtifactKind> {
  readonly _tag: "TreeArtifact";
  readonly [ArtifactTypeId]: typeof ArtifactTypeId;
  readonly kind: K;
  readonly path: string;
  readonly identity: TreeIdentity;
}

export type Artifact = FileArtifact | TreeArtifact;
export type ArtifactServices = FileSystem.FileSystem | Path.Path;

export interface ArtifactReference {
  readonly kind: ArtifactKind;
  readonly path: string;
  readonly digest: Digest;
}

export interface OutputObservation {
  readonly text: string;
  readonly truncated: boolean;
}

export interface ToolReference {
  readonly name: string;
  readonly path: string;
  readonly sha256: Digest;
}

export interface ToolInvocation {
  readonly tool: ToolReference;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
  readonly exitCode: number;
  readonly stdout: OutputObservation;
  readonly stderr: OutputObservation;
}

export interface MutationProvenance {
  readonly operation: string;
  readonly inputs: readonly ArtifactReference[];
  readonly output: ArtifactReference;
  readonly tools: readonly ToolInvocation[];
}

export interface MutationResult<A extends Artifact = Artifact> {
  readonly artifact: A;
  readonly provenance: MutationProvenance;
}

export class ArtifactObservationFailed extends Schema.TaggedError<ArtifactObservationFailed>()(
  "ArtifactObservationFailed",
  { path: Schema.String, reason: Schema.String },
) {}

export class UnauthenticatedArtifact extends Schema.TaggedError<UnauthenticatedArtifact>()(
  "UnauthenticatedArtifact",
  { path: Schema.String },
) {}

export class ArtifactChanged extends Schema.TaggedError<ArtifactChanged>()("ArtifactChanged", {
  path: Schema.String,
  expected: Schema.String,
  observed: Schema.String,
}) {}

export class UnsupportedArtifactKind extends Schema.TaggedError<UnsupportedArtifactKind>()(
  "UnsupportedArtifactKind",
  { operation: Schema.String, actual: Schema.String, expected: Schema.Array(Schema.String) },
) {}

export class AppleInputInvalid extends Schema.TaggedError<AppleInputInvalid>()("AppleInputInvalid", {
  operation: Schema.String,
  field: Schema.String,
  reason: Schema.String,
}) {}

export class AppleIdentityInvalid extends Schema.TaggedError<AppleIdentityInvalid>()("AppleIdentityInvalid", {
  operation: Schema.String,
  identity: Schema.String,
  reason: Schema.String,
}) {}

export class ArtifactPublishFailed extends Schema.TaggedError<ArtifactPublishFailed>()(
  "ArtifactPublishFailed",
  { destination: Schema.String, reason: Schema.String },
) {}

export class AppleToolUnavailable extends Schema.TaggedError<AppleToolUnavailable>()(
  "AppleToolUnavailable",
  { tool: Schema.String, path: Schema.String, reason: Schema.String },
) {}

export class AppleToolChanged extends Schema.TaggedError<AppleToolChanged>()("AppleToolChanged", {
  tool: Schema.String,
  path: Schema.String,
  expected: Schema.String,
  observed: Schema.String,
}) {}

export class AppleToolFailed extends Schema.TaggedError<AppleToolFailed>()("AppleToolFailed", {
  tool: Schema.String,
  path: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {}

export type ArtifactError = ArtifactObservationFailed | UnauthenticatedArtifact | ArtifactChanged;
export type ToolError = AppleToolUnavailable | AppleToolChanged | AppleToolFailed;

const authenticated = new WeakSet<object>();
const fileKinds = new Set<FileArtifactKind>([
  "mach-o",
  "entitlements",
  "resource",
  "zip",
  "disk-image",
  "installer-package",
]);
const treeKinds = new Set<TreeArtifactKind>(["app-bundle", "resource"]);

const mode = (value: number): number => value & 0o7777;
const digest = (value: string): Digest => Object.freeze({ algorithm: "sha256" as const, value });
const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);
const mapFailureCause = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  path: string,
): Effect.Effect<A, ArtifactObservationFailed, R> =>
  Effect.catchCause(
    effect,
    (cause) =>
      Effect.failCause(Cause.map(cause, (error) => new ArtifactObservationFailed({ path, reason: describe(error) }))),
  );

const mintFile = <K extends FileArtifactKind>(kind: K, path: string, identity: FileIdentity): FileArtifact<K> => {
  const artifact = Object.freeze({ _tag: "FileArtifact" as const, kind, path, identity }) as FileArtifact<K>;
  authenticated.add(artifact);
  return artifact;
};

const mintTree = <K extends TreeArtifactKind>(kind: K, path: string, identity: TreeIdentity): TreeArtifact<K> => {
  const artifact = Object.freeze({ _tag: "TreeArtifact" as const, kind, path, identity }) as TreeArtifact<K>;
  authenticated.add(artifact);
  return artifact;
};

const observeFileIdentity = (
  canonical: string,
): Effect.Effect<FileIdentity, ArtifactObservationFailed, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const information = yield* mapFailureCause(fileSystem.stat(canonical), canonical);
    if (information.type !== "File") {
      return yield* new ArtifactObservationFailed({ path: canonical, reason: "expected a regular file" });
    }
    const hashed = yield* mapFailureCause(Sha256.file(canonical), canonical);
    if (hashed.bytes !== Number(information.size)) {
      return yield* new ArtifactObservationFailed({
        path: canonical,
        reason: "file size changed during hashing",
      });
    }
    return Object.freeze({
      _tag: "FileIdentity" as const,
      bytes: hashed.bytes,
      mode: mode(Number(information.mode)),
      digest: digest(hashed.value),
    });
  });

const observeTreeIdentity = (
  canonical: string,
): Effect.Effect<TreeIdentity, ArtifactObservationFailed, ArtifactServices> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rootInformation = yield* mapFailureCause(fileSystem.stat(canonical), canonical);
    if (rootInformation.type !== "Directory") {
      return yield* new ArtifactObservationFailed({ path: canonical, reason: "expected a directory" });
    }
    const entries: TreeEntry[] = [{ _tag: "Directory", path: "", mode: mode(Number(rootInformation.mode)) }];
    const visit = (
      directory: string,
      relative: string,
    ): Effect.Effect<void, ArtifactObservationFailed, FileSystem.FileSystem> =>
      Effect.gen(function*() {
        const names = yield* mapFailureCause(fileSystem.readDirectory(directory), directory);
        for (const name of [...names].sort()) {
          if (name === "." || name === ".." || name.includes(path.sep)) {
            return yield* new ArtifactObservationFailed({ path: directory, reason: `invalid directory entry ${name}` });
          }
          const absolute = path.join(directory, name);
          const entryPath = relative === "" ? name : `${relative}/${name}`;
          const link = yield* Effect.option(fileSystem.readLink(absolute));
          if (link._tag === "Some") {
            entries.push(Object.freeze({ _tag: "SymbolicLink", path: entryPath, target: link.value }));
            continue;
          }
          const information = yield* mapFailureCause(fileSystem.stat(absolute), absolute);
          if (information.type === "Directory") {
            entries.push(Object.freeze({
              _tag: "Directory",
              path: entryPath,
              mode: mode(Number(information.mode)),
            }));
            yield* visit(absolute, entryPath);
            continue;
          }
          if (information.type !== "File") {
            return yield* new ArtifactObservationFailed({
              path: absolute,
              reason: `unsupported tree entry type ${information.type}`,
            });
          }
          const hashed = yield* mapFailureCause(Sha256.file(absolute), absolute);
          if (hashed.bytes !== Number(information.size)) {
            return yield* new ArtifactObservationFailed({
              path: absolute,
              reason: "file size changed during hashing",
            });
          }
          entries.push(Object.freeze({
            _tag: "File",
            path: entryPath,
            bytes: hashed.bytes,
            mode: mode(Number(information.mode)),
            digest: digest(hashed.value),
          }));
        }
      });
    yield* visit(canonical, "");
    const frozenEntries = Object.freeze(entries);
    const manifest = new TextEncoder().encode(`effect-build-apple/tree/v1\n${JSON.stringify(frozenEntries)}`);
    return Object.freeze({
      _tag: "TreeIdentity" as const,
      entries: frozenEntries,
      digest: digest(Sha256.bytes(manifest)),
    });
  });

const canonicalPath = (input: string): Effect.Effect<string, ArtifactObservationFailed, ArtifactServices> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = path.normalize(path.resolve(input));
    const canonical = yield* mapFailureCause(fileSystem.realPath(absolute), absolute);
    return path.normalize(canonical);
  });

export const observeFile = <K extends FileArtifactKind>(
  kind: K,
  input: string,
): Effect.Effect<FileArtifact<K>, ArtifactObservationFailed | AppleInputInvalid, ArtifactServices> =>
  Effect.gen(function*() {
    if (!fileKinds.has(kind)) {
      return yield* new AppleInputInvalid({ operation: "Artifact.observeFile", field: "kind", reason: kind });
    }
    const canonical = yield* canonicalPath(input);
    return mintFile(kind, canonical, yield* observeFileIdentity(canonical));
  });

export const observeTree = <K extends TreeArtifactKind>(
  kind: K,
  input: string,
): Effect.Effect<TreeArtifact<K>, ArtifactObservationFailed | AppleInputInvalid, ArtifactServices> =>
  Effect.gen(function*() {
    if (!treeKinds.has(kind)) {
      return yield* new AppleInputInvalid({ operation: "Artifact.observeTree", field: "kind", reason: kind });
    }
    const canonical = yield* canonicalPath(input);
    return mintTree(kind, canonical, yield* observeTreeIdentity(canonical));
  });

export const isFileArtifact = (artifact: Artifact): artifact is FileArtifact => artifact._tag === "FileArtifact";
export const isTreeArtifact = (artifact: Artifact): artifact is TreeArtifact => artifact._tag === "TreeArtifact";
export const isKind = <K extends ArtifactKind>(
  artifact: Artifact,
  kind: K,
): artifact is Artifact & { readonly kind: K } => artifact.kind === kind;

export const reference = (artifact: Artifact): ArtifactReference =>
  Object.freeze({
    kind: artifact.kind,
    path: artifact.path,
    digest: artifact.identity.digest,
  });

export const revalidate = (
  artifact: Artifact,
): Effect.Effect<void, ArtifactError | AppleInputInvalid, ArtifactServices> =>
  Effect.gen(function*() {
    if (!authenticated.has(artifact)) return yield* new UnauthenticatedArtifact({ path: artifact.path });
    const observed = artifact._tag === "FileArtifact"
      ? yield* observeFile(artifact.kind, artifact.path)
      : yield* observeTree(artifact.kind, artifact.path);
    const expected = JSON.stringify({ path: artifact.path, identity: artifact.identity });
    const actual = JSON.stringify({ path: observed.path, identity: observed.identity });
    if (expected !== actual) {
      return yield* new ArtifactChanged({ path: artifact.path, expected, observed: actual });
    }
  });

export const sameIdentity = (left: Artifact, right: Artifact): boolean =>
  left._tag === right._tag
  && left.kind === right.kind
  && JSON.stringify(left.identity) === JSON.stringify(right.identity);
