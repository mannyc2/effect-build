import { Cause, Effect, FileSystem, Path, Result, Schema, type Scope } from "effect";
import { Artifact, BuildError, JavaScriptBundle } from "effect-build";
import * as Integration from "effect-build/Integration";
import type * as Provider from "effect-build/Provider";
import { type Options, Stages, targetEntries } from "./Adapter.js";

const SupportedBundleVersions = Object.freeze(["1.3.9"] as const);
const allowedEntrypointExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const ErrorFamilyTypeId = Symbol.for("effect-build-bun/Bundle/Error");

type Target = (typeof targetEntries)[number][0];
type ExecutableStages = typeof Stages.Type;

export interface JavaScriptBundleInput {
  readonly entrypoint: string;
  readonly format: "esm" | "cjs";
  readonly cwd?: string;
}

export interface BunBundleStage {
  readonly operation: "bundle-javascript";
  readonly tool: {
    readonly name: "bun";
    readonly version: "1.3.9";
    readonly path: Artifact.FileArtifact["path"];
  };
}

type JavaScriptBundleArtifact = JavaScriptBundle.Artifact<readonly [BunBundleStage]>;

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

export class BunBundleVersionMismatch extends Schema.TaggedError<BunBundleVersionMismatch>(
  "effect-build-bun/BunBundleVersionMismatch",
)("BunBundleVersionMismatch", {
  supported: Schema.Tuple([Schema.Literal(SupportedBundleVersions[0])]),
  observed: Schema.String,
}) {
  constructor(fields: { readonly supported: readonly ["1.3.9"]; readonly observed: string }) {
    super(fields);
    Object.freeze(this.supported);
    markError(this);
  }

  static is(value: unknown): value is BunBundleVersionMismatch {
    return hasErrorIdentity(value, "BunBundleVersionMismatch");
  }
}

const InvalidBundleInputReason = Schema.Literals(
  [
    "expected-object",
    "unknown-field",
    "missing-field",
    "invalid-entrypoint",
    "invalid-format",
    "invalid-cwd",
    "entrypoint-not-regular",
  ] as const,
);
type InvalidBundleInputReason = typeof InvalidBundleInputReason.Type;

