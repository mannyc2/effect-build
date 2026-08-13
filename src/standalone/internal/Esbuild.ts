import { Context, Effect, FileSystem, Layer, Path, Schema, type Scope } from "effect";
import * as esbuild from "esbuild";

const expectedVersion = "0.28.2" as const;
const nodeSyntaxTarget = "node26.7" as const;
const allowedEntrypointExtensions = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
const inputImportKinds = new Set(["import-statement", "require-call", "dynamic-import"]);

type BundleBuildOptions = esbuild.BuildOptions & {
  readonly write: false;
  readonly metafile: true;
};

type BundleBuildResult = esbuild.BuildResult<BundleBuildOptions>;

export interface BundleContext {
  readonly rebuild: () => Promise<BundleBuildResult>;
  readonly cancel: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export interface EsbuildApi {
  readonly version: string;
  readonly context: (options: BundleBuildOptions) => Promise<BundleContext>;
}

export interface JavaScriptBundleInput {
  readonly entrypoint: string;
  readonly format: "esm" | "cjs";
  readonly cwd?: string;
}

export interface JavaScriptBundleArtifact {
  readonly path: string;
  readonly format: "esm" | "cjs";
  readonly nodeSyntaxTarget: "node26.7";
  readonly observedExternalImports: readonly string[];
  readonly stage: {
    readonly operation: "bundle";
    readonly tool: {
      readonly name: "esbuild";
      readonly version: "0.28.2";
    };
  };
}

const EsbuildDiagnosticLocation = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
});

export const EsbuildDiagnostic = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  location: Schema.optionalKey(EsbuildDiagnosticLocation),
});
export type EsbuildDiagnostic = typeof EsbuildDiagnostic.Type;

export class EsbuildVersionMismatch extends Schema.TaggedError<EsbuildVersionMismatch>()(
  "EsbuildVersionMismatch",
  { expected: Schema.Literal(expectedVersion), observed: Schema.String },
) {}

export class InvalidBundleInput extends Schema.TaggedError<InvalidBundleInput>()("InvalidBundleInput", {
  reason: Schema.String,
}) {}

export class EsbuildFailed extends Schema.TaggedError<EsbuildFailed>()("EsbuildFailed", {
  diagnostics: Schema.Array(EsbuildDiagnostic),
  truncated: Schema.Boolean,
}) {}

export class JavaScriptBundleInvalid extends Schema.TaggedError<JavaScriptBundleInvalid>()(
  "JavaScriptBundleInvalid",
  { reason: Schema.String },
) {}

export const BundleMaterializationOperation = Schema.Literals(["make-temp", "write", "stat"] as const);
export type BundleMaterializationOperation = typeof BundleMaterializationOperation.Type;

export class BundleMaterializationFailed extends Schema.TaggedError<BundleMaterializationFailed>()(
  "BundleMaterializationFailed",
  {
    path: Schema.String,
    operation: BundleMaterializationOperation,
    reason: Schema.String,
  },
) {}

export type EsbuildLayerError = EsbuildVersionMismatch;
export type EsbuildBundleError =
  | InvalidBundleInput
  | EsbuildFailed
  | JavaScriptBundleInvalid
  | BundleMaterializationFailed;

