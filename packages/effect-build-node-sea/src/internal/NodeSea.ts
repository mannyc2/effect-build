import {
  Cause,
  Context,
  Crypto,
  Effect,
  FileSystem,
  HashSet,
  Layer,
  Path,
  type PlatformError,
  Result,
  Schema,
} from "effect";
import * as Core from "effect-build";
import * as Integration from "effect-build/Integration";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { inspectSelectedNodeExecutable } from "./SelectedNodeExecutable.js";

const DiagnosticSchema = Core.BuildError.Diagnostic;
const StageObservationSchema = Core.Artifact.StageObservation;

export const nodeSeaVersion = "26.7.0" as const;
export const nodeSeaTarget = "linux-x64-gnu" as const;

export const nodeSeaMetadataProbeSource = [
  "import { builtinModules, isBuiltin } from 'node:module';",
  "const candidates = new Set();",
  "for (const listed of builtinModules) {",
  '  const bare = listed.startsWith("node:") ? listed.slice(5) : listed;',
  "  for (const candidate of [bare, `node:${bare}`]) if (isBuiltin(candidate)) candidates.add(candidate);",
  "}",
  "process.stdout.write(JSON.stringify({",
  "  version: process.versions.node,",
  "  path: process.execPath,",
  "  platform: process.platform,",
  "  architecture: process.arch,",
  "  glibc: process.report?.getReport()?.header?.glibcVersionRuntime,",
  "  builtinSpecifiers: [...candidates].sort(),",
  "}));",
].join("\n");

export interface NodeSeaStage {
  readonly operation: "assemble-node-sea";
  readonly tool: {
    readonly name: "node";
    readonly version: "26.7.0";
    readonly path: Core.Artifact.FileArtifact["path"];
  };
}

export type Artifact<
  MainStages extends readonly Core.Artifact.StageObservation[] = readonly Core.Artifact.StageObservation[],
> = Readonly<
  Omit<Core.Artifact.ExecutableArtifact, "target" | "stages"> & {
    readonly provider: "node-sea";
    readonly target: "linux-x64-gnu";
    readonly stages: readonly [...MainStages, NodeSeaStage];
  }
>;

export interface CreateExecutableInput<
  MainStages extends readonly Core.Artifact.StageObservation[] = readonly Core.Artifact.StageObservation[],
> {
  readonly main: Core.JavaScriptBundle.Artifact<MainStages>;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly assets?: readonly {
    readonly key: string;
    readonly path: string;
  }[];
}

export interface LayerOptions {
  readonly executable?: string;
}

export class NodeSeaToolNotFound extends Schema.TaggedError<NodeSeaToolNotFound>(
  "effect-build-node-sea/NodeSeaToolNotFound",
)("NodeSeaToolNotFound", { command: Schema.String }) {}

export class NodeSeaProbeFailed extends Schema.TaggedError<NodeSeaProbeFailed>(
  "effect-build-node-sea/NodeSeaProbeFailed",
)("NodeSeaProbeFailed", { reason: Schema.String }) {}

const InvalidNodeSeaInputReason = Schema.Union([
  Schema.Literals(
    [
      "expected-object",
      "unknown-field",
      "missing-field",
      "invalid-outfile",
      "invalid-cwd",
      "invalid-digest",
      "invalid-assets",
      "invalid-asset",
      "invalid-asset-key",
      "asset-key-too-long",
      "duplicate-asset-key",
      "invalid-asset-path",
      "main-artifact-not-live",
      "main-artifact-not-regular",
      "main-artifact-invalid-byte-count",
      "main-artifact-changed",
      "main-resolution-target-mismatch",
      "cwd-not-directory",
      "asset-not-regular",
      "destination-aliases-input",
    ] as const,
  ),
  Schema.TemplateLiteral(["external-import-not-builtin:", Schema.NonEmptyString]),
]);
type InvalidNodeSeaInputReason = typeof InvalidNodeSeaInputReason.Type;