export class InvalidBundleInput extends Schema.TaggedError<InvalidBundleInput>(
  "effect-build-bun/InvalidBundleInput",
)("InvalidBundleInput", { reason: InvalidBundleInputReason }) {
  constructor(fields: { readonly reason: InvalidBundleInputReason }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is InvalidBundleInput {
    return hasErrorIdentity(value, "InvalidBundleInput");
  }
}

export class BunBundleSpawnFailed extends Schema.TaggedError<BunBundleSpawnFailed>(
  "effect-build-bun/BunBundleSpawnFailed",
)("BunBundleSpawnFailed", { reason: Schema.String }) {
  constructor(fields: { readonly reason: string }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is BunBundleSpawnFailed {
    return hasErrorIdentity(value, "BunBundleSpawnFailed");
  }
}

export class BunBundleFailed extends Schema.TaggedError<BunBundleFailed>(
  "effect-build-bun/BunBundleFailed",
)("BunBundleFailed", {
  exitCode: Schema.Number,
  diagnostics: Schema.Array(BuildError.Diagnostic),
}) {
  constructor(fields: { readonly exitCode: number; readonly diagnostics: readonly BuildError.Diagnostic[] }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is BunBundleFailed {
    return hasErrorIdentity(value, "BunBundleFailed");
  }
}

const BunSpecificInvalidReason = Schema.Literals(
  [
    "missing-output",
    "unexpected-root-entry",
    "missing-metafile",
    "invalid-metafile",
    "expected-one-metafile-output",
    "metafile-output-mismatch",
    "entrypoint-mismatch",
    "css-output-not-supported",
    "invalid-metafile-input",
    "invalid-metafile-import",
    "invalid-external-import",
  ] as const,
);
const BunBundleInvalidReason = Schema.Union([JavaScriptBundle.InvalidReason, BunSpecificInvalidReason]);
type BunBundleInvalidReason = typeof BunBundleInvalidReason.Type;

export class BunBundleInvalid extends Schema.TaggedError<BunBundleInvalid>(
  "effect-build-bun/BunBundleInvalid",
)("BunBundleInvalid", { reason: BunBundleInvalidReason }) {
  constructor(fields: { readonly reason: BunBundleInvalidReason }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is BunBundleInvalid {
    return hasErrorIdentity(value, "BunBundleInvalid");
  }
}

export const BunBundleMaterializationOperation = Schema.Literals(
  ["stat-entrypoint", "read-root", "read-metafile", "make-temp", "realpath", "stat", "read", "digest"] as const,
);
export type BunBundleMaterializationOperation = typeof BunBundleMaterializationOperation.Type;

export class BunBundleMaterializationFailed extends Schema.TaggedError<BunBundleMaterializationFailed>(
  "effect-build-bun/BunBundleMaterializationFailed",
)("BunBundleMaterializationFailed", {
  path: Schema.String,
  operation: BunBundleMaterializationOperation,
  reason: Schema.String,
}) {
  constructor(fields: {
    readonly path: string;
    readonly operation: BunBundleMaterializationOperation;
    readonly reason: string;
  }) {
    super(fields);
    markError(this);
  }

  static is(value: unknown): value is BunBundleMaterializationFailed {
    return hasErrorIdentity(value, "BunBundleMaterializationFailed");
  }
}

export type BunBundleError =
  | BunBundleVersionMismatch
  | InvalidBundleInput
  | BunBundleSpawnFailed
  | BunBundleFailed
  | BunBundleInvalid
  | BunBundleMaterializationFailed;

export interface Service extends Provider.CompilerService<"bun", Options, Target, ExecutableStages> {
  readonly withJavaScriptBundle: <A, E, R>(
    input: JavaScriptBundleInput,
    use: (main: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, BunBundleError | E, Exclude<R, Scope.Scope>>;
}

const isRecord = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const InputPath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      value.length > 0 && !value.includes("\0") ? true : "path must be non-empty and contain no NUL"
    ),
  ),
);
const InputFormat = Schema.Literals(["esm", "cjs"] as const);

const invalidInput = (reason: InvalidBundleInputReason): InvalidBundleInput => new InvalidBundleInput({ reason });

const decodeField = <A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
  reason: InvalidBundleInputReason,
): Result.Result<A, InvalidBundleInput> =>
  Result.mapError(Schema.decodeUnknownResult(schema)(value), () => invalidInput(reason));

const decodeInputResult = (value: unknown): Result.Result<JavaScriptBundleInput, InvalidBundleInput> => {
  if (!isRecord(value)) return Result.fail(invalidInput("expected-object"));
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !["entrypoint", "format", "cwd"].includes(key))) {
    return Result.fail(invalidInput("unknown-field"));
  }
  if (!Object.hasOwn(value, "entrypoint") || !Object.hasOwn(value, "format")) {
    return Result.fail(invalidInput("missing-field"));
  }
  const entrypoint = decodeField(InputPath, value.entrypoint, "invalid-entrypoint");
  if (Result.isFailure(entrypoint)) return Result.fail(entrypoint.failure);
  const format = decodeField(InputFormat, value.format, "invalid-format");
  if (Result.isFailure(format)) return Result.fail(format.failure);
  const cwd = Object.hasOwn(value, "cwd")
    ? decodeField(InputPath, value.cwd, "invalid-cwd")
    : Result.succeed(undefined);
  if (Result.isFailure(cwd)) return Result.fail(cwd.failure);
  return Result.succeed({
    entrypoint: entrypoint.success,
    format: format.success,
    ...(cwd.success === undefined ? {} : { cwd: cwd.success }),
  });
};

const materializationFailed = (
  path: string,
  operation: BunBundleMaterializationOperation,
  error: { readonly message: string },
): BunBundleMaterializationFailed => new BunBundleMaterializationFailed({ path, operation, reason: error.message });

const invalidBundle = (reason: BunBundleInvalidReason): BunBundleInvalid => new BunBundleInvalid({ reason });

interface ValidatedMetafile {
  readonly observedExternalImports: readonly string[];
}

const normalizeOutputKey = (value: string): string => {
  const portable = value.replaceAll("\\", "/");
  return portable.startsWith("./") ? portable.slice(2) : portable;
};

