import { Crypto, Effect, FileSystem, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as Executable from "effect-build/Author/Executable";
import { NodeSeaCandidateInvalid, NodeSeaCommandFailed, NodeSeaInputInvalid, NodeSeaTransportFailed } from "./Error.js";
import type { RunError, Service } from "./Runtime.js";
import { Runtime } from "./Runtime.js";

export type MainFormat = "commonjs" | "module";

export type Main =
  | { readonly _tag: "File"; readonly path: string; readonly format: MainFormat }
  | {
    readonly _tag: "Bytes";
    readonly contents: Uint8Array;
    readonly format: MainFormat;
    readonly sourceName?: string;
  };

export interface Asset {
  readonly key: string;
  readonly path: string;
}

export interface Input<Mode extends Artifact.ObservationMode> {
  readonly main: Main;
  readonly outfile: string;
  readonly cwd?: string;
  readonly observation: Mode;
  readonly assets?: readonly Asset[];
  readonly disableExperimentalSEAWarning?: boolean;
}

export interface ModeOptions {
  readonly useSnapshot: boolean;
  readonly useCodeCache: boolean;
  readonly execArgv?: readonly string[];
  readonly execArgvExtension?: "none" | "env" | "cli";
}

export type Error =
  | NodeSeaInputInvalid
  | NodeSeaCandidateInvalid
  | RunError
  | Executable.Failure<RunError | NodeSeaCandidateInvalid, NodeSeaCandidateInvalid>;

interface PreparedAsset {
  readonly key: string;
  readonly contents: Uint8Array;
}

interface Prepared {
  readonly main: Uint8Array;
  readonly assets: readonly PreparedAsset[];
  readonly cwd: string;
}

export const publicInputKeys = [
  "main",
  "outfile",
  "cwd",
  "observation",
  "assets",
  "disableExperimentalSEAWarning",
] as const;

const invalid = (reason: string): NodeSeaInputInvalid =>
  new NodeSeaInputInvalid({ operation: "assemble-direct", reason });

const unknownKey = (value: object, allowed: readonly string[]): string | undefined =>
  Object.keys(value).find((key) => !allowed.includes(key));

const validPathInput = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !value.includes("\0");

const readInput = (
  pathValue: string,
  label: string,
): Effect.Effect<Uint8Array, NodeSeaInputInvalid, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fileSystem) =>
    fileSystem.readFile(pathValue).pipe(
      Effect.mapError(() => invalid(`${label} must resolve to a readable file`)),
    )
  );

const prepare = <Mode extends Artifact.ObservationMode>(
  input: Input<Mode>,
  allowedInputKeys: readonly string[],
): Effect.Effect<Prepared, NodeSeaInputInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    if (typeof input !== "object" || input === null) return yield* invalid("input must be an object");
    const unexpected = unknownKey(input, allowedInputKeys);
    if (unexpected !== undefined) return yield* invalid(`unknown input field ${unexpected}`);
    if (!validPathInput(input.outfile)) return yield* invalid("outfile must be a non-empty path without NUL");
    if (input.cwd !== undefined && !validPathInput(input.cwd)) return yield* invalid("cwd must be a valid path input");
    if (input.observation !== "hashed" && input.observation !== "unhashed") {
      return yield* invalid("observation must be hashed or unhashed");
    }
    if (
      input.disableExperimentalSEAWarning !== undefined
      && typeof input.disableExperimentalSEAWarning !== "boolean"
    ) {
      return yield* invalid("disableExperimentalSEAWarning must be boolean");
    }
    if (typeof input.main !== "object" || input.main === null) return yield* invalid("main must be an object");
    if (input.main.format !== "commonjs" && input.main.format !== "module") {
      return yield* invalid("main format must be commonjs or module");
    }
    const path = yield* Path.Path;
    const cwd = path.normalize(path.resolve(input.cwd ?? ""));
    let main: Uint8Array;
    if (input.main._tag === "File") {
      const extra = unknownKey(input.main, ["_tag", "path", "format"]);
      if (extra !== undefined) return yield* invalid(`unknown File main field ${extra}`);
      if (!validPathInput(input.main.path)) return yield* invalid("main file path is invalid");
      main = yield* readInput(path.normalize(path.resolve(cwd, input.main.path)), "main file");
    } else if (input.main._tag === "Bytes") {
      const extra = unknownKey(input.main, ["_tag", "contents", "format", "sourceName"]);
      if (extra !== undefined) return yield* invalid(`unknown Bytes main field ${extra}`);
      if (!(input.main.contents instanceof Uint8Array)) return yield* invalid("main contents must be Uint8Array");
      if (input.main.sourceName !== undefined && !validPathInput(input.main.sourceName)) {
        return yield* invalid("sourceName must be non-empty and contain no NUL");
      }
      main = Uint8Array.from(input.main.contents);
    } else {
      return yield* invalid("main tag must be File or Bytes");
    }
    const sourceAssets = input.assets ?? [];
    if (!Array.isArray(sourceAssets)) return yield* invalid("assets must be an array");
    const seen = new Set<string>();
    const assets: PreparedAsset[] = [];
    for (const asset of sourceAssets) {
      if (typeof asset !== "object" || asset === null) return yield* invalid("each asset must be an object");
      const extra = unknownKey(asset, ["key", "path"]);
      if (extra !== undefined) return yield* invalid(`unknown asset field ${extra}`);
      if (!validPathInput(asset.key)) return yield* invalid("asset key must be non-empty and contain no NUL");
      if (seen.has(asset.key)) return yield* invalid(`duplicate asset key ${asset.key}`);
      if (!validPathInput(asset.path)) return yield* invalid(`asset ${asset.key} path is invalid`);
      seen.add(asset.key);
      assets.push({
        key: asset.key,
        contents: yield* readInput(path.normalize(path.resolve(cwd, asset.path)), `asset ${asset.key}`),
      });
    }
    return { main: Uint8Array.from(main), assets, cwd };
  });

