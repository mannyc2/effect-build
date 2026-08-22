import { Cause, Crypto, Effect, FileSystem, Path, Semaphore } from "effect";
import type { AbsolutePath, Digest, ObservationMode } from "effect-build/Artifact";
import type { DecimalBytes } from "effect-build/Author/Tool";
import type { SupportedTarget } from "./compatibility.js";

export interface ExecutableCandidateMissing {
  readonly _tag: "ExecutableCandidateMissing";
  readonly stagedPath: AbsolutePath;
}

export interface ExecutableCandidateChanged {
  readonly _tag: "ExecutableCandidateChanged";
  readonly stagedPath: AbsolutePath;
}

export interface ExecutableInspectionFailed {
  readonly _tag: "ExecutableInspectionFailed";
  readonly stagedPath: AbsolutePath;
  readonly reason: string;
}

export interface ExecutableDestinationLocked {
  readonly _tag: "ExecutableDestinationLocked";
  readonly destination: AbsolutePath;
}

export interface ExecutableCommitFailed {
  readonly _tag: "ExecutableCommitFailed";
  readonly destination: AbsolutePath;
  readonly reason: string;
}

export type ExecutableFailure =
  | ExecutableCandidateMissing
  | ExecutableCandidateChanged
  | ExecutableInspectionFailed
  | ExecutableDestinationLocked
  | ExecutableCommitFailed;

interface PublishedExecutableFields<Mode extends ObservationMode> {
  readonly _tag: Mode extends "hashed" ? "HashedExecutable" : "UnhashedExecutable";
  readonly path: AbsolutePath;
  readonly bytes: DecimalBytes;
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: { readonly name: "bun"; readonly version: string };
  readonly target: SupportedTarget;
  readonly publication: { readonly commit: "same-parent-rename"; readonly committed: true };
}

export type PublishedExecutable<Mode extends ObservationMode> =
  & PublishedExecutableFields<Mode>
  & (Mode extends "hashed" ? { readonly digest: Digest } : {});

interface NativeObservation {
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly abi?: "gnu" | "musl";
}

interface ContentObservation {
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
  readonly contents: Uint8Array;
}

const publicationSemaphore = Semaphore.makeUnsafe(1);
const lockedReasons = new Set(["Busy", "PermissionDenied", "WouldBlock"]);
const lockedErrnoCodes = new Set(["EACCES", "EBUSY", "EPERM"]);

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const decimalBytes = (value: bigint): DecimalBytes => String(value) as DecimalBytes;

const sha256Digest = (value: string): Digest => ({ algorithm: "sha256", value: value as Digest["value"] });