export class InvalidNodeSeaInput extends Schema.TaggedError<InvalidNodeSeaInput>(
  "effect-build-node-sea/InvalidNodeSeaInput",
)("InvalidNodeSeaInput", { reason: InvalidNodeSeaInputReason }) {}

export const NodeSeaPreparationOperation = Schema.Literals(
  [
    "realpath",
    "stat",
    "read-main",
    "digest-main",
    "make-config",
    "write-config",
    "copy-main",
    "digest-main-copy",
    "decode-stages",
  ] as const,
);
export type NodeSeaPreparationOperation = typeof NodeSeaPreparationOperation.Type;

export class NodeSeaPreparationFailed extends Schema.TaggedError<NodeSeaPreparationFailed>(
  "effect-build-node-sea/NodeSeaPreparationFailed",
)("NodeSeaPreparationFailed", {
  path: Schema.String,
  operation: NodeSeaPreparationOperation,
  reason: Schema.String,
}) {}

export class NodeSeaSpawnFailed extends Schema.TaggedError<NodeSeaSpawnFailed>(
  "effect-build-node-sea/NodeSeaSpawnFailed",
)("NodeSeaSpawnFailed", { reason: Schema.String }) {}

export class NodeSeaSyntaxCheckFailed extends Schema.TaggedError<NodeSeaSyntaxCheckFailed>(
  "effect-build-node-sea/NodeSeaSyntaxCheckFailed",
)("NodeSeaSyntaxCheckFailed", {
  exitCode: Schema.Number,
  diagnostics: Schema.Array(DiagnosticSchema),
}) {}

export class NodeSeaFailed extends Schema.TaggedError<NodeSeaFailed>("effect-build-node-sea/NodeSeaFailed")(
  "NodeSeaFailed",
  {
    exitCode: Schema.Number,
    diagnostics: Schema.Array(DiagnosticSchema),
  },
) {}

export type NodeSeaLayerError = NodeSeaToolNotFound | NodeSeaProbeFailed;
export type NodeSeaCreateError =
  | InvalidNodeSeaInput
  | NodeSeaPreparationFailed
  | NodeSeaSpawnFailed
  | NodeSeaSyntaxCheckFailed
  | NodeSeaFailed
  | Core.BuildError.OutputMissing
  | Core.BuildError.OutputInvalid
  | Core.BuildError.OutputLocked
  | Core.BuildError.PublicationFailed;

export interface Service {
  readonly createExecutable: <const MainStages extends readonly Core.Artifact.StageObservation[]>(
    input: CreateExecutableInput<MainStages>,
  ) => Effect.Effect<Artifact<MainStages>, NodeSeaCreateError>;
}

export class NodeSea extends Context.Service<NodeSea, Service>()("effect-build-node-sea/NodeSea") {}

export const createExecutable = <const MainStages extends readonly Core.Artifact.StageObservation[]>(
  input: CreateExecutableInput<MainStages>,
): Effect.Effect<Artifact<MainStages>, NodeSeaCreateError, NodeSea> =>
  NodeSea.use((service) => service.createExecutable(input));

export interface SelectedNodeSeaTool {
  readonly path: Core.Artifact.AbsolutePath;
  readonly version: "26.7.0";
  readonly target: "linux-x64-gnu";
  readonly builtinSpecifiers: HashSet.HashSet<string>;
}

