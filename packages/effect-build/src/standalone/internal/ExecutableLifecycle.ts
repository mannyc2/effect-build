import {
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
  readonly executableSuffix: "" | ".exe";
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
        candidateStates.set(candidate, { destination, executableSuffix, publish });
        return candidate;
      }),
      (registered) => Effect.sync(() => candidateStates.delete(registered)),
    );
  });

const collectRange = (fileSystem: FileSystem.FileSystem, file: string, offset: number, bytesToRead: number) =>
  fileSystem.stream(file, { offset, bytesToRead }).pipe(
    Stream.runFold(() => new Uint8Array(0), (current, chunk) => {
      const combined = new Uint8Array(current.byteLength + chunk.byteLength);
      combined.set(current);
      combined.set(chunk, current.byteLength);
      return combined;
    }),
  );

export const inspectNativeExecutableFile = (
  fileSystem: FileSystem.FileSystem,
  file: string,
  size: number,
): Effect.Effect<NativeExecutableObservation, NativeExecutableInspectionError> =>
  Effect.gen(function*() {
    const initialLength = Math.min(size, 1024 * 1024);
    const initial = initialLength === 0
      ? new Uint8Array(0)
      : yield* collectRange(fileSystem, file, 0, initialLength);
    if (initial.byteLength !== initialLength) return yield* Effect.fail(new Error("truncated-header"));
    const chunks = [{ offset: 0, bytes: initial }];
    for (let reads = 0;; reads++) {
      const step = yield* Effect.sync(() => {
        try {
          return { _tag: "Done", value: inspectNativeExecutableChunks(size, chunks) } as const;
        } catch (error) {
          return error instanceof NativeExecutableRangeRequired
            ? { _tag: "Read", request: error } as const
            : { _tag: "Failed", error } as const;
        }
      });
      if (step._tag === "Done") return step.value;
      if (step._tag === "Failed") return yield* Effect.fail(step.error);
      if (reads === 4) return yield* Effect.fail(new Error("too-many-header-ranges"));
      const bytes = yield* collectRange(fileSystem, file, step.request.offset, step.request.length);
      if (bytes.byteLength !== step.request.length) return yield* Effect.fail(new Error("truncated-header"));
      chunks.push({ offset: step.request.offset, bytes });
    }
  }).pipe(
    Effect.mapError((error): NativeExecutableInspectionError => ({ path: file, reason: String(error) })),
  );

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const validateAndPublishExecutable = <Target>(
  fileSystem: FileSystem.FileSystem,
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
    if (state.executableSuffix !== ".exe" && (information.mode & 0o111) === 0) {
      return yield* new OutputInvalid({ path: candidate.staged, reason: "not-executable" });
    }
    if (information.size < 0n || information.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      return yield* new OutputInvalid({ path: candidate.staged, reason: "invalid-byte-count" });
    }
    const bytes = Number(information.size);
    const observation = yield* inspectNativeExecutableFile(fileSystem, candidate.staged, bytes).pipe(
      Effect.mapError((error) => new OutputInvalid({ path: error.path, reason: error.reason })),
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