const failureReason = (error: { readonly reason: { readonly _tag: string } }): string => {
  const reason = error.reason;
  if ("cause" in reason && typeof reason.cause === "object" && reason.cause !== null && "code" in reason.cause) {
    const code = (reason.cause as { readonly code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return reason._tag;
};

const isNotFound = (error: { readonly reason: { readonly _tag: string } }): boolean => error.reason._tag === "NotFound";

const isLocked = (error: { readonly reason: { readonly _tag: string } }): boolean => {
  const reason = failureReason(error);
  return lockedReasons.has(error.reason._tag) || lockedErrnoCodes.has(reason);
};

const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const u16 = (bytes: Uint8Array, offset: number, little = true): number => {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("truncated-header");
  return little ? bytes[offset]! | bytes[offset + 1]! << 8 : bytes[offset]! << 8 | bytes[offset + 1]!;
};

const u32 = (bytes: Uint8Array, offset: number, little = true): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("truncated-header");
  return little
    ? (bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16 | bytes[offset + 3]! << 24) >>> 0
    : (bytes[offset]! << 24 | bytes[offset + 1]! << 16 | bytes[offset + 2]! << 8 | bytes[offset + 3]!) >>> 0;
};

const u64 = (bytes: Uint8Array, offset: number, little = true): number => {
  const low = u32(bytes, little ? offset : offset + 4, little);
  const high = u32(bytes, little ? offset + 4 : offset, little);
  const value = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(value)) throw new Error("header-offset-overflow");
  return value;
};

const inspectElf = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 64) throw new Error("truncated-header");
  const elfClass = bytes[4];
  const encoding = bytes[5];
  if ((elfClass !== 1 && elfClass !== 2) || (encoding !== 1 && encoding !== 2)) {
    throw new Error("invalid-elf-header");
  }
  const little = encoding === 1;
  const machine = u16(bytes, 18, little);
  const architecture = machine === 62 ? "x64" : machine === 183 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  const programOffset = elfClass === 2 ? u64(bytes, 32, little) : u32(bytes, 28, little);
  const entrySize = u16(bytes, elfClass === 2 ? 54 : 42, little);
  const entryCount = u16(bytes, elfClass === 2 ? 56 : 44, little);
  const expectedEntrySize = elfClass === 2 ? 56 : 32;
  if (entryCount === 0 || entryCount > 4096 || entrySize !== expectedEntrySize) {
    throw new Error("invalid-program-headers");
  }
  if (programOffset + entrySize * entryCount > bytes.byteLength) throw new Error("truncated-header");
  let interpreter: string | undefined;
  for (let index = 0; index < entryCount; index++) {
    const entry = programOffset + index * entrySize;
    if (u32(bytes, entry, little) !== 3) continue;
    if (interpreter !== undefined) throw new Error("multiple-elf-interpreters");
    const offset = elfClass === 2 ? u64(bytes, entry + 8, little) : u32(bytes, entry + 4, little);
    const length = elfClass === 2 ? u64(bytes, entry + 32, little) : u32(bytes, entry + 16, little);
    if (length === 0 || length > 4096 || offset + length > bytes.byteLength) throw new Error("invalid-interpreter");
    const value = bytes.subarray(offset, offset + length);
    const terminator = value.indexOf(0);
    interpreter = new TextDecoder().decode(terminator < 0 ? value : value.subarray(0, terminator));
  }
  const abi = interpreter?.includes("musl") === true
    ? "musl"
    : interpreter?.includes("ld-linux") === true
    ? "gnu"
    : undefined;
  return { nativeFormat: "elf", os: "linux", architecture, ...(abi === undefined ? {} : { abi }) };
};

const inspectMacho = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 8) throw new Error("truncated-header");
  const magic = u32(bytes, 0, false);
  if (magic === 0xcafebabf || magic === 0xbfbafeca) throw new Error("unsupported-fat64");
  if (magic === 0xcafebabe || magic === 0xbebafeca) {
    const little = magic === 0xbebafeca;
    const count = u32(bytes, 4, little);
    const tableEnd = 8 + count * 20;
    if (count === 0 || count > 4096 || tableEnd > bytes.byteLength) throw new Error("invalid-fat-header");
    const architectures = new Set<"x64" | "aarch64">();
    const slices: Array<{ readonly cpu: number; readonly offset: number; readonly end: number }> = [];
    for (let index = 0; index < count; index++) {
      const entry = 8 + index * 20;
      const cpu = u32(bytes, entry, little);
      const offset = u32(bytes, entry + 8, little);
      const size = u32(bytes, entry + 12, little);
      const end = offset + size;
      if (size < 8 || offset < tableEnd || end > bytes.byteLength) throw new Error("invalid-fat-slice-range");
      slices.push({ cpu, offset, end });
      if (cpu === 0x01000007) architectures.add("x64");
      if (cpu === 0x0100000c) architectures.add("aarch64");
    }
    const ordered = [...slices].sort((left, right) => left.offset - right.offset);
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index]!.offset < ordered[index - 1]!.end) throw new Error("overlapping-fat-slices");
    }
    if (architectures.size !== 1) throw new Error("ambiguous-fat-architecture");
    const architecture = [...architectures][0]!;
    const cpu = architecture === "x64" ? 0x01000007 : 0x0100000c;
    const selected = slices.find((slice) => slice.cpu === cpu)!;
    if (
      bytes[selected.offset] !== 0xcf || bytes[selected.offset + 1] !== 0xfa
      || bytes[selected.offset + 2] !== 0xed || bytes[selected.offset + 3] !== 0xfe
      || u32(bytes, selected.offset + 4, true) !== cpu
    ) throw new Error("invalid-fat-slice");
    return { nativeFormat: "mach-o", os: "macos", architecture };
  }
  const cpu = u32(bytes, 4, true);
  const architecture = cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { nativeFormat: "mach-o", os: "macos", architecture };
};