export interface EsbuildService {
  readonly withJavaScriptBundle: <A, E, R>(
    input: JavaScriptBundleInput,
    use: (bundle: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, EsbuildBundleError | E, Exclude<R, Scope.Scope>>;
}

export class Esbuild extends Context.Service<Esbuild, EsbuildService>()("effect-build/internal/Esbuild") {}

const liveArtifacts = new WeakSet<JavaScriptBundleArtifact>();

export const getJavaScriptBundleArtifact = (value: unknown): JavaScriptBundleArtifact | undefined =>
  typeof value === "object"
    && value !== null
    && liveArtifacts.has(value as JavaScriptBundleArtifact)
    ? value as JavaScriptBundleArtifact
    : undefined;

interface BoundedString {
  readonly value: string;
  readonly truncated: boolean;
}

const truncateUtf8 = (value: string, maximumBytes: number): BoundedString => {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const width = new TextEncoder().encode(character).byteLength;
    if (bytes + width > maximumBytes) return { value: result, truncated: true };
    result += character;
    bytes += width;
  }
  return { value: result, truncated: false };
};

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const messageArray = (value: unknown, key: "errors" | "warnings"): readonly unknown[] => {
  if (!isRecord(value)) return [];
  const messages = value[key];
  return Array.isArray(messages) ? messages : [];
};

const diagnosticsFrom = (messages: readonly unknown[]): EsbuildFailed => {
  let truncated = messages.length > 100;
  const diagnostics: EsbuildDiagnostic[] = [];
  for (const message of messages.slice(0, 100)) {
    const record = isRecord(message) ? message : {};
    const boundedId = truncateUtf8(typeof record.id === "string" ? record.id : "", 256);
    const boundedText = truncateUtf8(
      typeof record.text === "string" ? record.text : String(message),
      16 * 1024,
    );
    truncated ||= boundedId.truncated || boundedText.truncated;
    const location = isRecord(record.location) ? record.location : undefined;
    if (location !== undefined) {
      const file = truncateUtf8(typeof location.file === "string" ? location.file : "", 4 * 1024);
      const line = location.line;
      const column = location.column;
      if (
        typeof location.file === "string"
        && typeof line === "number"
        && Number.isSafeInteger(line)
        && line >= 0
        && typeof column === "number"
        && Number.isSafeInteger(column)
        && column >= 0
      ) {
        truncated ||= file.truncated;
        diagnostics.push({
          id: boundedId.value,
          text: boundedText.value,
          location: { file: file.value, line, column },
        });
        continue;
      }
      truncated = true;
    }
    diagnostics.push({ id: boundedId.value, text: boundedText.value });
  }
  return new EsbuildFailed({ diagnostics, truncated });
};

const esbuildFailure = (error: unknown): EsbuildFailed => {
  const messages = [...messageArray(error, "errors"), ...messageArray(error, "warnings")];
  return diagnosticsFrom(
    messages.length === 0
      ? [{ id: "", text: error instanceof Error ? error.message : String(error) }]
      : messages,
  );
};

const invalidInput = (reason: string): InvalidBundleInput => new InvalidBundleInput({ reason });

const decodeInput = (value: unknown): Effect.Effect<JavaScriptBundleInput, InvalidBundleInput> =>
  Effect.gen(function*() {
    if (!isRecord(value)) return yield* invalidInput("expected-object");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !["entrypoint", "format", "cwd"].includes(key))) {
      return yield* invalidInput("unknown-field");
    }
    if (!Object.hasOwn(value, "entrypoint") || !Object.hasOwn(value, "format")) {
      return yield* invalidInput("missing-field");
    }
    if (typeof value.entrypoint !== "string" || value.entrypoint.length === 0 || value.entrypoint.includes("\0")) {
      return yield* invalidInput("invalid-entrypoint");
    }
    if (value.format !== "esm" && value.format !== "cjs") return yield* invalidInput("invalid-format");
    const cwd = Object.hasOwn(value, "cwd") ? value.cwd : undefined;
    if (
      cwd !== undefined
      && (typeof cwd !== "string" || cwd.length === 0 || cwd.includes("\0"))
    ) return yield* invalidInput("invalid-cwd");
    return {
      entrypoint: value.entrypoint,
      format: value.format,
      ...(cwd === undefined ? {} : { cwd }),
    };
  });

const materializationFailed = (
  path: string,
  operation: BundleMaterializationOperation,
  error: { readonly message: string },
): BundleMaterializationFailed => new BundleMaterializationFailed({ path, operation, reason: error.message });

const fixedOptions = (
  resolvedCwd: string,
  resolvedEntrypoint: string,
  stagedPath: string,
  format: "esm" | "cjs",
): BundleBuildOptions => ({
  absWorkingDir: resolvedCwd,
  entryPoints: [resolvedEntrypoint],
  outfile: stagedPath,
  bundle: true,
  splitting: false,
  platform: "node",
  packages: "bundle",
  format,
  target: nodeSyntaxTarget,
  write: false,
  metafile: true,
  logLevel: "silent",
  plugins: [],
  supported: { "dynamic-import": false },
  logOverride: {
    "unsupported-dynamic-import": "error",
    "unsupported-require-call": "error",
    "indirect-require": "error",
    "require-resolve-not-external": "error",
    "direct-eval": "error",
    "ignored-dynamic-import": "error",
    "empty-glob": "error",
  },
});

