import { Cause, Effect, FileSystem, Path, Schema } from "effect";
import type * as CoreArtifact from "effect-build/Artifact";
import * as ArtifactBinding from "./internal/ArtifactBinding.js";
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
  readonly startedAtEpochMillis: number;
  readonly completedAtEpochMillis: number;
  readonly exitCode: number;
  readonly stdout: OutputObservation;
  readonly stderr: OutputObservation;
}

export interface MutationProvenance {
  readonly operation: string;
  readonly startedAtEpochMillis: number;
  readonly completedAtEpochMillis: number;
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
/** Shared public failure set for authenticated staging and publication. */
export type LifecycleError = ArtifactError | AppleInputInvalid | ArtifactPublishFailed | ToolError;

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

const readAt = (
  path: string,
  offset: number,
  length: number,
): Effect.Effect<Uint8Array, ArtifactObservationFailed, FileSystem.FileSystem> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const file = yield* mapFailureCause(fileSystem.open(path, { flag: "r" }), path);
      if (offset !== 0) yield* mapFailureCause(file.seek(offset, "start"), path);
      const buffer = new Uint8Array(length);
      let read = 0;
      while (read < length) {
        const amount = Number(yield* mapFailureCause(file.read(buffer.subarray(read)), path));
        if (amount === 0) break;
        read += amount;
      }
      return read === length ? buffer : buffer.slice(0, read);
    }),
  );

const matches = (actual: Uint8Array, expected: readonly number[]): boolean =>
  actual.length === expected.length && expected.every((byte, index) => actual[index] === byte);

const machOMagic = [
  [0xfe, 0xed, 0xfa, 0xce],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xcf, 0xfa, 0xed, 0xfe],
] as const;
const littleEndianMachOMagic = [
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
] as const;
const cpuTypeX86_64 = 0x01000007;
const cpuTypeArm64 = 0x0100000c;
const zipMagic = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
] as const;
const xarMagic = [0x78, 0x61, 0x72, 0x21] as const;
const udifMagic = [0x6b, 0x6f, 0x6c, 0x79] as const;

const validateFileKind = (
  kind: FileArtifactKind,
  path: string,
  identity: FileIdentity,
): Effect.Effect<void, ArtifactObservationFailed, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    if (kind === "resource" || kind === "entitlements") return;
    if (kind === "mach-o" && (identity.mode & 0o111) === 0) {
      return yield* new ArtifactObservationFailed({ path, reason: "Mach-O file is not executable" });
    }
    if (kind === "disk-image" && identity.bytes < 512) {
      return yield* new ArtifactObservationFailed({ path, reason: "UDIF disk image is missing its 512-byte trailer" });
    }
    const magic = kind === "disk-image"
      ? yield* readAt(path, identity.bytes - 512, 4)
      : yield* readAt(path, 0, 4);
    const valid = kind === "mach-o"
      ? machOMagic.some((candidate) => matches(magic, candidate))
      : kind === "zip"
      ? zipMagic.some((candidate) => matches(magic, candidate))
      : kind === "disk-image"
      ? matches(magic, udifMagic)
      : matches(magic, xarMagic);
    if (!valid) {
      return yield* new ArtifactObservationFailed({
        path,
        reason: kind === "mach-o"
          ? "unrecognized Mach-O magic"
          : kind === "zip"
          ? "unrecognized ZIP PK header"
          : kind === "disk-image"
          ? "UDIF disk image is missing the koly trailer"
          : "flat installer package is missing the XAR header",
      });
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const information = yield* mapFailureCause(fileSystem.stat(path), path);
    if (
      information.type !== "File" || Number(information.size) !== identity.bytes
      || mode(Number(information.mode)) !== identity.mode
    ) {
      return yield* new ArtifactObservationFailed({ path, reason: "file metadata changed during format validation" });
    }
  });

const readMachOCpuType = (
  path: string,
): Effect.Effect<number, ArtifactObservationFailed, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const header = yield* readAt(path, 0, 8);
    if (header.length !== 8) {
      return yield* new ArtifactObservationFailed({ path, reason: "Mach-O header is truncated before cputype" });
    }
    const magic = header.subarray(0, 4);
    const littleEndian = littleEndianMachOMagic.some((candidate) => matches(magic, candidate));
    return new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(4, littleEndian);
  });

const entryInformation = (
  path: string,
): Effect.Effect<FileSystem.File.Info, ArtifactObservationFailed, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    if ((yield* Effect.option(fileSystem.readLink(path)))._tag === "Some") {
      return yield* new ArtifactObservationFailed({ path, reason: "critical app-bundle entry must not be a symlink" });
    }
    return yield* mapFailureCause(fileSystem.stat(path), path);
  });

