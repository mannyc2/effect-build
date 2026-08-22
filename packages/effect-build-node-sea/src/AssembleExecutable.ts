import { Context as EffectContext, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as CoreArtifact from "effect-build/Artifact";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
  type IdentityIncomplete,
  type LaunchRefusal,
  type NodeSeaProbeFailed,
  nodeSeaTarget,
  type NodeSeaToolNotFound,
  nodeSeaVersion,
  type PreflightRefusal,
} from "./internal/v04/compatibility.js";
import {
  type ExecutableFailure,
  type PrivateCandidate,
  publishExecutable,
  resolveDestination,
} from "./internal/v04/executable.js";
import {
  type CommandCompletion,
  type CommandSpawnFailed,
  type LayerOptions as InternalLayerOptions,
  type SelectedNode,
  selectNode,
} from "./internal/v04/selected.js";

type Main =
  | {
    readonly _tag: "File";
    readonly path: string;
    readonly format: "commonjs" | "module";
  }
  | {
    readonly _tag: "Bytes";
    readonly contents: Uint8Array;
    readonly format: "commonjs" | "module";
    readonly sourceName?: string;
  };

interface AssetInput {
  readonly key: string;
  readonly path: string;
}

export interface LayerOptions {
  readonly builderExecutable?: CoreArtifact.AbsolutePath;
  readonly baseExecutable?: CoreArtifact.AbsolutePath;
  readonly allowUntestedVersion?: boolean;
}

export interface AssembleExecutableInput<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> {
  readonly main: Main;
  readonly outfile: string;
  readonly cwd?: string;
  readonly observation: Mode;
  readonly assets?: readonly AssetInput[];
  readonly disableExperimentalSEAWarning?: boolean;
}

export type Artifact<Mode extends CoreArtifact.ObservationMode = CoreArtifact.ObservationMode> =
  & CoreArtifact.Executable<Mode>
  & {
    readonly provider: "node-sea";
    readonly runtime: { readonly name: "node"; readonly version: typeof nodeSeaVersion };
    readonly target: typeof nodeSeaTarget;
    readonly nativeFormat: "elf";
  };

interface CommandDiagnostic {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
  readonly truncated: boolean;
}

interface InvalidNodeSeaInput {
  readonly _tag: "InvalidNodeSeaInput";
  readonly reason: string;
}

interface NodeSeaPreparationFailed {
  readonly _tag: "NodeSeaPreparationFailed";
  readonly path: CoreArtifact.AbsolutePath;
  readonly operation:
    | "realpath"
    | "stat"
    | "read-main"
    | "digest-main"
    | "make-config"
    | "write-config"
    | "copy-main"
    | "digest-main-copy"
    | "decode-stages";
  readonly reason: string;
}

interface NodeSeaSpawnFailed {
  readonly _tag: "NodeSeaSpawnFailed";
  readonly reason: string;
}

interface NodeSeaSyntaxCheckFailed {
  readonly _tag: "NodeSeaSyntaxCheckFailed";
  readonly exitCode: number;
  readonly diagnostics: readonly CommandDiagnostic[];
}

interface NodeSeaFailed {
  readonly _tag: "NodeSeaFailed";
  readonly exitCode: number;
  readonly diagnostics: readonly CommandDiagnostic[];
}

export type AssembleExecutableError =
  | InvalidNodeSeaInput
  | NodeSeaPreparationFailed
  | NodeSeaSpawnFailed
  | NodeSeaSyntaxCheckFailed
  | NodeSeaFailed
  | ExecutableFailure
  | PreflightRefusal
  | LaunchRefusal;

type LayerError = NodeSeaToolNotFound | NodeSeaProbeFailed | IdentityIncomplete;

interface Service {
  readonly assembleExecutable: <Mode extends CoreArtifact.ObservationMode>(
    input: AssembleExecutableInput<Mode>,
  ) => Effect.Effect<Artifact<Mode>, AssembleExecutableError>;
}

export class Assembler extends EffectContext.Service<Assembler, Service>()(
  "effect-build-node-sea/AssembleExecutable/Assembler",
) {}

export const assembleExecutable = <Mode extends CoreArtifact.ObservationMode>(
  input: AssembleExecutableInput<Mode>,
): Effect.Effect<Artifact<Mode>, AssembleExecutableError, Assembler> =>
  Assembler.use((service) => service.assembleExecutable(input));

interface PreparedAsset {
  readonly key: string;
  readonly source: CoreArtifact.AbsolutePath;
  readonly bytes: Uint8Array;
}