export interface NodeSeaRuntime {
  readonly run: (
    executable: string,
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<Integration.CommandCompletion, PlatformError.PlatformError>;
}

export interface NodeSeaService extends Service {
  readonly selectedTool: SelectedNodeSeaTool;
}

interface MetadataProbe {
  readonly version: string;
  readonly path: string;
  readonly platform: string;
  readonly architecture: string;
  readonly glibc: string | undefined;
  readonly builtinSpecifiers: readonly string[];
}

interface DecodedAsset {
  readonly key: string;
  readonly path: string;
}

interface DecodedInput<MainStages extends readonly Core.Artifact.StageObservation[]> {
  readonly main: Core.JavaScriptBundle.Artifact<MainStages>;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly assets: readonly DecodedAsset[];
}

interface PreparedAsset {
  readonly key: string;
  readonly path: string;
  readonly realPath: string;
}

interface PreparedInput<MainStages extends readonly Core.Artifact.StageObservation[]> {
  readonly mainPath: string;
  readonly mainStages: MainStages;
  readonly privateMainPath: string;
  readonly configPath: string;
  readonly mainFormat: "commonjs" | "module";
  readonly resolvedCwd: string;
  readonly assets: readonly PreparedAsset[];
  readonly nodeStage: NodeSeaStage;
}

const isRecord = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidInput = (reason: InvalidNodeSeaInputReason): InvalidNodeSeaInput => new InvalidNodeSeaInput({ reason });

const preparationFailed = (
  path: string,
  operation: NodeSeaPreparationOperation,
  reason: string,
): NodeSeaPreparationFailed => new NodeSeaPreparationFailed({ path, operation, reason });

const InputPath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => value.length > 0 && !value.includes("\0") ? true : "invalid path"),
  ),
);

const decodeField = <A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
  reason: InvalidNodeSeaInputReason,
): Result.Result<A, InvalidNodeSeaInput> =>
  Result.mapError(Schema.decodeUnknownResult(schema)(value), () => invalidInput(reason));

const decodeInput = <MainStages extends readonly Core.Artifact.StageObservation[]>(
  input: unknown,
): Result.Result<DecodedInput<MainStages>, InvalidNodeSeaInput> => {
  if (!isRecord(input)) return Result.fail(invalidInput("expected-object"));
  const allowed = new Set(["main", "outfile", "cwd", "digest", "assets"]);
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string" || !allowed.has(key))) {
    return Result.fail(invalidInput("unknown-field"));
  }
  if (!Object.hasOwn(input, "main") || !Object.hasOwn(input, "outfile")) {
    return Result.fail(invalidInput("missing-field"));
  }
  const outfile = decodeField(InputPath, input.outfile, "invalid-outfile");
  if (Result.isFailure(outfile)) return Result.fail(outfile.failure);
  const cwd = Object.hasOwn(input, "cwd")
    ? decodeField(InputPath, input.cwd, "invalid-cwd")
    : Result.succeed(undefined);
  if (Result.isFailure(cwd)) return Result.fail(cwd.failure);
  const digest = Object.hasOwn(input, "digest")
    ? decodeField(Schema.Boolean, input.digest, "invalid-digest")
    : Result.succeed(undefined);
  if (Result.isFailure(digest)) return Result.fail(digest.failure);
  const rawAssets = Object.hasOwn(input, "assets") ? input.assets : [];
  if (!Array.isArray(rawAssets) || rawAssets.length > 256) {
    return Result.fail(invalidInput("invalid-assets"));
  }
  const keys = new Set<string>();
  const assets: DecodedAsset[] = [];
  for (let index = 0; index < rawAssets.length; index++) {
    if (!Object.hasOwn(rawAssets, index) || !isRecord(rawAssets[index])) {
      return Result.fail(invalidInput("invalid-asset"));
    }
    const asset = rawAssets[index];
    if (
      Reflect.ownKeys(asset).some((key) => typeof key !== "string" || (key !== "key" && key !== "path"))
      || !Object.hasOwn(asset, "key")
      || !Object.hasOwn(asset, "path")
    ) return Result.fail(invalidInput("invalid-asset"));
    const key = decodeField(InputPath, asset.key, "invalid-asset-key");
    if (Result.isFailure(key)) return Result.fail(key.failure);
    if (new TextEncoder().encode(key.success).byteLength > 1024) {
      return Result.fail(invalidInput("asset-key-too-long"));
    }
    if (keys.has(key.success)) return Result.fail(invalidInput("duplicate-asset-key"));
    const assetPath = decodeField(InputPath, asset.path, "invalid-asset-path");
    if (Result.isFailure(assetPath)) return Result.fail(assetPath.failure);
    keys.add(key.success);
    assets.push({ key: key.success, path: assetPath.success });
  }
  return Result.succeed({
    main: input.main as Core.JavaScriptBundle.Artifact<MainStages>,
    outfile: outfile.success,
    ...(cwd.success === undefined ? {} : { cwd: cwd.success }),
    ...(digest.success === undefined ? {} : { digest: digest.success }),
    assets: Object.freeze(assets),
  });
};