const inspectPe = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 64) throw new Error("truncated-header");
  const offset = u32(bytes, 60, true);
  if (
    offset + 6 > bytes.byteLength || bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x45
    || bytes[offset + 2] !== 0 || bytes[offset + 3] !== 0
  ) throw new Error("invalid-pe-signature");
  const machine = u16(bytes, offset + 4, true);
  const architecture = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { nativeFormat: "pe", os: "windows", architecture };
};

const inspectNativeExecutable = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 4) throw new Error("truncated-header");
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return inspectElf(bytes);
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return inspectPe(bytes);
  if (
    bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe
    || bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && (bytes[3] === 0xbe || bytes[3] === 0xbf)
    || bytes[0] === 0xbe && bytes[1] === 0xba && bytes[2] === 0xfe && bytes[3] === 0xca
    || bytes[0] === 0xbf && bytes[1] === 0xba && bytes[2] === 0xfe && bytes[3] === 0xca
  ) return inspectMacho(bytes);
  throw new Error("invalid-native-magic");
};

const targetDescriptor = (target: SupportedTarget): NativeObservation => {
  switch (target) {
    case "macos-x64":
      return { nativeFormat: "mach-o", os: "macos", architecture: "x64" };
    case "macos-aarch64":
      return { nativeFormat: "mach-o", os: "macos", architecture: "aarch64" };
    case "linux-x64-gnu":
      return { nativeFormat: "elf", os: "linux", architecture: "x64", abi: "gnu" };
    case "linux-x64-musl":
      return { nativeFormat: "elf", os: "linux", architecture: "x64", abi: "musl" };
    case "linux-aarch64-gnu":
      return { nativeFormat: "elf", os: "linux", architecture: "aarch64", abi: "gnu" };
    case "windows-x64":
      return { nativeFormat: "pe", os: "windows", architecture: "x64" };
  }
};

const matches = (target: SupportedTarget, observation: NativeObservation): boolean => {
  const expected = targetDescriptor(target);
  return expected.os === observation.os && expected.architecture === observation.architecture
    && (observation.abi === undefined || expected.abi === observation.abi);
};

const resolveTarget = (
  requested: SupportedTarget | undefined,
  observed: NativeObservation,
): SupportedTarget | undefined => {
  if (requested !== undefined) return matches(requested, observed) ? requested : undefined;
  const candidates: readonly SupportedTarget[] = [
    "macos-x64",
    "macos-aarch64",
    "linux-x64-gnu",
    "linux-x64-musl",
    "linux-aarch64-gnu",
    "windows-x64",
  ];
  const matching = candidates.filter((candidate) => matches(candidate, observed));
  return matching.length === 1 ? matching[0] : undefined;
};

const observe = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  stagedPath: AbsolutePath,
): Effect.Effect<ContentObservation, ExecutableCandidateMissing | ExecutableInspectionFailed> =>
  Effect.gen(function*() {
    const information = yield* fileSystem.stat(stagedPath).pipe(
      Effect.mapError((error): ExecutableCandidateMissing | ExecutableInspectionFailed =>
        isNotFound(error)
          ? { _tag: "ExecutableCandidateMissing", stagedPath }
          : { _tag: "ExecutableInspectionFailed", stagedPath, reason: `stat:${failureReason(error)}` }
      ),
    );
    if (information.type !== "File") {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "not-regular-file",
      });
    }
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "not-executable",
      });
    }
    if (information.size < 0n) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "invalid-byte-count",
      });
    }
    const contents = yield* fileSystem.readFile(stagedPath).pipe(
      Effect.mapError((error): ExecutableInspectionFailed => ({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: `read:${failureReason(error)}`,
      })),
    );
    if (BigInt(contents.byteLength) !== information.size) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "size-changed-during-read",
      });
    }
    const hash = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((): ExecutableInspectionFailed => ({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "sha256-digest-unavailable",
      })),
    );
    return { bytes: decimalBytes(information.size), digest: sha256Digest(hex(hash)), contents };
  });

