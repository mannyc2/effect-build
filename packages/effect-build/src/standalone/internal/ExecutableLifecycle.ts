import {
  Cause,
  Crypto,
  Effect,
  type FileSystem,
  type Path,
  type PlatformError,
  Result,
  type Scope,
  Semaphore,
  Stream,
} from "effect";
import { OutputInvalid, OutputLocked, OutputMissing, PublicationFailed } from "../BuildError.js";
import {
  inspectNativeExecutableChunks,
  NativeExecutableInvalid,
  type NativeExecutableObservation,
  NativeExecutableRangeRequired,
} from "./NativeExecutable.js";

const CandidateTypeId: unique symbol = Symbol("effect-build/ExecutableCandidate");

export interface ExecutableCandidate {
  readonly staged: string;
  readonly [CandidateTypeId]: typeof CandidateTypeId;
}

export interface ExecutableFile<Target> {
  readonly path: string;
  readonly bytes: number;
  readonly target: Target;
  readonly digest?: `sha256:${string}`;
}

export interface NativeExecutableInspectionError {
  readonly path: string;
  readonly reason: string;
}

interface CandidateState {
  readonly destination: string;
  readonly publish: Effect.Effect<void, OutputLocked | PublicationFailed>;
}

const candidateStates = new WeakMap<ExecutableCandidate, CandidateState>();

const lockedReasons = new Set(["Busy", "PermissionDenied", "WouldBlock"]);
const lockedErrnoCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
const publicationSemaphore = Semaphore.makeUnsafe(1);

const errnoCode = (error: PlatformError.PlatformError): string | undefined => {
  const cause = "cause" in error.reason ? error.reason.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
};

/** Rename failures with these reasons indicate the destination is locked, not broken. */
export const isLockedRenameError = (error: PlatformError.PlatformError): boolean =>
  lockedReasons.has(error.reason._tag)
  || (error.reason._tag === "Unknown" && lockedErrnoCodes.has(errnoCode(error) ?? ""));

export type LifecyclePublicationOperation =
  | "make-directory"
  | "make-staging"
  | "rename"
  | "resolve-destination-parent";

export const makePublicationFailed =
  (path: string, operation: LifecyclePublicationOperation) =>
  (error: { readonly message: string }): PublicationFailed =>
    new PublicationFailed({ path, operation, reason: error.message });

const withExeSuffix = (basename: string, executableSuffix: "" | ".exe"): string =>
  executableSuffix === ".exe" && !basename.toLowerCase().endsWith(".exe")
    ? `${basename}.exe`
    : basename;

export const resolveExecutableDestination = (
  path: Path.Path,
  input: { readonly outfile: string; readonly cwd?: string },
): string => path.normalize(path.resolve(input.cwd ?? "", input.outfile));

export const acquireExecutableCandidate = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  options: { readonly destination: string; readonly executableSuffix?: "" | ".exe" },
): Effect.Effect<ExecutableCandidate, PublicationFailed, Scope.Scope> =>
  Effect.gen(function*() {
    const destination = options.destination;
    const executableSuffix = options.executableSuffix ?? "";
    const parent = path.dirname(destination);
    yield* fileSystem.makeDirectory(parent, { recursive: true }).pipe(
      Effect.mapError(makePublicationFailed(destination, "make-directory")),
    );
    const stagingDirectory = yield* fileSystem.makeTempDirectoryScoped({
      directory: parent,
      prefix: ".effect-build-",
    }).pipe(Effect.mapError(makePublicationFailed(destination, "make-staging")));
    const staged = path.join(stagingDirectory, withExeSuffix(path.basename(destination), executableSuffix));
    const candidate = Object.freeze({ staged, [CandidateTypeId]: CandidateTypeId }) as ExecutableCandidate;
    const publish = publicationSemaphore.withPermit(fileSystem.rename(staged, destination)).pipe(
      Effect.mapError((error) =>
        isLockedRenameError(error)
          ? new OutputLocked({ path: destination })
          : makePublicationFailed(destination, "rename")(error)
      ),
    );
    return yield* Effect.acquireRelease(
      Effect.sync(() => {
        candidateStates.set(candidate, { destination, publish });
        return candidate;
      }),
      (registered) => Effect.sync(() => candidateStates.delete(registered)),
    );
  });

const collectRange = (fileSystem: FileSystem.FileSystem, file: string, offset: number, bytesToRead: number) =>
  fileSystem.stream(file, { offset, bytesToRead }).pipe(
    Stream.runFold(
      () => ({ chunks: [] as Array<Uint8Array>, byteLength: 0, excess: false }),
      (collected, chunk) => {
        if (collected.excess || chunk.byteLength === 0) return collected;
        const byteLength = collected.byteLength + chunk.byteLength;
        if (byteLength > bytesToRead) {
          collected.excess = true;
          return collected;
        }
        collected.chunks.push(chunk);
        collected.byteLength = byteLength;
        return collected;
      },
    ),
    Effect.map((collected) => {
      if (collected.excess || collected.byteLength !== bytesToRead) {
        // The caller converts every length mismatch to a typed truncated-header
        // failure. Do not copy bytes that cannot be inspected.
        return new Uint8Array(0);
      }
      const combined = new Uint8Array(bytesToRead);
      let writeOffset = 0;
      for (const chunk of collected.chunks) {
        combined.set(chunk, writeOffset);
        writeOffset += chunk.byteLength;
      }
      return combined;
    }),
  );