const probeFailed = (reason: string): NodeSeaProbeFailed => new NodeSeaProbeFailed({ reason });

const parseMetadata = (completion: Integration.CommandCompletion): Effect.Effect<MetadataProbe, NodeSeaProbeFailed> =>
  Effect.try({
    try: () => {
      if (completion.exitCode !== 0) {
        throw new Error(completion.stderr.text || `metadata probe exited with code ${completion.exitCode}`);
      }
      if (completion.stdout.truncated || completion.stderr.truncated) {
        throw new Error("metadata probe output was truncated");
      }
      const value: unknown = JSON.parse(completion.stdout.text.trim());
      if (
        !isRecord(value)
        || Reflect.ownKeys(value).some((key) =>
          typeof key !== "string"
          || !["version", "path", "platform", "architecture", "glibc", "builtinSpecifiers"].includes(key)
        )
        || typeof value.version !== "string"
        || typeof value.path !== "string"
        || typeof value.platform !== "string"
        || typeof value.architecture !== "string"
        || (value.glibc !== undefined && typeof value.glibc !== "string")
        || !Array.isArray(value.builtinSpecifiers)
        || value.builtinSpecifiers.some((specifier) => typeof specifier !== "string")
      ) throw new Error("metadata probe returned malformed JSON");
      const builtinSpecifiers = value.builtinSpecifiers as string[];
      if (
        builtinSpecifiers.length === 0
        || new Set(builtinSpecifiers).size !== builtinSpecifiers.length
        || builtinSpecifiers.some((specifier, index) => index > 0 && builtinSpecifiers[index - 1]! >= specifier)
      ) throw new Error("metadata probe returned invalid builtin specifiers");
      return {
        version: value.version,
        path: value.path,
        platform: value.platform,
        architecture: value.architecture,
        glibc: value.glibc as string | undefined,
        builtinSpecifiers,
      };
    },
    catch: (error) => probeFailed(String(error)),
  });

const mapLayerPlatformError = (
  command: string,
  error: PlatformError.PlatformError,
): NodeSeaToolNotFound | NodeSeaProbeFailed =>
  error.reason._tag === "NotFound"
    ? new NodeSeaToolNotFound({ command })
    : probeFailed(error.message);

const validateSelectedFile = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  command: string,
): Effect.Effect<Core.Artifact.AbsolutePath, NodeSeaToolNotFound | NodeSeaProbeFailed> =>
  Effect.gen(function*() {
    const real = yield* fileSystem.realPath(command).pipe(
      Effect.mapError((error) => mapLayerPlatformError(command, error)),
    );
    const canonical = path.normalize(real);
    if (!path.isAbsolute(canonical)) return yield* probeFailed("selected executable realpath is not absolute");
    const information = yield* fileSystem.stat(canonical).pipe(
      Effect.mapError((error) => mapLayerPlatformError(command, error)),
    );
    if (information.type !== "File") return yield* probeFailed("selected executable is not a regular file");
    if ((information.mode & 0o111) === 0) return yield* probeFailed("selected executable is not executable");
    yield* inspectSelectedNodeExecutable(fileSystem, canonical, information.size).pipe(
      Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, (error) => probeFailed(error.reason)))),
    );
    return canonical as Core.Artifact.AbsolutePath;
  });