interface PreparedInput<Mode extends CoreArtifact.ObservationMode> {
  readonly main: Uint8Array;
  readonly format: "commonjs" | "module";
  readonly outfile: string;
  readonly cwd: string;
  readonly observation: Mode;
  readonly assets: readonly PreparedAsset[];
  readonly disableExperimentalSEAWarning: boolean;
}

type DecodeResult<A> = { readonly _tag: "Success"; readonly value: A } | {
  readonly _tag: "Failure";
  readonly error: InvalidNodeSeaInput;
};

const invalidInput = (reason: string): InvalidNodeSeaInput => ({ _tag: "InvalidNodeSeaInput", reason });

const preparationFailed = (
  path: CoreArtifact.AbsolutePath,
  operation: NodeSeaPreparationFailed["operation"],
  reason: string,
): NodeSeaPreparationFailed => ({ _tag: "NodeSeaPreparationFailed", path, operation, reason });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnly = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key));

const isPathInput = (value: unknown, emptyAllowed = false): value is string =>
  typeof value === "string" && !value.includes("\0") && (emptyAllowed || value.length > 0);

const decodeMain = (value: unknown): DecodeResult<Main> => {
  if (!isRecord(value) || typeof value._tag !== "string") {
    return { _tag: "Failure", error: invalidInput("invalid-main") };
  }
  if (value._tag === "File") {
    if (
      !hasOnly(value, ["_tag", "path", "format"])
      || !isPathInput(value.path)
      || (value.format !== "commonjs" && value.format !== "module")
    ) return { _tag: "Failure", error: invalidInput("invalid-file-main") };
    return {
      _tag: "Success",
      value: { _tag: "File", path: value.path, format: value.format },
    };
  }
  if (value._tag === "Bytes") {
    if (
      !hasOnly(value, ["_tag", "contents", "format", "sourceName"])
      || !(value.contents instanceof Uint8Array)
      || (value.format !== "commonjs" && value.format !== "module")
      || (value.sourceName !== undefined && typeof value.sourceName !== "string")
    ) return { _tag: "Failure", error: invalidInput("invalid-bytes-main") };
    return {
      _tag: "Success",
      value: {
        _tag: "Bytes",
        contents: new Uint8Array(value.contents),
        format: value.format,
        ...(value.sourceName === undefined ? {} : { sourceName: value.sourceName }),
      },
    };
  }
  return { _tag: "Failure", error: invalidInput("unknown-main-tag") };
};

const decodeAssets = (value: unknown): DecodeResult<readonly AssetInput[]> => {
  if (value === undefined) return { _tag: "Success", value: [] };
  if (!Array.isArray(value)) return { _tag: "Failure", error: invalidInput("invalid-assets") };
  const keys = new Set<string>();
  const assets: AssetInput[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || !hasOnly(candidate, ["key", "path"])
      || typeof candidate.key !== "string"
      || !isPathInput(candidate.path)
    ) return { _tag: "Failure", error: invalidInput("invalid-asset") };
    if (keys.has(candidate.key)) return { _tag: "Failure", error: invalidInput("duplicate-asset-key") };
    keys.add(candidate.key);
    assets.push({ key: candidate.key, path: candidate.path });
  }
  return { _tag: "Success", value: Object.freeze(assets) };
};

const decodeInput = <Mode extends CoreArtifact.ObservationMode>(
  value: unknown,
): DecodeResult<AssembleExecutableInput<Mode>> => {
  if (!isRecord(value)) return { _tag: "Failure", error: invalidInput("expected-object") };
  if (!hasOnly(value, ["main", "outfile", "cwd", "observation", "assets", "disableExperimentalSEAWarning"])) {
    return { _tag: "Failure", error: invalidInput("unknown-field") };
  }
  if (!Object.hasOwn(value, "main") || !Object.hasOwn(value, "outfile") || !Object.hasOwn(value, "observation")) {
    return { _tag: "Failure", error: invalidInput("missing-field") };
  }
  const main = decodeMain(value.main);
  if (main._tag === "Failure") return main;
  if (!isPathInput(value.outfile)) return { _tag: "Failure", error: invalidInput("invalid-outfile") };
  if (value.cwd !== undefined && !isPathInput(value.cwd, true)) {
    return { _tag: "Failure", error: invalidInput("invalid-cwd") };
  }
  if (value.observation !== "hashed" && value.observation !== "unhashed") {
    return { _tag: "Failure", error: invalidInput("invalid-observation") };
  }
  const assets = decodeAssets(value.assets);
  if (assets._tag === "Failure") return assets;
  if (value.disableExperimentalSEAWarning !== undefined && typeof value.disableExperimentalSEAWarning !== "boolean") {
    return { _tag: "Failure", error: invalidInput("invalid-warning-policy") };
  }
  return {
    _tag: "Success",
    value: {
      main: main.value,
      outfile: value.outfile,
      ...(value.cwd === undefined ? {} : { cwd: value.cwd }),
      observation: value.observation as Mode,
      ...(assets.value.length === 0 ? {} : { assets: assets.value }),
      ...(value.disableExperimentalSEAWarning === undefined
        ? {}
        : { disableExperimentalSEAWarning: value.disableExperimentalSEAWarning }),
    },
  };
};