const collectExternalImports = (
  metafile: Readonly<Record<PropertyKey, unknown>>,
  outputName: string,
  resolvedCwd: string,
  resolvedEntrypoint: string,
  path: Path.Path,
): Result.Result<ValidatedMetafile, BunBundleInvalid> => {
  if (!isRecord(metafile.inputs) || !isRecord(metafile.outputs)) {
    return Result.fail(invalidBundle("invalid-metafile"));
  }
  const outputs = Object.entries(metafile.outputs);
  if (outputs.length !== 1) return Result.fail(invalidBundle("expected-one-metafile-output"));
  const output = outputs[0];
  if (output === undefined) return Result.fail(invalidBundle("expected-one-metafile-output"));
  const [outputKey, outputRecord] = output;
  if (normalizeOutputKey(outputKey) !== outputName || !isRecord(outputRecord)) {
    return Result.fail(invalidBundle("metafile-output-mismatch"));
  }
  if (
    typeof outputRecord.entryPoint !== "string"
    || path.normalize(path.resolve(resolvedCwd, outputRecord.entryPoint)) !== resolvedEntrypoint
  ) {
    return Result.fail(invalidBundle("entrypoint-mismatch"));
  }
  if (Object.hasOwn(outputRecord, "cssBundle")) {
    return Result.fail(invalidBundle("css-output-not-supported"));
  }
  const externalImports = new Set<string>();
  for (const input of Object.values(metafile.inputs)) {
    if (!isRecord(input) || !Array.isArray(input.imports)) {
      return Result.fail(invalidBundle("invalid-metafile-input"));
    }
    for (const imported of input.imports) {
      if (!isRecord(imported)) return Result.fail(invalidBundle("invalid-metafile-import"));
      if (imported.external === true) {
        if (typeof imported.path !== "string" || imported.path.length === 0) {
          return Result.fail(invalidBundle("invalid-external-import"));
        }
        externalImports.add(imported.path);
      }
      if (
        typeof imported.path !== "string"
        || typeof imported.kind !== "string"
        || (imported.external !== undefined && typeof imported.external !== "boolean")
      ) {
        return Result.fail(invalidBundle("invalid-metafile-import"));
      }
    }
  }
  return Result.succeed({ observedExternalImports: Object.freeze([...externalImports].sort()) });
};

const validateMaterializedBundle = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  cleanupRoot: string,
  outputName: string,
  resolvedCwd: string,
  resolvedEntrypoint: string,
): Effect.Effect<ValidatedMetafile, BunBundleInvalid | BunBundleMaterializationFailed> =>
  Effect.gen(function*() {
    const entries = yield* fileSystem.readDirectory(cleanupRoot).pipe(
      Effect.mapError((error) => materializationFailed(cleanupRoot, "read-root", error)),
    );
    if (!entries.includes(outputName)) return yield* invalidBundle("missing-output");
    if (!entries.includes("metafile.json")) return yield* invalidBundle("missing-metafile");
    if (entries.length !== 2 || entries.some((entry) => entry !== outputName && entry !== "metafile.json")) {
      return yield* invalidBundle("unexpected-root-entry");
    }
    const metafilePath = path.normalize(path.resolve(cleanupRoot, "metafile.json"));
    const bytes = yield* fileSystem.readFile(metafilePath).pipe(
      Effect.mapError((error) => materializationFailed(metafilePath, "read-metafile", error)),
    );
    const metafile = yield* Effect.try({
      try: () => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
      catch: () => invalidBundle("invalid-metafile"),
    });
    if (!isRecord(metafile)) return yield* invalidBundle("invalid-metafile");
    return yield* Effect.fromResult(
      collectExternalImports(metafile, outputName, resolvedCwd, resolvedEntrypoint, path),
    );
  });

const mapCoreBundleError = (
  error: JavaScriptBundle.JavaScriptBundleError,
  resolvedCwd: string,
): BunBundleInvalid | BunBundleMaterializationFailed => {
  if (JavaScriptBundle.InvalidJavaScriptBundle.is(error)) {
    return new BunBundleInvalid({ reason: error.reason });
  }
  if (JavaScriptBundle.JavaScriptBundleAccessFailed.is(error)) {
    return new BunBundleMaterializationFailed({
      path: error.path,
      operation: error.operation,
      reason: error.reason,
    });
  }
  return new BunBundleMaterializationFailed({
    path: resolvedCwd,
    operation: "make-temp",
    reason: error.reason,
  });
};