const processDiagnostics = (completion: Integration.CommandCompletion): readonly Core.BuildError.Diagnostic[] => [
  { channel: "stdout", text: completion.stdout.text, truncated: completion.stdout.truncated },
  { channel: "stderr", text: completion.stderr.text, truncated: completion.stderr.truncated },
];

const nearestCanonicalPath = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<string, NodeSeaPreparationFailed> =>
  Effect.gen(function*() {
    let current = target;
    const suffix: string[] = [];
    for (;;) {
      const exists = yield* fileSystem.exists(current).pipe(
        Effect.mapError((error) => preparationFailed(current, "stat", error.message)),
      );
      if (exists) {
        const real = yield* fileSystem.realPath(current).pipe(
          Effect.mapError((error) => preparationFailed(current, "realpath", error.message)),
        );
        return path.normalize(path.resolve(real, ...suffix));
      }
      const parent = path.dirname(current);
      if (parent === current) return yield* preparationFailed(target, "realpath", "no existing ancestor");
      suffix.unshift(path.basename(current));
      current = parent;
    }
  });

const mapMainArtifactError = (
  error: Core.JavaScriptBundle.InvalidJavaScriptBundle | Core.JavaScriptBundle.JavaScriptBundleAccessFailed,
): InvalidNodeSeaInput | NodeSeaPreparationFailed => {
  if (Core.JavaScriptBundle.JavaScriptBundleAccessFailed.is(error)) {
    return preparationFailed(
      error.path,
      error.operation === "read" ? "read-main" : error.operation === "digest" ? "digest-main" : error.operation,
      error.reason,
    );
  }
  switch (error.reason) {
    case "file-not-regular":
      return invalidInput("main-artifact-not-regular");
    case "invalid-byte-count":
      return invalidInput("main-artifact-invalid-byte-count");
    case "byte-count-changed":
    case "digest-changed":
      return invalidInput("main-artifact-changed");
    default:
      return invalidInput("main-artifact-not-live");
  }
};

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const digestFile = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  file: string,
): Effect.Effect<Core.Artifact.Digest, NodeSeaPreparationFailed> =>
  fileSystem.readFile(file).pipe(
    Effect.flatMap((contents) => crypto.digest("SHA-256", contents)),
    Effect.map((digest) => `sha256:${hex(digest)}` as Core.Artifact.Digest),
    Effect.mapError((error) => preparationFailed(file, "digest-main-copy", error.message)),
  );

const freezeStages = <Stages extends readonly Core.Artifact.StageObservation[]>(
  stages: readonly Core.Artifact.StageObservation[],
): Stages =>
  Object.freeze(stages.map((stage) => Object.freeze({ ...stage, tool: Object.freeze({ ...stage.tool }) }))) as Stages;

const stageEquals = (left: Core.Artifact.StageObservation, right: Core.Artifact.StageObservation): boolean =>
  left.operation === right.operation
  && left.tool.name === right.tool.name
  && left.tool.version === right.tool.version
  && left.tool.path === right.tool.path
  && Object.keys(left.tool).length === Object.keys(right.tool).length
  && Object.keys(left).length === Object.keys(right).length;

const decodeStages = <MainStages extends readonly Core.Artifact.StageObservation[]>(
  prepared: PreparedInput<MainStages>,
  value: unknown,
): Result.Result<readonly [...MainStages, NodeSeaStage], NodeSeaPreparationFailed> =>
  Result.flatMap(
    Result.mapError(
      Schema.decodeUnknownResult(Schema.Array(StageObservationSchema), { onExcessProperty: "error" })(value),
      () => preparationFailed(prepared.mainPath, "decode-stages", "invalid stage array"),
    ),
    (observed) => {
      const expected = [...prepared.mainStages, prepared.nodeStage] as const;
      if (
        observed.length !== expected.length
        || observed.some((stage, index) => !stageEquals(stage, expected[index]!))
      ) return Result.fail(preparationFailed(prepared.mainPath, "decode-stages", "stage observations changed"));
      return Result.succeed(
        Object.freeze([...prepared.mainStages, prepared.nodeStage]) as readonly [...MainStages, NodeSeaStage],
      );
    },
  );