const validateAppBundle = (
  canonical: string,
): Effect.Effect<void, ArtifactObservationFailed, ArtifactServices> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const name = path.basename(canonical);
    if (!name.endsWith(".app") || name.length <= 4) {
      return yield* new ArtifactObservationFailed({ path: canonical, reason: "app bundle name must end in .app" });
    }
    const contents = path.join(canonical, "Contents");
    const contentsInformation = yield* entryInformation(contents);
    if (contentsInformation.type !== "Directory") {
      return yield* new ArtifactObservationFailed({ path: contents, reason: "Contents must be a directory" });
    }
    const informationPropertyList = path.join(contents, "Info.plist");
    const propertyListInformation = yield* entryInformation(informationPropertyList);
    if (propertyListInformation.type !== "File" || Number(propertyListInformation.size) === 0) {
      return yield* new ArtifactObservationFailed({
        path: informationPropertyList,
        reason: "Contents/Info.plist must be a nonempty regular file",
      });
    }
    const executables = path.join(contents, "MacOS");
    const executablesInformation = yield* entryInformation(executables);
    if (executablesInformation.type !== "Directory") {
      return yield* new ArtifactObservationFailed({ path: executables, reason: "Contents/MacOS must be a directory" });
    }
    const names = yield* mapFailureCause(fileSystem.readDirectory(executables), executables);
    let foundExecutable = false;
    for (const entry of names) {
      const candidate = path.join(executables, entry);
      if ((yield* Effect.option(fileSystem.readLink(candidate)))._tag === "Some") continue;
      const information = yield* mapFailureCause(fileSystem.stat(candidate), candidate);
      if (
        information.type === "File" && Number(information.size) > 0
        && (mode(Number(information.mode)) & 0o111) !== 0
      ) {
        foundExecutable = true;
        break;
      }
    }
    if (!foundExecutable) {
      return yield* new ArtifactObservationFailed({
        path: executables,
        reason: "Contents/MacOS must contain a nonempty executable file",
      });
    }
  });

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
    const identity = yield* observeFileIdentity(canonical);
    yield* validateFileKind(kind, canonical, identity);
    const confirmed = yield* observeFileIdentity(canonical);
    if (JSON.stringify(confirmed) !== JSON.stringify(identity)) {
      return yield* new ArtifactObservationFailed({ path: canonical, reason: "file changed during observation" });
    }
    return ArtifactBinding.file(kind, canonical, identity);
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
    const identity = yield* observeTreeIdentity(canonical);
    if (kind === "app-bundle") yield* validateAppBundle(canonical);
    const confirmed = yield* observeTreeIdentity(canonical);
    if (JSON.stringify(confirmed) !== JSON.stringify(identity)) {
      return yield* new ArtifactObservationFailed({ path: canonical, reason: "tree changed during observation" });
    }
    return ArtifactBinding.tree(kind, canonical, identity);
  });

/**
 * Authenticates a macOS executable emitted by an effect-build provider.
 * The provider digest is mandatory; this bridge independently re-observes the committed bytes.
 */
export const observeExecutable = (
  executable: CoreArtifact.Executable,
): Effect.Effect<FileArtifact<"mach-o">, ArtifactError | AppleInputInvalid, ArtifactServices> =>
  Effect.gen(function*() {
    if (executable._tag !== "Executable") {
      return yield* new AppleInputInvalid({
        operation: "Artifact.observeExecutable",
        field: "executable",
        reason: "expected an effect-build Executable",
      });
    }
    if (executable.target !== "macos-x64" && executable.target !== "macos-aarch64") {
      return yield* new AppleInputInvalid({
        operation: "Artifact.observeExecutable",
        field: "target",
        reason: `expected a macOS target, received ${executable.target}`,
      });
    }
    if (executable.digest?.algorithm !== "sha256" || !/^[0-9a-f]{64}$/u.test(executable.digest.value)) {
      return yield* new AppleInputInvalid({
        operation: "Artifact.observeExecutable",
        field: "digest",
        reason: "provider SHA-256 authentication is required",
      });
    }
    if (executable.sha256 !== executable.digest.value) {
      return yield* new AppleInputInvalid({
        operation: "Artifact.observeExecutable",
        field: "sha256",
        reason: "legacy SHA-256 projection does not match the authenticated digest",
      });
    }
    const observed = yield* observeFile("mach-o", executable.path);
    if (observed.identity.bytes !== executable.bytes || observed.identity.digest.value !== executable.digest.value) {
      return yield* new ArtifactChanged({
        path: executable.path,
        expected: JSON.stringify({ bytes: executable.bytes, sha256: executable.digest.value }),
        observed: JSON.stringify({ bytes: observed.identity.bytes, sha256: observed.identity.digest.value }),
      });
    }
    const cpuType = yield* readMachOCpuType(observed.path);
    const expectedCpuType = executable.target === "macos-x64" ? cpuTypeX86_64 : cpuTypeArm64;
    if (cpuType !== expectedCpuType) {
      return yield* new AppleInputInvalid({
        operation: "Artifact.observeExecutable",
        field: "target",
        reason: `provider target ${executable.target} does not match Mach-O cputype 0x${
          cpuType.toString(16).padStart(8, "0")
        }`,
      });
    }
    yield* revalidate(observed);
    return observed;
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
    if (!ArtifactBinding.has(artifact)) return yield* new UnauthenticatedArtifact({ path: artifact.path });
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