const diagnostics = (completion: CommandCompletion): readonly CommandDiagnostic[] => [
  { channel: "stdout", text: completion.stdout.text, truncated: completion.stdout.truncated },
  { channel: "stderr", text: completion.stderr.text, truncated: completion.stderr.truncated },
];

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const digest = (
  crypto: Crypto.Crypto,
  bytes: Uint8Array,
  path: CoreArtifact.AbsolutePath,
  operation: NodeSeaPreparationFailed["operation"],
): Effect.Effect<string, NodeSeaPreparationFailed> =>
  crypto.digest("SHA-256", bytes).pipe(
    Effect.map(hex),
    Effect.mapError(() => preparationFailed(path, operation, "sha256-digest-unavailable")),
  );

const snapshotFile = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  cwd: string,
  input: string,
  role: "main" | "asset",
): Effect.Effect<
  { readonly path: CoreArtifact.AbsolutePath; readonly bytes: Uint8Array },
  InvalidNodeSeaInput | NodeSeaPreparationFailed
> =>
  Effect.gen(function*() {
    const resolved = path.normalize(path.resolve(cwd, input)) as CoreArtifact.AbsolutePath;
    const canonical = yield* fileSystem.realPath(resolved).pipe(
      Effect.mapError((error) =>
        error.reason._tag === "NotFound"
          ? invalidInput(`${role}-not-regular`)
          : preparationFailed(resolved, "realpath", error.reason._tag)
      ),
    );
    const source = path.normalize(canonical) as CoreArtifact.AbsolutePath;
    const information = yield* fileSystem.stat(source).pipe(
      Effect.mapError((error) => preparationFailed(source, "stat", error.reason._tag)),
    );
    if (information.type !== "File" || information.size < 0n) {
      return yield* Effect.fail(invalidInput(`${role}-not-regular`));
    }
    const first = yield* fileSystem.readFile(source).pipe(
      Effect.mapError((error) => preparationFailed(source, "read-main", error.reason._tag)),
    );
    if (BigInt(first.byteLength) !== information.size) {
      return yield* Effect.fail(invalidInput(`${role}-changed`));
    }
    const firstDigest = yield* digest(crypto, first, source, "digest-main");
    const second = yield* fileSystem.readFile(source).pipe(
      Effect.mapError((error) => preparationFailed(source, "read-main", error.reason._tag)),
    );
    const secondDigest = yield* digest(crypto, second, source, "digest-main");
    if (first.byteLength !== second.byteLength || firstDigest !== secondDigest) {
      return yield* Effect.fail(invalidInput(`${role}-changed`));
    }
    return { path: source, bytes: new Uint8Array(first) };
  });

const nearestCanonicalPath = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  target: CoreArtifact.AbsolutePath,
): Effect.Effect<CoreArtifact.AbsolutePath, NodeSeaPreparationFailed> =>
  Effect.gen(function*() {
    let current = target as string;
    const suffix: string[] = [];
    for (;;) {
      const exists = yield* fileSystem.exists(current).pipe(
        Effect.mapError((error) => preparationFailed(target, "stat", error.reason._tag)),
      );
      if (exists) {
        const canonical = yield* fileSystem.realPath(current).pipe(
          Effect.mapError((error) => preparationFailed(target, "realpath", error.reason._tag)),
        );
        return path.normalize(path.resolve(canonical, ...suffix)) as CoreArtifact.AbsolutePath;
      }
      const parent = path.dirname(current);
      if (parent === current) return yield* Effect.fail(preparationFailed(target, "realpath", "no-existing-ancestor"));
      suffix.unshift(path.basename(current));
      current = parent;
    }
  });

const sourceSpecifiers = (bytes: Uint8Array): DecodeResult<readonly string[]> => {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { _tag: "Failure", error: invalidInput("main-not-utf8") };
  }
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patterns = [
    /\bimport\s+(?:[^'";]*?\s+from\s+)?['"]([^'"\\]+)['"]/g,
    /\bexport\s+[^'";]*?\s+from\s+['"]([^'"\\]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\\]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"\\]+)['"]\s*\)/g,
  ] as const;
  const values = new Set<string>();
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) values.add(match[1]!);
  }
  return { _tag: "Success", value: [...values] };
};

