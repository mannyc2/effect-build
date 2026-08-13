import { Context, Crypto, Effect, FileSystem, HashSet, Layer, Path, type PlatformError, Result, Schema } from "effect";
import type { Diagnostic } from "../BuildError.js";
import {
  Diagnostic as DiagnosticSchema,
  OutputInvalid,
  OutputLocked,
  OutputMissing,
  PublicationFailed,
} from "../BuildError.js";
import type { JavaScriptBundleArtifact } from "./Esbuild.js";
import { getJavaScriptBundleArtifact } from "./Esbuild.js";
import {
  acquireExecutableCandidate,
  inspectNativeExecutableFile,
  type NativeExecutableInspectionError,
  resolveExecutableDestination,
  validateAndPublishExecutable,
} from "./ExecutableLifecycle.js";
import type { NativeExecutableObservation } from "./NativeExecutable.js";
import { ChildProcessSpawner, type ProcessCompletion, runProcess } from "./Process.js";

export const nodeSeaVersion = "26.7.0" as const;
export const nodeSeaSyntaxTarget = "node26.7" as const;
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
  "  builtinSpecifiers: [...candidates].sort(),",
  "}));",
].join("\n");

export interface NodeSeaAssetInput {
  readonly key: string;
  readonly path: string;
}

export interface NodeSeaCreateInput {
  readonly main: JavaScriptBundleArtifact;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly assets?: readonly NodeSeaAssetInput[];
}

export interface PipelineExecutableArtifact {
  readonly path: string;
  readonly bytes: number;
  readonly digest?: `sha256:${string}`;
  readonly target: "linux-x64-gnu";
  readonly stages: readonly [
    JavaScriptBundleArtifact["stage"],
    {
      readonly operation: "assemble-node-sea";
      readonly tool: {
        readonly name: "node";
        readonly version: "26.7.0";
        readonly path: string;
      };
    },
  ];
}

export interface SelectedNodeSeaTool {
  readonly path: string;
  readonly version: "26.7.0";
  readonly target: "linux-x64-gnu";
  readonly builtinSpecifiers: HashSet.HashSet<string>;
}

export interface NodeSeaLayerOptions {
  readonly executable?: string;
}

export class NodeSeaToolNotFound extends Schema.TaggedError<NodeSeaToolNotFound>()(
  "NodeSeaToolNotFound",
  { command: Schema.String },
) {}

export class NodeSeaProbeFailed extends Schema.TaggedError<NodeSeaProbeFailed>()(
  "NodeSeaProbeFailed",
  { reason: Schema.String },
) {}

export class InvalidNodeSeaInput extends Schema.TaggedError<InvalidNodeSeaInput>()(
  "InvalidNodeSeaInput",
  { reason: Schema.String },
) {}

export const NodeSeaPreparationOperation = Schema.Literals(
  [
    "realpath",
    "stat",
    "make-config",
    "write-config",
  ] as const,
);
export type NodeSeaPreparationOperation = typeof NodeSeaPreparationOperation.Type;

export class NodeSeaPreparationFailed extends Schema.TaggedError<NodeSeaPreparationFailed>()(
  "NodeSeaPreparationFailed",
  {
    path: Schema.String,
    operation: NodeSeaPreparationOperation,
    reason: Schema.String,
  },
) {}

export class NodeSeaSpawnFailed extends Schema.TaggedError<NodeSeaSpawnFailed>()(
  "NodeSeaSpawnFailed",
  { reason: Schema.String },
) {}

export class NodeSeaFailed extends Schema.TaggedError<NodeSeaFailed>()(
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
  | NodeSeaFailed
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed;

export interface NodeSeaService {
  readonly selectedTool: SelectedNodeSeaTool;
  readonly createExecutable: (
    input: NodeSeaCreateInput,
  ) => Effect.Effect<PipelineExecutableArtifact, NodeSeaCreateError>;
}

export class NodeSea extends Context.Service<NodeSea, NodeSeaService>()(
  "effect-build/internal/NodeSea",
) {}

export interface NodeSeaRuntime {
  readonly run: (
    executable: string,
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<ProcessCompletion, PlatformError.PlatformError>;
  readonly inspect: (
    file: string,
    size: number,
  ) => Effect.Effect<NativeExecutableObservation, NativeExecutableInspectionError>;
}

interface DecodedInput {
  readonly main: JavaScriptBundleArtifact;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest: boolean;
  readonly assets: readonly NodeSeaAssetInput[];
}

interface PreparedAsset {
  readonly key: string;
  readonly path: string;
  readonly realPath: string;
}

interface PreparedInput {
  readonly main: JavaScriptBundleArtifact;
  readonly resolvedCwd: string;
  readonly resolvedDestination: string;
  readonly digest: boolean;
  readonly mainFormat: "commonjs" | "module";
  readonly assets: readonly PreparedAsset[];
}

interface MetadataProbe {
  readonly version: string;
  readonly path: string;
  readonly builtinSpecifiers: readonly string[];
}

class DecodeFailure extends Error {}

const invalidInput = (reason: string): InvalidNodeSeaInput => new InvalidNodeSeaInput({ reason });

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<PropertyKey, unknown>,
  required: readonly string[],
  optional: readonly string[],
): void => {
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new DecodeFailure("unknown-field");
  }
  if (required.some((key) => !Object.hasOwn(value, key))) throw new DecodeFailure("missing-field");
};

