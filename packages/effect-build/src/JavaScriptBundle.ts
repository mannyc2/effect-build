import { Crypto, Effect, FileSystem, Path, type PlatformError, Result, Schema, type Scope } from "effect";
import type { Digest, FileArtifact, StageObservation } from "./standalone/Artifact.js";
import { AbsolutePath, StageObservation as StageObservationSchema } from "./standalone/Artifact.js";

export const Format = Schema.Literals(["esm", "cjs"] as const);
export type Format = typeof Format.Type;

export const InvalidReason = Schema.Literals(
  [
    "expected-object",
    "unknown-field",
    "missing-field",
    "invalid-path",
    "invalid-format",
    "invalid-resolution-target",
    "format-path-mismatch",
    "invalid-observed-external-import",
    "invalid-byte-count",
    "observed-external-imports-not-sorted-unique",
    "invalid-stages",
    "artifact-not-live",
    "file-not-regular",
    "byte-count-changed",
    "digest-changed",
    "temporary-prefix-invalid",
    "cleanup-root-not-absolute",
    "cleanup-root-not-directory",
    "cleanup-root-not-empty",
    "file-outside-cleanup-root",
    "active-publication-destination-unresolvable",
    "cleanup-root-contains-active-publication",
    "cleanup-root-overlaps-active-root",
  ] as const,
);
export type InvalidReason = typeof InvalidReason.Type;

export const JavaScriptBundleAccessOperation = Schema.Literals(["realpath", "stat", "read", "digest"] as const);
export type JavaScriptBundleAccessOperation = typeof JavaScriptBundleAccessOperation.Type;

const ErrorFamilyTypeId = Symbol.for("effect-build/JavaScriptBundle/Error");

const hasErrorIdentity = (value: unknown, tag: string): boolean =>
  typeof value === "object"
  && value !== null
  && (value as { readonly _tag?: unknown })._tag === tag
  && (value as { readonly [ErrorFamilyTypeId]?: unknown })[ErrorFamilyTypeId] === ErrorFamilyTypeId;

const markError = (error: object): void => {
  Object.defineProperty(error, ErrorFamilyTypeId, {
    value: ErrorFamilyTypeId,
    enumerable: false,
    configurable: false,
    writable: false,
  });
};