const validateExternals = (bytes: Uint8Array, builtinSpecifiers: ReadonlySet<string>): DecodeResult<void> => {
  const specifiers = sourceSpecifiers(bytes);
  if (specifiers._tag === "Failure") return specifiers;
  for (const specifier of specifiers.value) {
    if (specifier.endsWith(".node")) {
      return { _tag: "Failure", error: invalidInput(`native-addon-not-admissible:${specifier}`) };
    }
    if (!builtinSpecifiers.has(specifier)) {
      return { _tag: "Failure", error: invalidInput(`external-import-not-builtin:${specifier}`) };
    }
  }
  return { _tag: "Success", value: undefined };
};

const prepareInput = <Mode extends CoreArtifact.ObservationMode>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  selected: SelectedNode,
  input: AssembleExecutableInput<Mode>,
): Effect.Effect<PreparedInput<Mode>, InvalidNodeSeaInput | NodeSeaPreparationFailed> =>
  Effect.gen(function*() {
    const cwd = path.normalize(path.resolve(input.cwd ?? ""));
    const cwdInfo = yield* fileSystem.stat(cwd).pipe(
      Effect.mapError((error) =>
        error.reason._tag === "NotFound"
          ? invalidInput("cwd-not-directory")
          : preparationFailed(cwd as CoreArtifact.AbsolutePath, "stat", error.reason._tag)
      ),
    );
    if (cwdInfo.type !== "Directory") return yield* Effect.fail(invalidInput("cwd-not-directory"));
    const destination = resolveDestination(path, input.outfile, cwd);
    const main = input.main._tag === "File"
      ? yield* snapshotFile(fileSystem, crypto, path, cwd, input.main.path, "main")
      : { path: undefined, bytes: new Uint8Array(input.main.contents) };
    const checkedExternals = validateExternals(main.bytes, selected.builtinSpecifiers);
    if (checkedExternals._tag === "Failure") return yield* Effect.fail(checkedExternals.error);
    const assets: PreparedAsset[] = [];
    for (const asset of input.assets ?? []) {
      const snapshot = yield* snapshotFile(fileSystem, crypto, path, cwd, asset.path, "asset");
      if (snapshot.path === destination) return yield* Effect.fail(invalidInput("destination-aliases-input"));
      assets.push({ key: asset.key, source: snapshot.path, bytes: snapshot.bytes });
    }
    const physicalDestination = yield* nearestCanonicalPath(fileSystem, path, destination);
    const inputs = [main.path, selected.builderPath, selected.basePath, ...assets.map((asset) => asset.source)];
    if (inputs.includes(destination) || inputs.includes(physicalDestination)) {
      return yield* Effect.fail(invalidInput("destination-aliases-input"));
    }
    return {
      main: main.bytes,
      format: input.main.format,
      outfile: input.outfile,
      cwd,
      observation: input.observation,
      assets: Object.freeze(assets),
      disableExperimentalSEAWarning: input.disableExperimentalSEAWarning === true,
    };
  });

const writeStablePrivateFile = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  target: CoreArtifact.AbsolutePath,
  bytes: Uint8Array,
): Effect.Effect<void, NodeSeaPreparationFailed> =>
  Effect.gen(function*() {
    const expected = yield* digest(crypto, bytes, target, "digest-main-copy");
    yield* fileSystem.writeFile(target, bytes).pipe(
      Effect.mapError((error) => preparationFailed(target, "copy-main", error.reason._tag)),
    );
    const copied = yield* fileSystem.readFile(target).pipe(
      Effect.mapError((error) => preparationFailed(target, "read-main", error.reason._tag)),
    );
    const observed = yield* digest(crypto, copied, target, "digest-main-copy");
    if (expected !== observed) {
      return yield* Effect.fail(preparationFailed(target, "digest-main-copy", "private-copy-content-changed"));
    }
  });

const mapCommandFailure = (
  error: LaunchRefusal | CommandSpawnFailed,
): LaunchRefusal | NodeSeaSpawnFailed =>
  error._tag === "NodeSeaCommandSpawnFailed"
    ? { _tag: "NodeSeaSpawnFailed", reason: error.reason }
    : error;

const assembleCandidate = <Mode extends CoreArtifact.ObservationMode>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  selected: SelectedNode,
  prepared: PreparedInput<Mode>,
  privateCandidate: PrivateCandidate,
): Effect.Effect<
  void,
  NodeSeaPreparationFailed | NodeSeaSpawnFailed | NodeSeaSyntaxCheckFailed | NodeSeaFailed | LaunchRefusal