const mapFailureCause = <A, E, R, E2>(
  operation: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> =>
  Effect.catchCause(
    operation,
    (cause) => Effect.failCause(Cause.map(cause, mapError)),
  );

export const inspectNativeExecutableFile = (
  fileSystem: FileSystem.FileSystem,
  file: string,
  size: number,
): Effect.Effect<NativeExecutableObservation, NativeExecutableInspectionError> =>
  Effect.gen(function*() {
    const readRange = (offset: number, length: number) =>
      mapFailureCause(
        collectRange(fileSystem, file, offset, length),
        (): NativeExecutableInspectionError => ({ path: file, reason: "read-failed" }),
      );
    const initialLength = Math.min(size, 64);
    const initial = initialLength === 0
      ? new Uint8Array(0)
      : yield* readRange(0, initialLength);
    if (initial.byteLength !== initialLength) {
      return yield* Effect.fail({ path: file, reason: "truncated-header" });
    }
    const chunks = [{ offset: 0, bytes: initial }];
    for (let reads = 0;; reads++) {
      const parsed = Result.try({
        try: () => inspectNativeExecutableChunks(size, chunks),
        catch: (error) => error,
      });
      if (Result.isSuccess(parsed)) return parsed.success;
      if (parsed.failure instanceof NativeExecutableInvalid) {
        return yield* Effect.fail({ path: file, reason: parsed.failure.reason });
      }
      if (!(parsed.failure instanceof NativeExecutableRangeRequired)) {
        return yield* Effect.fail({ path: file, reason: "invalid-native-executable" });
      }
      if (reads === 2) return yield* Effect.fail({ path: file, reason: "too-many-header-ranges" });
      const bytes = yield* readRange(parsed.failure.offset, parsed.failure.length);
      if (bytes.byteLength !== parsed.failure.length) {
        return yield* Effect.fail({ path: file, reason: "truncated-header" });
      }
      chunks.push({ offset: parsed.failure.offset, bytes });
    }
  });

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const validateAndPublishExecutable = <Target>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  candidate: ExecutableCandidate,
  options: {
    readonly digest: boolean;
    readonly resolveTarget: (observation: NativeExecutableObservation) => Result.Result<Target, string>;
  },
): Effect.Effect<ExecutableFile<Target>, OutputMissing | OutputInvalid | OutputLocked | PublicationFailed> =>
  Effect.gen(function*() {
    const state = yield* Effect.sync(() => {
      const state = candidateStates.get(candidate);
      if (state === undefined) throw new Error("invalid or already consumed executable candidate");
      candidateStates.delete(candidate);
      return state;
    });
    const exists = yield* fileSystem.exists(candidate.staged).pipe(
      Effect.mapError((error) => new OutputInvalid({ path: candidate.staged, reason: error.message })),
    );
    if (!exists) return yield* new OutputMissing({ path: candidate.staged });
    const information = yield* fileSystem.stat(candidate.staged).pipe(
      Effect.mapError((error) => new OutputInvalid({ path: candidate.staged, reason: error.message })),
    );
    if (information.type !== "File") {
      return yield* new OutputInvalid({ path: candidate.staged, reason: "not-regular" });
    }
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) {
      return yield* new OutputInvalid({ path: candidate.staged, reason: "not-executable" });
    }
    if (information.size < 0n || information.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return yield* new OutputInvalid({ path: candidate.staged, reason: "invalid-byte-count" });
    }
    const bytes = Number(information.size);
    const observation = yield* mapFailureCause(
      inspectNativeExecutableFile(fileSystem, candidate.staged, bytes),
      (error) => new OutputInvalid({ path: error.path, reason: error.reason }),
    );
    const resolved = yield* Effect.sync(() => options.resolveTarget(observation));
    if (Result.isFailure(resolved)) {
      return yield* new OutputInvalid({ path: candidate.staged, reason: resolved.failure });
    }
    const digest = options.digest
      ? yield* fileSystem.readFile(candidate.staged).pipe(
        Effect.flatMap((contents) => crypto.digest("SHA-256", contents)),
        Effect.map((contents) => `sha256:${hex(contents)}` as const),
        Effect.mapError((error) => new OutputInvalid({ path: candidate.staged, reason: error.message })),
      )
      : undefined;
    yield* state.publish;
    return {
      path: state.destination,
      bytes,
      ...(digest === undefined ? {} : { digest }),
      target: resolved.success,
    };
  });