const sameContent = (left: ContentObservation, right: ContentObservation): boolean =>
  left.bytes === right.bytes && left.digest.value === right.digest.value;

const withExeSuffix = (basename: string, target: SupportedTarget | undefined): string =>
  target === "windows-x64" && !basename.toLowerCase().endsWith(".exe") ? `${basename}.exe` : basename;

export const publishExecutable = <Mode extends ObservationMode, ProviderFailure>(
  input: {
    readonly outfile: string;
    readonly cwd?: string;
    readonly observation: Mode;
    readonly runtimeVersion: string;
    readonly requestedTarget?: SupportedTarget;
    readonly produce: (stagedPath: AbsolutePath) => Effect.Effect<void, ProviderFailure>;
  },
): Effect.Effect<
  PublishedExecutable<Mode>,
  ProviderFailure | ExecutableFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const destination = path.normalize(path.resolve(input.cwd ?? "", input.outfile)) as AbsolutePath;
      const parent = path.dirname(destination);
      yield* mapFailureCause(
        fileSystem.makeDirectory(parent, { recursive: true }),
        (error): ExecutableCommitFailed => ({
          _tag: "ExecutableCommitFailed",
          destination,
          reason: `make-directory:${failureReason(error)}`,
        }),
      );
      const staging = yield* mapFailureCause(
        fileSystem.makeTempDirectoryScoped({ directory: parent, prefix: ".effect-build-" }),
        (error): ExecutableCommitFailed => ({
          _tag: "ExecutableCommitFailed",
          destination,
          reason: `make-staging:${failureReason(error)}`,
        }),
      );
      const stagedPath = path.join(
        staging,
        withExeSuffix(path.basename(destination), input.requestedTarget),
      ) as AbsolutePath;
      yield* input.produce(stagedPath);
      const first = yield* observe(fileSystem, crypto, path, stagedPath);
      const inspected = yield* Effect.try({
        try: () => inspectNativeExecutable(first.contents),
        catch: (error): ExecutableInspectionFailed => ({
          _tag: "ExecutableInspectionFailed",
          stagedPath,
          reason: error instanceof Error ? error.message : "invalid-native-executable",
        }),
      });
      const target = resolveTarget(input.requestedTarget, inspected);
      if (target === undefined) {
        return yield* Effect.fail<ExecutableInspectionFailed>({
          _tag: "ExecutableInspectionFailed",
          stagedPath,
          reason: input.requestedTarget === undefined
            ? "native-target-is-ambiguous-or-unsupported"
            : "native-target-does-not-match-requested-target",
        });
      }
      const second = yield* observe(fileSystem, crypto, path, stagedPath).pipe(
        Effect.mapError((error): ExecutableCandidateChanged | ExecutableInspectionFailed =>
          error._tag === "ExecutableCandidateMissing"
            ? { _tag: "ExecutableCandidateChanged", stagedPath }
            : error
        ),
      );
      if (!sameContent(first, second)) {
        return yield* Effect.fail<ExecutableCandidateChanged>({ _tag: "ExecutableCandidateChanged", stagedPath });
      }
      yield* publicationSemaphore.withPermit(fileSystem.rename(stagedPath, destination)).pipe(
        Effect.mapError((error): ExecutableDestinationLocked | ExecutableCommitFailed =>
          isLocked(error)
            ? { _tag: "ExecutableDestinationLocked", destination }
            : { _tag: "ExecutableCommitFailed", destination, reason: `rename:${failureReason(error)}` }
        ),
      );
      const artifact = {
        _tag: input.observation === "hashed" ? "HashedExecutable" : "UnhashedExecutable",
        path: destination,
        bytes: first.bytes,
        nativeFormat: inspected.nativeFormat,
        runtime: { name: "bun", version: input.runtimeVersion },
        target,
        publication: { commit: "same-parent-rename", committed: true },
        ...(input.observation === "hashed" ? { digest: first.digest } : {}),
      };
      return artifact as PublishedExecutable<Mode>;
    }),
  );