export class InvalidJavaScriptBundle extends Schema.TaggedError<InvalidJavaScriptBundle>(
  "effect-build/JavaScriptBundle/InvalidJavaScriptBundle",
)("InvalidJavaScriptBundle", { reason: InvalidReason }) {
  constructor(fields: { readonly reason: InvalidReason }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is InvalidJavaScriptBundle {
    return hasErrorIdentity(value, "InvalidJavaScriptBundle");
  }
}

export class JavaScriptBundleAccessFailed extends Schema.TaggedError<JavaScriptBundleAccessFailed>(
  "effect-build/JavaScriptBundle/JavaScriptBundleAccessFailed",
)("JavaScriptBundleAccessFailed", {
  path: Schema.String,
  operation: JavaScriptBundleAccessOperation,
  reason: Schema.String,
}) {
  constructor(fields: {
    readonly path: string;
    readonly operation: JavaScriptBundleAccessOperation;
    readonly reason: string;
  }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is JavaScriptBundleAccessFailed {
    return hasErrorIdentity(value, "JavaScriptBundleAccessFailed");
  }
}

export class JavaScriptBundleTemporaryDirectoryFailed
  extends Schema.TaggedError<JavaScriptBundleTemporaryDirectoryFailed>(
    "effect-build/JavaScriptBundle/JavaScriptBundleTemporaryDirectoryFailed",
  )("JavaScriptBundleTemporaryDirectoryFailed", {
    prefix: Schema.String,
    reason: Schema.String,
  })
{
  constructor(fields: { readonly prefix: string; readonly reason: string }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is JavaScriptBundleTemporaryDirectoryFailed {
    return hasErrorIdentity(value, "JavaScriptBundleTemporaryDirectoryFailed");
  }
}

export type JavaScriptBundleError =
  | InvalidJavaScriptBundle
  | JavaScriptBundleAccessFailed
  | JavaScriptBundleTemporaryDirectoryFailed;

export interface Input<Stages extends readonly StageObservation[] = readonly StageObservation[]> {
  readonly path: string;
  readonly format: Format;
  readonly resolutionTarget: "node";
  readonly observedExternalImports: readonly string[];
  readonly stages: Stages;
}

const ArtifactTypeId: unique symbol = Symbol("effect-build/JavaScriptBundle/Artifact");

export interface Artifact<Stages extends readonly StageObservation[] = readonly StageObservation[]> {
  readonly path: FileArtifact["path"];
  readonly bytes: FileArtifact["bytes"];
  readonly digest: Digest;
  readonly format: Format;
  readonly resolutionTarget: "node";
  readonly observedExternalImports: readonly string[];
  readonly stages: Stages;
  readonly [ArtifactTypeId]: typeof ArtifactTypeId;
}

interface DecodedInput<Stages extends readonly StageObservation[]> {
  readonly path: string;
  readonly format: Format;
  readonly resolutionTarget: "node";
  readonly observedExternalImports: readonly string[];
  readonly stages: Stages;
}

interface ObservedFile {
  readonly path: string;
  readonly bytes: number;
  readonly digest: Digest;
}

const liveArtifacts = new WeakSet<object>();
const requiredKeys = ["path", "format", "resolutionTarget", "observedExternalImports", "stages"] as const;
const requiredKeySet = new Set<string>(requiredKeys);

const invalid = (reason: InvalidReason): InvalidJavaScriptBundle => new InvalidJavaScriptBundle({ reason });

const isRecord = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeField = <A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
  reason: InvalidReason,
): Result.Result<A, InvalidReason> => {
  const decoded = Schema.decodeUnknownResult(schema)(value);
  return Result.isSuccess(decoded) ? Result.succeed(decoded.success) : Result.fail(reason);
};

const freezeStages = <Stages extends readonly StageObservation[]>(stages: readonly StageObservation[]): Stages =>
  Object.freeze(stages.map((stage) =>
    Object.freeze({
      ...stage,
      tool: Object.freeze({ ...stage.tool }),
    })
  )) as Stages;

const decodeInput = <Stages extends readonly StageObservation[]>(
  input: unknown,
): Result.Result<DecodedInput<Stages>, InvalidReason> => {
  if (!isRecord(input)) return Result.fail("expected-object");
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string" || !requiredKeySet.has(key))) return Result.fail("unknown-field");
  if (requiredKeys.some((key) => !Object.hasOwn(input, key))) return Result.fail("missing-field");

  const path = decodeField(AbsolutePath, input.path, "invalid-path");
  if (Result.isFailure(path)) return Result.fail(path.failure);
  const format = decodeField(Format, input.format, "invalid-format");
  if (Result.isFailure(format)) return Result.fail(format.failure);
  const resolutionTarget = decodeField(Schema.Literal("node"), input.resolutionTarget, "invalid-resolution-target");
  if (Result.isFailure(resolutionTarget)) return Result.fail(resolutionTarget.failure);
  const observedExternalImports = decodeField(
    Schema.Array(Schema.NonEmptyString),
    input.observedExternalImports,
    "invalid-observed-external-import",
  );
  if (Result.isFailure(observedExternalImports)) return Result.fail(observedExternalImports.failure);
  const stages = decodeField(
    Schema.Array(StageObservationSchema),
    input.stages,
    "invalid-stages",
  );
  if (Result.isFailure(stages)) return Result.fail(stages.failure);
  const expectedSuffix = format.success === "esm" ? ".mjs" : ".cjs";
  if (!path.success.endsWith(expectedSuffix)) return Result.fail("format-path-mismatch");
  const imports = observedExternalImports.success;
  if (
    imports.some((specifier, index) => index > 0 && imports[index - 1]! >= specifier)
    || new Set(imports).size !== imports.length
  ) return Result.fail("observed-external-imports-not-sorted-unique");

  return Result.succeed({
    path: path.success,
    format: format.success,
    resolutionTarget: resolutionTarget.success,
    observedExternalImports: Object.freeze([...imports]),
    stages: freezeStages<Stages>(stages.success),
  });
};

const isNotFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound";

const accessFailed = (
  path: string,
  operation: JavaScriptBundleAccessOperation,
  error: { readonly message: string },
): JavaScriptBundleAccessFailed => new JavaScriptBundleAccessFailed({ path, operation, reason: error.message });

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const checkedByteCount = (size: bigint): Result.Result<number, InvalidJavaScriptBundle> =>
  size >= 0n && size <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Result.succeed(Number(size))
    : Result.fail(invalid("invalid-byte-count"));

const observeFile = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  requestedPath: string,
): Effect.Effect<ObservedFile, InvalidJavaScriptBundle | JavaScriptBundleAccessFailed> =>
  Effect.gen(function*() {
    const path = yield* fileSystem.realPath(requestedPath).pipe(
      Effect.mapError((error) =>
        isNotFound(error) ? invalid("file-not-regular") : accessFailed(requestedPath, "realpath", error)
      ),
    );
    const information = yield* fileSystem.stat(path).pipe(
      Effect.mapError((error) => isNotFound(error) ? invalid("file-not-regular") : accessFailed(path, "stat", error)),
    );
    if (information.type !== "File") return yield* invalid("file-not-regular");
    const checked = checkedByteCount(information.size);
    if (Result.isFailure(checked)) return yield* checked.failure;
    const contents = yield* fileSystem.readFile(path).pipe(
      Effect.mapError((error) => isNotFound(error) ? invalid("file-not-regular") : accessFailed(path, "read", error)),
    );
    if (contents.byteLength !== checked.success) return yield* invalid("byte-count-changed");
    const digestBytes = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((error) => accessFailed(path, "digest", error)),
    );
    return {
      path,
      bytes: checked.success,
      digest: `sha256:${hex(digestBytes)}` as Digest,
    };
  });