const mapOwnedCoreBundleError = <E>(
  error: E,
  resolvedCwd: string,
): E | BunBundleInvalid | BunBundleMaterializationFailed =>
  JavaScriptBundle.InvalidJavaScriptBundle.is(error)
    || JavaScriptBundle.JavaScriptBundleAccessFailed.is(error)
    || JavaScriptBundle.JavaScriptBundleTemporaryDirectoryFailed.is(error)
    ? mapCoreBundleError(error, resolvedCwd)
    : error;

export const makeService = (
  context: Provider.CommandServiceContext<"bun", Options, Target, ExecutableStages>,
): Service => {
  const withJavaScriptBundle: Service["withJavaScriptBundle"] = Effect.fn("Bun.withJavaScriptBundle")(<A, E, R>(
    input: JavaScriptBundleInput,
    use: (main: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function*() {
      const decoded = yield* Effect.fromResult(decodeInputResult(input));
      if (context.command.tool.version !== SupportedBundleVersions[0]) {
        return yield* new BunBundleVersionMismatch({
          supported: SupportedBundleVersions,
          observed: context.command.tool.version,
        });
      }
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const resolvedCwd = path.normalize(path.resolve(decoded.cwd ?? ""));
      const resolvedEntrypoint = path.normalize(path.resolve(resolvedCwd, decoded.entrypoint));
      if (!allowedEntrypointExtensions.has(path.extname(resolvedEntrypoint).toLowerCase())) {
        return yield* invalidInput("entrypoint-not-regular");
      }
      const information = yield* fileSystem.stat(resolvedEntrypoint).pipe(
        Effect.mapError((error) =>
          error.reason._tag === "NotFound"
            ? invalidInput("entrypoint-not-regular")
            : materializationFailed(resolvedEntrypoint, "stat-entrypoint", error)
        ),
      );
      if (information.type !== "File") return yield* invalidInput("entrypoint-not-regular");
      const exit = yield* Integration.withOwnedJavaScriptBundle(
        {
          temporaryPrefix: "effect-build-bun-",
          produce: (cleanupRoot) =>
            Effect.gen(function*() {
              const outputName = decoded.format === "esm" ? "main.mjs" : "main.cjs";
              const expectedMain = path.normalize(path.resolve(cleanupRoot, outputName));
              const metafilePath = path.normalize(path.resolve(cleanupRoot, "metafile.json"));
              const argv = [
                "build",
                "--target=node",
                `--format=${decoded.format}`,
                "--packages=bundle",
                `--outfile=${expectedMain}`,
                `--metafile=${metafilePath}`,
                resolvedEntrypoint,
              ] as const;
              const completion = yield* context.command.execute(argv, resolvedCwd).pipe(
                Effect.mapError((error) => new BunBundleSpawnFailed({ reason: error.message })),
              );
              if (completion.exitCode !== 0) {
                return yield* new BunBundleFailed({
                  exitCode: completion.exitCode,
                  diagnostics: [
                    { channel: "stdout", ...completion.stdout },
                    { channel: "stderr", ...completion.stderr },
                  ],
                });
              }
              const validated = yield* validateMaterializedBundle(
                fileSystem,
                path,
                cleanupRoot,
                outputName,
                resolvedCwd,
                resolvedEntrypoint,
              );
              const stage = Object.freeze({
                operation: "bundle-javascript" as const,
                tool: Object.freeze({
                  name: "bun" as const,
                  version: SupportedBundleVersions[0],
                  path: context.command.tool.path,
                }),
              });
              return Object.freeze({
                path: expectedMain,
                format: decoded.format,
                resolutionTarget: "node" as const,
                observedExternalImports: validated.observedExternalImports,
                stages: Object.freeze([stage]) as readonly [BunBundleStage],
              });
            }),
        },
        (main) => Effect.exit(use(main)),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => mapOwnedCoreBundleError(error, resolvedCwd)))
        ),
      );
      return yield* exit;
    }) as Effect.Effect<A, BunBundleError | E, Exclude<R, Scope.Scope>>
  );
  return Object.freeze({
    compileExecutable: context.compileExecutable,
    compileExecutableMatrix: context.compileExecutableMatrix,
    withJavaScriptBundle,
  });
};