const releaseContext = (context: BundleContext): Effect.Effect<void> =>
  Effect.uninterruptible(
    Effect.promise(() => context.cancel()).pipe(
      Effect.ensuring(Effect.promise(() => context.dispose())),
    ),
  );

const validateResult = (
  path: Path.Path,
  result: BundleBuildResult,
  resolvedCwd: string,
  resolvedEntrypoint: string,
  stagedPath: string,
  format: "esm" | "cjs",
): Effect.Effect<
  { readonly bytes: Uint8Array; readonly externalImports: readonly string[] },
  EsbuildFailed | JavaScriptBundleInvalid
> =>
  Effect.gen(function*() {
    const messages = [...result.errors, ...result.warnings];
    if (messages.length > 0) return yield* diagnosticsFrom(messages);
    if (!Array.isArray(result.outputFiles) || result.outputFiles.length !== 1) {
      return yield* new JavaScriptBundleInvalid({ reason: "expected-one-output-file" });
    }
    const outputFile = result.outputFiles[0];
    if (outputFile === undefined) {
      return yield* new JavaScriptBundleInvalid({ reason: "expected-one-output-file" });
    }
    if (path.normalize(outputFile.path) !== stagedPath) {
      return yield* new JavaScriptBundleInvalid({ reason: "output-file-path-mismatch" });
    }
    if (!isRecord(result.metafile) || !isRecord(result.metafile.inputs) || !isRecord(result.metafile.outputs)) {
      return yield* new JavaScriptBundleInvalid({ reason: "missing-metafile" });
    }
    const outputs = Object.entries(result.metafile.outputs);
    if (outputs.length !== 1) return yield* new JavaScriptBundleInvalid({ reason: "expected-one-metafile-output" });
    const firstOutput = outputs[0];
    if (firstOutput === undefined) {
      return yield* new JavaScriptBundleInvalid({ reason: "expected-one-metafile-output" });
    }
    const [outputKey, output] = firstOutput;
    if (path.normalize(path.resolve(resolvedCwd, outputKey)) !== stagedPath || !isRecord(output)) {
      return yield* new JavaScriptBundleInvalid({ reason: "metafile-output-mismatch" });
    }
    if (
      typeof output.entryPoint !== "string"
      || path.normalize(path.resolve(resolvedCwd, output.entryPoint)) !== resolvedEntrypoint
    ) {
      return yield* new JavaScriptBundleInvalid({ reason: "entrypoint-mismatch" });
    }
    if (output.cssBundle !== undefined) {
      return yield* new JavaScriptBundleInvalid({ reason: "css-output-not-supported" });
    }
    for (const input of Object.values(result.metafile.inputs)) {
      if (!isRecord(input) || !Array.isArray(input.imports)) {
        return yield* new JavaScriptBundleInvalid({ reason: "invalid-input-metafile-record" });
      }
      for (const edge of input.imports) {
        if (!isRecord(edge) || typeof edge.path !== "string" || typeof edge.kind !== "string") {
          return yield* new JavaScriptBundleInvalid({ reason: "invalid-input-import" });
        }
        if (edge.path === "<runtime>") {
          return yield* new JavaScriptBundleInvalid({ reason: "runtime-import-not-supported" });
        }
        if (edge.kind === "require-resolve") {
          return yield* new JavaScriptBundleInvalid({ reason: "require-resolve-not-supported" });
        }
        if (!inputImportKinds.has(edge.kind)) {
          return yield* new JavaScriptBundleInvalid({ reason: "unknown-input-import-kind" });
        }
      }
    }
    if (!Array.isArray(output.imports)) {
      return yield* new JavaScriptBundleInvalid({ reason: "invalid-output-imports" });
    }
    const allowedOutputKind = format === "cjs" ? "require-call" : "import-statement";
    const externalImports = new Set<string>();
    for (const edge of output.imports) {
      if (!isRecord(edge) || typeof edge.path !== "string" || typeof edge.kind !== "string") {
        return yield* new JavaScriptBundleInvalid({ reason: "invalid-output-import" });
      }
      if (edge.path === "<runtime>") {
        return yield* new JavaScriptBundleInvalid({ reason: "runtime-import-not-supported" });
      }
      if (edge.kind === "require-resolve") {
        return yield* new JavaScriptBundleInvalid({ reason: "require-resolve-not-supported" });
      }
      if (edge.external !== true || edge.kind !== allowedOutputKind) {
        return yield* new JavaScriptBundleInvalid({ reason: "unsupported-output-import" });
      }
      externalImports.add(edge.path);
    }
    return { bytes: outputFile.contents, externalImports: Object.freeze([...externalImports].sort()) };
  });