const makeArtifact = <Stages extends readonly StageObservation[]>(
  input: DecodedInput<Stages>,
  observed: ObservedFile,
): Artifact<Stages> => {
  const value = {
    path: observed.path,
    bytes: observed.bytes,
    digest: observed.digest,
    format: input.format,
    resolutionTarget: input.resolutionTarget,
    observedExternalImports: input.observedExternalImports,
    stages: input.stages,
  } as Omit<Artifact<Stages>, typeof ArtifactTypeId>;
  Object.defineProperty(value, ArtifactTypeId, {
    value: ArtifactTypeId,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(value) as Artifact<Stages>;
};

export const withFile: <const Stages extends readonly StageObservation[], A, E, R>(
  input: Input<Stages>,
  use: (artifact: Artifact<Stages>) => Effect.Effect<A, E, R>,
) => Effect.Effect<
  A,
  InvalidJavaScriptBundle | JavaScriptBundleAccessFailed | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R, Scope.Scope>
> = Effect.fn("effect-build/JavaScriptBundle.withFile")(<const Stages extends readonly StageObservation[], A, E, R>(
  input: Input<Stages>,
  use: (artifact: Artifact<Stages>) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  InvalidJavaScriptBundle | JavaScriptBundleAccessFailed | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R, Scope.Scope>
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const decoded = decodeInput<Stages>(input);
    if (Result.isFailure(decoded)) return yield* invalid(decoded.failure);
    const observed = yield* observeFile(fileSystem, crypto, decoded.success.path);
    const artifact = makeArtifact(decoded.success, observed);
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        liveArtifacts.add(artifact);
        return artifact;
      }),
      (registered) => Effect.scoped(use(registered)),
      (registered) =>
        Effect.sync(() => {
          liveArtifacts.delete(registered);
        }),
    );
  })
);

/** Package-private implementation hook projected only through Integration. */
export const _inspectLiveJavaScriptBundle = <const Stages extends readonly StageObservation[]>(
  value: Artifact<Stages>,
): Effect.Effect<
  Artifact<Stages>,
  InvalidJavaScriptBundle | JavaScriptBundleAccessFailed,
  FileSystem.FileSystem | Crypto.Crypto
> =>
  Effect.gen(function*() {
    if (typeof value !== "object" || value === null || !liveArtifacts.has(value)) {
      return yield* invalid("artifact-not-live");
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const observed = yield* observeFile(fileSystem, crypto, value.path);
    if (observed.bytes !== value.bytes) return yield* invalid("byte-count-changed");
    if (observed.digest !== value.digest) return yield* invalid("digest-changed");
    return value;
  });