const prepareInput = <MainStages extends readonly Core.Artifact.StageObservation[]>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  runtime: NodeSeaRuntime,
  tool: SelectedNodeSeaTool,
  decoded: DecodedInput<MainStages>,
  resolvedDestination: string,
): Effect.Effect<
  PreparedInput<MainStages>,
  InvalidNodeSeaInput | NodeSeaPreparationFailed | NodeSeaSpawnFailed | NodeSeaSyntaxCheckFailed,
  import("effect").Scope.Scope
> =>
  Effect.gen(function*() {
    const main = yield* Integration.inspectLiveJavaScriptBundle(decoded.main).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.mapError(mapMainArtifactError),
    );
    if (main.resolutionTarget !== "node") return yield* invalidInput("main-resolution-target-mismatch");
    for (const specifier of main.observedExternalImports) {
      if (!HashSet.has(tool.builtinSpecifiers, specifier)) {
        return yield* invalidInput(`external-import-not-builtin:${specifier}`);
      }
    }

    const resolvedCwd = path.normalize(path.resolve(decoded.cwd ?? ""));
    const cwdInformation = yield* fileSystem.stat(resolvedCwd).pipe(
      Effect.mapError((error) =>
        error.reason._tag === "NotFound"
          ? invalidInput("cwd-not-directory")
          : preparationFailed(resolvedCwd, "stat", error.message)
      ),
    );
    if (cwdInformation.type !== "Directory") return yield* invalidInput("cwd-not-directory");

    const assets: PreparedAsset[] = [];
    for (const asset of decoded.assets) {
      const resolved = path.normalize(path.resolve(resolvedCwd, asset.path));
      const information = yield* fileSystem.stat(resolved).pipe(
        Effect.mapError((error) =>
          error.reason._tag === "NotFound"
            ? invalidInput("asset-not-regular")
            : preparationFailed(resolved, "stat", error.message)
        ),
      );
      if (information.type !== "File") return yield* invalidInput("asset-not-regular");
      const real = yield* fileSystem.realPath(resolved).pipe(
        Effect.mapError((error) => preparationFailed(resolved, "realpath", error.message)),
      );
      assets.push({ key: asset.key, path: resolved, realPath: path.normalize(real) });
    }

    const destinationPhysical = yield* nearestCanonicalPath(fileSystem, path, resolvedDestination);
    const sources = [main.path, tool.path, ...assets.map((asset) => asset.path)];
    const physicalSources = [main.path, tool.path, ...assets.map((asset) => asset.realPath)];
    if (sources.includes(resolvedDestination) || physicalSources.includes(destinationPhysical)) {
      return yield* invalidInput("destination-aliases-input");
    }

    const configDirectory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-node-sea-" }).pipe(
      Effect.mapError((error) => preparationFailed(resolvedDestination, "make-config", error.message)),
    );
    const privateMainPath = path.normalize(
      path.resolve(configDirectory, main.format === "esm" ? "sea-main.mjs" : "sea-main.cjs"),
    );
    const configPath = path.normalize(path.resolve(configDirectory, "sea-config.json"));
    yield* fileSystem.copyFile(main.path, privateMainPath).pipe(
      Effect.mapError((error) => preparationFailed(privateMainPath, "copy-main", error.message)),
    );
    const privateDigest = yield* digestFile(fileSystem, crypto, privateMainPath);
    if (privateDigest !== main.digest) return yield* invalidInput("main-artifact-changed");

    const syntax = yield* runtime.run(tool.path, ["--check", privateMainPath], resolvedCwd).pipe(
      Effect.mapError((error) => new NodeSeaSpawnFailed({ reason: error.message })),
    );
    if (syntax.exitCode !== 0) {
      return yield* new NodeSeaSyntaxCheckFailed({
        exitCode: syntax.exitCode,
        diagnostics: processDiagnostics(syntax),
      });
    }

    const nodeStage = Object.freeze({
      operation: "assemble-node-sea" as const,
      tool: Object.freeze({ name: "node" as const, version: nodeSeaVersion, path: tool.path }),
    });
    return {
      mainPath: main.path,
      mainStages: freezeStages<MainStages>(main.stages),
      privateMainPath,
      configPath,
      mainFormat: main.format === "cjs" ? "commonjs" : "module",
      resolvedCwd,
      assets: Object.freeze(assets),
      nodeStage,
    };
  });