const makeArtifact = (
  path: string,
  format: "esm" | "cjs",
  observedExternalImports: readonly string[],
): JavaScriptBundleArtifact => {
  const tool = Object.freeze({ name: "esbuild" as const, version: expectedVersion });
  const stage = Object.freeze({ operation: "bundle" as const, tool });
  return Object.freeze({
    path,
    format,
    nodeSyntaxTarget,
    observedExternalImports,
    stage,
  });
};

export const makeEsbuildService = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  api: EsbuildApi,
): Effect.Effect<EsbuildService, EsbuildVersionMismatch> =>
  Effect.gen(function*() {
    if (api.version !== expectedVersion) {
      return yield* new EsbuildVersionMismatch({ expected: expectedVersion, observed: api.version });
    }
    const withJavaScriptBundle: EsbuildService["withJavaScriptBundle"] = Effect.fn(
      "Esbuild.withJavaScriptBundle",
    )(<A, E, R>(input: JavaScriptBundleInput, use: (bundle: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>) =>
      Effect.scoped(
        Effect.gen(function*() {
          const decoded = yield* decodeInput(input);
          const resolvedCwd = path.normalize(path.resolve(decoded.cwd ?? ""));
          const resolvedEntrypoint = path.normalize(path.resolve(resolvedCwd, decoded.entrypoint));
          if (!allowedEntrypointExtensions.has(path.extname(resolvedEntrypoint).toLowerCase())) {
            return yield* invalidInput("unsupported-entrypoint-extension");
          }
          const inputInformation = yield* fileSystem.stat(resolvedEntrypoint).pipe(
            Effect.mapError((error) => invalidInput(error.message)),
          );
          if (inputInformation.type !== "File") return yield* invalidInput("entrypoint-not-regular");
          const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-esbuild-" })
            .pipe(
              Effect.mapError((error) => materializationFailed(resolvedCwd, "make-temp", error)),
            );
          const stagedPath = path.normalize(
            path.resolve(temporaryDirectory, decoded.format === "esm" ? "main.mjs" : "main.cjs"),
          );
          const options = fixedOptions(resolvedCwd, resolvedEntrypoint, stagedPath, decoded.format);
          const context = yield* Effect.acquireRelease(
            Effect.tryPromise({ try: () => api.context(options), catch: esbuildFailure }),
            releaseContext,
          );
          const result = yield* Effect.tryPromise({ try: () => context.rebuild(), catch: esbuildFailure });
          const validated = yield* validateResult(
            path,
            result,
            resolvedCwd,
            resolvedEntrypoint,
            stagedPath,
            decoded.format,
          );
          yield* fileSystem.writeFile(stagedPath, validated.bytes).pipe(
            Effect.mapError((error) => materializationFailed(stagedPath, "write", error)),
          );
          const information = yield* fileSystem.stat(stagedPath).pipe(
            Effect.mapError((error) => materializationFailed(stagedPath, "stat", error)),
          );
          if (information.type !== "File") {
            return yield* new BundleMaterializationFailed({
              path: stagedPath,
              operation: "stat",
              reason: "not-regular",
            });
          }
          const artifact = makeArtifact(stagedPath, decoded.format, validated.externalImports);
          const registered = yield* Effect.acquireRelease(
            Effect.sync(() => {
              liveArtifacts.add(artifact);
              return artifact;
            }),
            (value) => Effect.sync(() => liveArtifacts.delete(value)),
          );
          return yield* use(registered);
        }),
      )
    );
    return { withJavaScriptBundle };
  });

export const withJavaScriptBundle = <A, E, R>(
  input: JavaScriptBundleInput,
  use: (bundle: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
): Effect.Effect<A, EsbuildBundleError | E, Esbuild | Exclude<R, Scope.Scope>> =>
  Esbuild.use((service) => service.withJavaScriptBundle(input, use));

const realApi: EsbuildApi = {
  version: esbuild.version,
  context: (options) => esbuild.context(options),
};

export const layer: Layer.Layer<
  Esbuild,
  EsbuildVersionMismatch,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  Esbuild,
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* makeEsbuildService(fileSystem, path, realApi);
  }),
);