const nonEmptyPath = (value: unknown, reason: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new DecodeFailure(reason);
  }
  return value;
};

const decodeInput = (value: unknown): Effect.Effect<DecodedInput, InvalidNodeSeaInput> =>
  Effect.try({
    try: () => {
      if (!isRecord(value)) throw new DecodeFailure("expected-object");
      assertExactKeys(value, ["main", "outfile"], ["cwd", "digest", "assets"]);
      const outfile = nonEmptyPath(value.outfile, "invalid-outfile");
      const cwd = Object.hasOwn(value, "cwd")
        ? nonEmptyPath(value.cwd, "invalid-cwd")
        : undefined;
      const digestValue = Object.hasOwn(value, "digest") ? value.digest : false;
      if (typeof digestValue !== "boolean") throw new DecodeFailure("invalid-digest");
      const assetsValue = Object.hasOwn(value, "assets") ? value.assets : [];
      if (!Array.isArray(assetsValue) || assetsValue.length > 256) {
        throw new DecodeFailure("invalid-assets");
      }
      const keys = new Set<string>();
      const assets: NodeSeaAssetInput[] = [];
      for (let index = 0; index < assetsValue.length; index++) {
        if (!Object.hasOwn(assetsValue, index)) throw new DecodeFailure("invalid-asset");
        const asset = assetsValue[index];
        if (!isRecord(asset)) throw new DecodeFailure("invalid-asset");
        assertExactKeys(asset, ["key", "path"], []);
        const key = nonEmptyPath(asset.key, "invalid-asset-key");
        if (new TextEncoder().encode(key).byteLength > 1024) {
          throw new DecodeFailure("asset-key-too-long");
        }
        if (keys.has(key)) throw new DecodeFailure("duplicate-asset-key");
        keys.add(key);
        assets.push({ key, path: nonEmptyPath(asset.path, "invalid-asset-path") });
      }
      return {
        main: value.main as JavaScriptBundleArtifact,
        outfile,
        ...(cwd === undefined ? {} : { cwd }),
        digest: digestValue,
        assets,
      };
    },
    catch: (error) => invalidInput(error instanceof DecodeFailure ? error.message : "invalid-input"),
  });

const probeFailed = (reason: string): NodeSeaProbeFailed => new NodeSeaProbeFailed({ reason });

const preparationFailed = (
  path: string,
  operation: NodeSeaPreparationOperation,
  reason: string,
): NodeSeaPreparationFailed => new NodeSeaPreparationFailed({ path, operation, reason });

const isExactTarget = (observation: NativeExecutableObservation): boolean =>
  observation.format === "elf"
  && observation.os === "linux"
  && observation.architecture === "x64"
  && observation.abi === "gnu";

const parseMetadata = (completion: ProcessCompletion): Effect.Effect<MetadataProbe, NodeSeaProbeFailed> =>
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
          typeof key !== "string" || !["version", "path", "builtinSpecifiers"].includes(key)
        )
        || typeof value.version !== "string"
        || typeof value.path !== "string"
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
  runtime: NodeSeaRuntime,
  command: string,
): Effect.Effect<string, NodeSeaToolNotFound | NodeSeaProbeFailed> =>
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
    const size = Number(information.size);
    if (!Number.isSafeInteger(size) || size < 0) return yield* probeFailed("selected executable size is invalid");
    const observation = yield* runtime.inspect(canonical, size).pipe(
      Effect.mapError((error) => probeFailed(error.reason)),
    );
    if (!isExactTarget(observation)) return yield* probeFailed("selected executable target is not linux-x64-gnu");
    return canonical;
  });

const samePath = (left: string, right: string): boolean => left === right;