export const makeNodeSeaService = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  options: LayerOptions,
  runtime: NodeSeaRuntime,
): Effect.Effect<NodeSeaService, NodeSeaLayerError> =>
  Effect.gen(function*() {
    const rawOptions: unknown = options;
    if (!isRecord(rawOptions)) return yield* probeFailed("layer options must be an object");
    const executablePresent = Object.hasOwn(rawOptions, "executable");
    const executableValue = executablePresent ? rawOptions.executable : undefined;
    if (
      Reflect.ownKeys(rawOptions).some((key) => typeof key !== "string" || key !== "executable")
      || (executablePresent && typeof executableValue !== "string")
    ) return yield* probeFailed("invalid layer options");
    const explicit = typeof executableValue === "string" ? executableValue : undefined;
    if (explicit !== undefined && !path.isAbsolute(explicit)) {
      return yield* probeFailed("explicit executable must be an absolute path");
    }

    const command = explicit ?? "node";
    let canonical: Core.Artifact.AbsolutePath;
    let metadata: MetadataProbe;
    if (explicit !== undefined) {
      canonical = yield* validateSelectedFile(fileSystem, path, explicit);
      const completion = yield* runtime.run(canonical, ["--input-type=module", "--eval", nodeSeaMetadataProbeSource])
        .pipe(Effect.mapError((error) => mapLayerPlatformError(command, error)));
      metadata = yield* parseMetadata(completion);
    } else {
      const completion = yield* runtime.run(command, ["--input-type=module", "--eval", nodeSeaMetadataProbeSource])
        .pipe(Effect.mapError((error) => mapLayerPlatformError(command, error)));
      metadata = yield* parseMetadata(completion);
      if (!path.isAbsolute(metadata.path)) {
        return yield* probeFailed("metadata probe reported a relative executable path");
      }
      canonical = yield* validateSelectedFile(fileSystem, path, metadata.path);
    }
    if (!path.isAbsolute(metadata.path)) {
      return yield* probeFailed("metadata probe reported a relative executable path");
    }
    const reportedRealPath = yield* fileSystem.realPath(metadata.path).pipe(
      Effect.mapError((error) => mapLayerPlatformError(metadata.path, error)),
    );
    if (path.normalize(reportedRealPath) !== canonical) {
      return yield* probeFailed("metadata probe reported a different executable path");
    }
    if (metadata.version !== nodeSeaVersion) {
      return yield* probeFailed(`expected Node ${nodeSeaVersion}, observed ${metadata.version}`);
    }
    if (metadata.platform !== "linux" || metadata.architecture !== "x64" || metadata.glibc === undefined) {
      return yield* probeFailed("selected Node target is not linux-x64-gnu");
    }
    const help = yield* runtime.run(canonical, ["--help"]).pipe(
      Effect.mapError((error) => mapLayerPlatformError(canonical, error)),
    );
    if (help.exitCode !== 0) {
      return yield* probeFailed(help.stderr.text || `help probe exited with code ${help.exitCode}`);
    }
    if (help.stdout.truncated || help.stderr.truncated) {
      return yield* probeFailed("help probe output was truncated");
    }
    if (!/(?:^|\s)--build-sea(?:[=\s]|$)/m.test(help.stdout.text)) {
      return yield* probeFailed("selected Node does not advertise --build-sea");
    }

    const selectedTool: SelectedNodeSeaTool = Object.freeze({
      path: canonical,
      version: nodeSeaVersion,
      target: nodeSeaTarget,
      builtinSpecifiers: HashSet.fromIterable(metadata.builtinSpecifiers),
    });

    const createExecutable: Service["createExecutable"] = Effect.fn(
      "effect-build-node-sea/NodeSea.createExecutable",
    )(<const MainStages extends readonly Core.Artifact.StageObservation[]>(
      input: CreateExecutableInput<MainStages>,
    ) => {
      const decoded = decodeInput<MainStages>(input);
      if (Result.isFailure(decoded)) return Effect.fail(decoded.failure);
      return Integration.produceExecutable({
        outfile: decoded.success.outfile,
        ...(decoded.success.cwd === undefined ? {} : { cwd: decoded.success.cwd }),
        ...(decoded.success.digest === undefined ? {} : { digest: decoded.success.digest }),
        prepare: ({ resolvedDestination }) =>
          prepareInput(fileSystem, path, crypto, runtime, selectedTool, decoded.success, resolvedDestination),
        produce: ({ prepared, stagedOutfile }) =>
          Effect.gen(function*() {
            const assets = Object.fromEntries(prepared.assets.map((asset) => [asset.key, asset.path]));
            const config = {
              main: prepared.privateMainPath,
              mainFormat: prepared.mainFormat,
              executable: selectedTool.path,
              output: stagedOutfile,
              useSnapshot: false,
              useCodeCache: false,
              ...(prepared.assets.length === 0 ? {} : { assets }),
            };
            yield* fileSystem.writeFileString(prepared.configPath, JSON.stringify(config)).pipe(
              Effect.mapError((error) => preparationFailed(prepared.configPath, "write-config", error.message)),
            );
            const completion = yield* runtime.run(
              selectedTool.path,
              ["--build-sea", prepared.configPath],
              prepared.resolvedCwd,
            ).pipe(Effect.mapError((error) => new NodeSeaSpawnFailed({ reason: error.message })));
            if (completion.exitCode !== 0) {
              return yield* new NodeSeaFailed({
                exitCode: completion.exitCode,
                diagnostics: processDiagnostics(completion),
              });
            }
            return Object.freeze([...prepared.mainStages, prepared.nodeStage]);
          }),
        decodeStages,
        resolveTarget: (observation) =>
          observation.format === "elf"
            && observation.os === "linux"
            && observation.architecture === "x64"
            && observation.abi === "gnu"
            ? Result.succeed(nodeSeaTarget)
            : Result.fail("native target does not match selected Node SEA target"),
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.map((artifact) => Object.freeze({ ...artifact, provider: "node-sea" as const })),
      ) as Effect.Effect<Artifact<MainStages>, NodeSeaCreateError>;
    });

    return { selectedTool, createExecutable };
  });

const makeLiveNodeSeaService = (options: LayerOptions): Effect.Effect<
  NodeSeaService,
  NodeSeaLayerError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | EffectChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* EffectChildProcessSpawner.ChildProcessSpawner;
    const runtime: NodeSeaRuntime = {
      run: (executable, argv, cwd) =>
        Integration.executeCommand(executable, argv, cwd).pipe(
          Effect.provideService(EffectChildProcessSpawner.ChildProcessSpawner, spawner),
        ),
    };
    return yield* makeNodeSeaService(fileSystem, path, crypto, options, runtime);
  });

export const layer = (options: LayerOptions = {}): Layer.Layer<
  NodeSea,
  NodeSeaLayerError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | EffectChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(NodeSea, makeLiveNodeSeaService(options));