const mapFileError = (path: string, operation: string) => (cause: unknown): NodeSeaCandidateInvalid =>
  new NodeSeaCandidateInvalid({
    path,
    reason: `${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

const materialize = <Mode extends Artifact.ObservationMode>(
  input: Input<Mode>,
  prepared: Prepared,
  modes: ModeOptions,
  stagedPath: Artifact.AbsolutePath,
): Effect.Effect<void, RunError | NodeSeaCandidateInvalid, Runtime | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const runtime = yield* Runtime;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.dirname(stagedPath);
    const inputs = path.join(root, "inputs");
    const assetsRoot = path.join(inputs, "assets");
    yield* fileSystem.makeDirectory(assetsRoot, { recursive: true }).pipe(
      Effect.mapError(mapFileError(stagedPath, "create private input directory")),
    );
    const mainPath = path.join(inputs, input.main.format === "module" ? "main.mjs" : "main.cjs");
    yield* fileSystem.writeFile(mainPath, prepared.main).pipe(
      Effect.mapError(mapFileError(stagedPath, "write private main")),
    );
    yield* runtime.runChecked("check-main", ["--check", mainPath], prepared.cwd, false);
    const assets: Record<string, string> = {};
    for (const [index, asset] of prepared.assets.entries()) {
      const assetPath = path.join(assetsRoot, `${index}`);
      yield* fileSystem.writeFile(assetPath, asset.contents).pipe(
        Effect.mapError(mapFileError(stagedPath, `write private asset ${asset.key}`)),
      );
      assets[asset.key] = assetPath;
    }
    const configPath = path.join(inputs, "sea-config.json");
    const config = {
      main: mainPath,
      mainFormat: input.main.format,
      executable: runtime.base.selected.executablePath,
      output: stagedPath,
      disableExperimentalSEAWarning: input.disableExperimentalSEAWarning ?? false,
      useSnapshot: modes.useSnapshot,
      useCodeCache: modes.useCodeCache,
      ...(modes.execArgv === undefined ? {} : { execArgv: [...modes.execArgv] }),
      ...(modes.execArgvExtension === undefined ? {} : { execArgvExtension: modes.execArgvExtension }),
      ...(Object.keys(assets).length === 0 ? {} : { assets }),
    };
    yield* fileSystem.writeFileString(configPath, `${JSON.stringify(config, null, 2)}\n`).pipe(
      Effect.mapError(mapFileError(stagedPath, "write SEA configuration")),
    );
    yield* runtime.runChecked("assemble-direct", ["--build-sea", configPath], root, true);
    yield* fileSystem.chmod(stagedPath, 0o755).pipe(
      Effect.mapError(mapFileError(stagedPath, "repair executable mode")),
    );
  });

const inspect = (
  runtime: Service,
  candidate: Artifact.HashedFileObservation,
): Effect.Effect<Executable.Inspection, NodeSeaCandidateInvalid, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fileSystem) =>
    fileSystem.readFile(candidate.path).pipe(
      Effect.mapError(mapFileError(candidate.path, "read assembled candidate")),
      Effect.flatMap((contents) => {
        const isElf = contents.byteLength >= 20
          && contents[0] === 0x7f
          && contents[1] === 0x45
          && contents[2] === 0x4c
          && contents[3] === 0x46;
        const is64BitLittleEndian = contents[4] === 2 && contents[5] === 1;
        const machine = (contents[18] ?? 0) | ((contents[19] ?? 0) << 8);
        if (!isElf || !is64BitLittleEndian || machine !== 62) {
          return Effect.fail(
            new NodeSeaCandidateInvalid({
              path: candidate.path,
              reason: "assembled candidate is not an ELF x86-64 executable",
            }),
          );
        }
        return Effect.succeed(Object.freeze({
          nativeFormat: "elf" as const,
          runtime: Object.freeze({ name: "node", version: runtime.builder.version }),
          target: "linux-x64-gnu" as const,
        }));
      }),
    )
  );

/** Shared direct-SEA engine for the public strict request and private mode candidates. */
export const assemble = <Mode extends Artifact.ObservationMode>(
  input: Input<Mode>,
  modes: ModeOptions,
  allowedInputKeys: readonly string[],
): Effect.Effect<
  Executable.Artifact<Mode>,
  Error,
  Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const prepared = yield* prepare(input, allowedInputKeys);
    const runtime = yield* Runtime;
    const provenance: Artifact.Provenance =
      runtime.base.selected.executablePath === runtime.builder.selected.executablePath
        ? runtime.builder.selected.observation
        : Object.freeze({
          name: "node" as const,
          participants: Object.freeze([
            ...runtime.builder.selected.observation.participants,
            ...runtime.base.selected.observation.participants,
          ]) as readonly [
            import("effect-build/Author/Tool").ParticipantIdentity,
            ...import("effect-build/Author/Tool").ParticipantIdentity[],
          ],
          capabilities: Object.freeze([
            ...runtime.builder.selected.observation.capabilities,
            ...runtime.base.selected.observation.capabilities,
          ]),
        });
    return yield* Executable.publish(
      {
        destination: input.outfile,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        observation: input.observation,
        provenance,
      },
      (stagedPath) => materialize(input, prepared, modes, stagedPath),
      (candidate) => inspect(runtime, candidate),
    );
  });

export { NodeSeaCandidateInvalid, NodeSeaCommandFailed, NodeSeaInputInvalid, NodeSeaTransportFailed };