const within = (path: Path.Path, child: string, parent: string): boolean =>
  child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`);

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

const statRegularInput = (
  fileSystem: FileSystem.FileSystem,
  path: string,
  reason: string,
): Effect.Effect<void, InvalidNodeSeaInput | NodeSeaPreparationFailed> =>
  fileSystem.stat(path).pipe(
    Effect.mapError((error) =>
      error.reason._tag === "NotFound"
        ? invalidInput(reason)
        : preparationFailed(path, "stat", error.message)
    ),
    Effect.flatMap((information) => information.type === "File" ? Effect.void : Effect.fail(invalidInput(reason))),
  );

const prepareInput = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  tool: SelectedNodeSeaTool,
  rawInput: unknown,
): Effect.Effect<PreparedInput, InvalidNodeSeaInput | NodeSeaPreparationFailed> =>
  Effect.gen(function*() {
    const decoded = yield* decodeInput(rawInput);
    const main = getJavaScriptBundleArtifact(decoded.main);
    if (main === undefined) return yield* invalidInput("main-artifact-not-live");
    if (main.nodeSyntaxTarget !== nodeSeaSyntaxTarget) return yield* invalidInput("main-syntax-target-mismatch");
    if (!path.isAbsolute(main.path)) return yield* invalidInput("main-path-not-absolute");
    yield* statRegularInput(fileSystem, main.path, "main-artifact-not-regular");
    for (const specifier of main.observedExternalImports) {
      if (!HashSet.has(tool.builtinSpecifiers, specifier)) {
        return yield* invalidInput(`external-import-not-builtin:${specifier}`);
      }
    }
    const resolvedCwd = path.normalize(path.resolve(decoded.cwd ?? ""));
    if (!path.isAbsolute(resolvedCwd)) return yield* invalidInput("cwd-not-absolute");
    const cwdInformation = yield* fileSystem.stat(resolvedCwd).pipe(
      Effect.mapError((error) =>
        error.reason._tag === "NotFound"
          ? invalidInput("cwd-not-directory")
          : preparationFailed(resolvedCwd, "stat", error.message)
      ),
    );
    if (cwdInformation.type !== "Directory") return yield* invalidInput("cwd-not-directory");

    const mainRealPath = yield* fileSystem.realPath(main.path).pipe(
      Effect.mapError((error) => preparationFailed(main.path, "realpath", error.message)),
    );
    const bundleDirectory = path.normalize(path.dirname(main.path));
    const bundleDirectoryRealPath = path.normalize(path.dirname(mainRealPath));
    const assets: PreparedAsset[] = [];
    for (const asset of decoded.assets) {
      const resolved = path.normalize(path.resolve(resolvedCwd, asset.path));
      if (!path.isAbsolute(resolved)) return yield* invalidInput("asset-path-not-absolute");
      yield* statRegularInput(fileSystem, resolved, "asset-not-regular");
      const real = yield* fileSystem.realPath(resolved).pipe(
        Effect.mapError((error) => preparationFailed(resolved, "realpath", error.message)),
      );
      assets.push({ key: asset.key, path: resolved, realPath: path.normalize(real) });
    }

    const resolvedDestination = resolveExecutableDestination(path, {
      outfile: decoded.outfile,
      cwd: resolvedCwd,
    });
    if (!path.isAbsolute(resolvedDestination)) return yield* invalidInput("destination-not-absolute");
    const destinationRealPath = yield* nearestCanonicalPath(fileSystem, path, resolvedDestination);
    const sourcePaths = [main.path, tool.path, ...assets.map((asset) => asset.path)];
    const sourceRealPaths = [path.normalize(mainRealPath), tool.path, ...assets.map((asset) => asset.realPath)];
    if (
      sourcePaths.some((source) => samePath(resolvedDestination, source))
      || sourceRealPaths.some((source) => samePath(destinationRealPath, source))
    ) return yield* invalidInput("destination-aliases-input");
    if (
      within(path, resolvedDestination, bundleDirectory)
      || within(path, destinationRealPath, bundleDirectoryRealPath)
    ) return yield* invalidInput("destination-inside-bundle-scope");

    return {
      main,
      resolvedCwd,
      resolvedDestination,
      digest: decoded.digest,
      mainFormat: main.format === "cjs" ? "commonjs" : "module",
      assets,
    };
  });

const processDiagnostics = (completion: ProcessCompletion): readonly Diagnostic[] => [
  { channel: "stdout", text: completion.stdout.text, truncated: completion.stdout.truncated },
  { channel: "stderr", text: completion.stderr.text, truncated: completion.stderr.truncated },
];

export const makeNodeSeaService = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  options: NodeSeaLayerOptions,
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
    let canonical: string;
    let metadata: MetadataProbe;
    if (explicit !== undefined) {
      canonical = yield* validateSelectedFile(fileSystem, path, runtime, explicit);
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
      canonical = yield* validateSelectedFile(fileSystem, path, runtime, metadata.path);
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

    const createExecutable: NodeSeaService["createExecutable"] = Effect.fn(
      "NodeSea.createExecutable",
    )((input: NodeSeaCreateInput) =>
      Effect.gen(function*() {
        const prepared = yield* prepareInput(fileSystem, path, selectedTool, input);
        return yield* Effect.scoped(
          Effect.gen(function*() {
            const candidate = yield* acquireExecutableCandidate(fileSystem, path, {
              destination: prepared.resolvedDestination,
            });
            const configDirectory = yield* fileSystem.makeTempDirectoryScoped({
              prefix: "effect-build-node-sea-",
            }).pipe(
              Effect.mapError((error) => preparationFailed(prepared.resolvedDestination, "make-config", error.message)),
            );
            const configPath = path.normalize(path.resolve(configDirectory, "sea-config.json"));
            if (!path.isAbsolute(configPath)) {
              return yield* preparationFailed(configPath, "make-config", "config path is not absolute");
            }
            if (!path.isAbsolute(candidate.staged)) {
              return yield* Effect.die(new Error("executable candidate path is not absolute"));
            }
            const assets = Object.fromEntries(prepared.assets.map((asset) => [asset.key, asset.path]));
            const config = {
              main: prepared.main.path,
              mainFormat: prepared.mainFormat,
              executable: selectedTool.path,
              output: candidate.staged,
              useSnapshot: false,
              useCodeCache: false,
              ...(prepared.assets.length === 0 ? {} : { assets }),
            };
            yield* fileSystem.writeFileString(configPath, JSON.stringify(config)).pipe(
              Effect.mapError((error) => preparationFailed(configPath, "write-config", error.message)),
            );
            const completion = yield* runtime.run(
              selectedTool.path,
              ["--build-sea", configPath],
              prepared.resolvedCwd,
            ).pipe(Effect.mapError((error) => new NodeSeaSpawnFailed({ reason: error.message })));
            if (completion.exitCode !== 0) {
              return yield* new NodeSeaFailed({
                exitCode: completion.exitCode,
                diagnostics: processDiagnostics(completion),
              });
            }
            const published = yield* validateAndPublishExecutable(fileSystem, crypto, candidate, {
              digest: prepared.digest,
              resolveTarget: (observation) =>
                isExactTarget(observation)
                  ? Result.succeed(nodeSeaTarget)
                  : Result.fail("Error: native target does not match selected Node SEA target"),
            });
            if (published.path !== prepared.resolvedDestination) {
              return yield* Effect.die(new Error("published executable path does not match resolved destination"));
            }
            const nodeStage = Object.freeze({
              operation: "assemble-node-sea" as const,
              tool: Object.freeze({
                name: "node" as const,
                version: nodeSeaVersion,
                path: selectedTool.path,
              }),
            });
            return Object.freeze({
              path: published.path,
              bytes: published.bytes,
              ...(published.digest === undefined ? {} : { digest: published.digest }),
              target: nodeSeaTarget,
              stages: Object.freeze([prepared.main.stage, nodeStage]) as PipelineExecutableArtifact["stages"],
            });
          }),
        );
      })
    );

    return { selectedTool, createExecutable };
  });

export const createExecutable = (
  input: NodeSeaCreateInput,
): Effect.Effect<PipelineExecutableArtifact, NodeSeaCreateError, NodeSea> =>
  NodeSea.use((service) => service.createExecutable(input));

export const layer = (
  options: NodeSeaLayerOptions = {},
): Layer.Layer<
  NodeSea,
  NodeSeaLayerError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner
> =>
  Layer.effect(
    NodeSea,
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const spawner = yield* ChildProcessSpawner;
      const runtime: NodeSeaRuntime = {
        run: (executable, argv, cwd) =>
          runProcess(executable, argv, cwd).pipe(
            Effect.provideService(ChildProcessSpawner, spawner),
          ),
        inspect: (file, size) => inspectNativeExecutableFile(fileSystem, file, size),
      };
      return yield* makeNodeSeaService(fileSystem, path, crypto, options, runtime);
    }),
  );