> =>
  Effect.gen(function*() {
    const inputs = path.join(privateCandidate.directory, "inputs") as CoreArtifact.AbsolutePath;
    yield* fileSystem.makeDirectory(inputs, { recursive: true }).pipe(
      Effect.mapError((error) => preparationFailed(inputs, "make-config", error.reason._tag)),
    );
    const main = path.join(inputs, prepared.format === "module" ? "main.mjs" : "main.cjs") as CoreArtifact.AbsolutePath;
    yield* writeStablePrivateFile(fileSystem, crypto, main, prepared.main);
    const assetEntries: Array<readonly [string, string]> = [];
    for (const [index, asset] of prepared.assets.entries()) {
      const assetPath = path.join(inputs, `asset-${index}`) as CoreArtifact.AbsolutePath;
      yield* writeStablePrivateFile(fileSystem, crypto, assetPath, asset.bytes);
      assetEntries.push([asset.key, assetPath]);
    }
    const assets = Object.fromEntries(assetEntries);
    const syntax = yield* selected.execute(["--check", main], prepared.cwd).pipe(Effect.mapError(mapCommandFailure));
    if (syntax.exitCode !== 0) {
      return yield* Effect.fail<NodeSeaSyntaxCheckFailed>({
        _tag: "NodeSeaSyntaxCheckFailed",
        exitCode: syntax.exitCode,
        diagnostics: diagnostics(syntax),
      });
    }
    const configPath = path.join(privateCandidate.directory, "sea-config.json") as CoreArtifact.AbsolutePath;
    const config = {
      main,
      mainFormat: prepared.format,
      executable: selected.basePath,
      output: privateCandidate.candidate,
      useSnapshot: false,
      useCodeCache: false,
      ...(Object.keys(assets).length === 0 ? {} : { assets }),
      ...(prepared.disableExperimentalSEAWarning ? { disableExperimentalSEAWarning: true } : {}),
    };
    yield* fileSystem.writeFileString(configPath, JSON.stringify(config)).pipe(
      Effect.mapError((error) => preparationFailed(configPath, "write-config", error.reason._tag)),
    );
    const completion = yield* selected.execute(["--build-sea", configPath], prepared.cwd).pipe(
      Effect.mapError(mapCommandFailure),
    );
    if (completion.exitCode !== 0) {
      return yield* Effect.fail<NodeSeaFailed>({
        _tag: "NodeSeaFailed",
        exitCode: completion.exitCode,
        diagnostics: diagnostics(completion),
      });
    }
  });

const makeService = (options: LayerOptions): Effect.Effect<
  Service,
  LayerError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const selected = yield* selectNode(options as InternalLayerOptions, import.meta.url);
    const allowUntestedVersion = options.allowUntestedVersion === true;
    const assemble: Service["assembleExecutable"] = Effect.fn(
      "effect-build-node-sea/AssembleExecutable.assembleExecutable",
    )(<Mode extends CoreArtifact.ObservationMode>(raw: AssembleExecutableInput<Mode>) => {
      const decoded = decodeInput<Mode>(raw);
      if (decoded._tag === "Failure") return Effect.fail(decoded.error);
      return Effect.gen(function*() {
        const admission = yield* selected.definition.evaluate({ allowUntestedVersion });
        if (admission._tag === "UntestedOverride") {
          yield* Effect.logWarning(
            `${admission.warningCode}: effect-build-node-sea assemble-direct proceeds on unreviewed coordinates`,
          );
        }
        const prepared = yield* prepareInput(fileSystem, path, crypto, selected, decoded.value);
        const published = yield* publishExecutable({
          outfile: prepared.outfile,
          cwd: prepared.cwd,
          observation: prepared.observation,
          runtimeVersion: nodeSeaVersion,
          beforeMutation: selected.reauthenticate(),
          produce: (candidate) => assembleCandidate(fileSystem, path, crypto, selected, prepared, candidate),
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.provideService(Crypto.Crypto, crypto),
        );
        return Object.freeze({
          ...published,
          provider: "node-sea" as const,
          runtime: { name: "node" as const, version: nodeSeaVersion },
          target: nodeSeaTarget,
          nativeFormat: "elf" as const,
        }) as Artifact<Mode>;
      });
    });
    return { assembleExecutable: assemble };
  });

export const layer = (options: LayerOptions = {}): Layer.Layer<
  Assembler,
  LayerError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner
> => Layer.effect(Assembler, makeService(options));
