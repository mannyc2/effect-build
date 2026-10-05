import type { Config } from "effect";
import { Config as C, Context, Effect, FileSystem, Layer, Path, Schema, Sink } from "effect";
import { Atomic, Executable, Tool } from "effect-build";
import { ChildProcess } from "effect/process";

/** Failure to prepare or clean the native Node SEA configuration. */
export class NodeSeaError extends Schema.TaggedError<NodeSeaError>()("NodeSeaError", {
  step: Schema.Literals(["prepare", "cleanup"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Node SEA ${this.step} failed`;
  }
}

export interface Options {
  readonly executable?: string | undefined;
  /** Base executable passed to Node's native assembly. Defaults to the resolved builder. */
  readonly baseExecutable?: string | undefined;
}

/** Node assembles an already-bundled source file; bundling stays with the caller. */
export interface AssembleInput {
  readonly main: string;
  readonly mainFormat?: "commonjs" | "module" | undefined;
  readonly outfile: string;
  readonly assets?: Readonly<Record<string, string>> | undefined;
  readonly cwd?: string | undefined;
  readonly atomic?: boolean | undefined;
  readonly disableExperimentalSEAWarning?: boolean | undefined;
}

const SeaConfig = Schema.fromJsonString(Schema.Struct({
  main: Schema.String,
  mainFormat: Schema.Literals(["commonjs", "module"]),
  executable: Schema.String,
  output: Schema.String,
  assets: Schema.Record(Schema.String, Schema.String),
  useSnapshot: Schema.Boolean,
  useCodeCache: Schema.Boolean,
  disableExperimentalSEAWarning: Schema.Boolean,
}));

/** Direct native `node --build-sea` assembly, without an injection library. */
export class NodeSea extends Context.Service<NodeSea>()("effect-build-node-sea/NodeSea", {
  make: Effect.fn("NodeSea.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("node", {
      executable: options.executable,
      version: {
        args: ["--version"],
        tested: "26.7.x",
        isTested: (output) => output.trim().startsWith("v26.7."),
      },
    });
    const base = options.baseExecutable === undefined
      ? tool.executable
      : (yield* Tool.make("node", { executable: options.baseExecutable })).executable;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const prepareFailure = (cause: unknown) => NodeSeaError.make({ step: "prepare", cause });

    const assemble = Effect.fn("NodeSea.assemble")(
      function*(input: AssembleInput) {
        const cwd = path.resolve(input.cwd ?? ".");
        const requested = path.resolve(cwd, input.outfile);
        const outfile = path.sep === "\\" && !requested.toLowerCase().endsWith(".exe")
          ? `${requested}.exe`
          : requested;
        const main = path.resolve(cwd, input.main);
        const produce = Effect.fnUntraced(function*(output: string) {
          yield* fs.makeDirectory(path.dirname(output), { recursive: true }).pipe(Effect.mapError(prepareFailure));
          return yield* Effect.acquireUseRelease(
            fs.makeTempDirectory({ directory: path.dirname(output), prefix: ".node-sea-" }).pipe(
              Effect.mapError(prepareFailure),
            ),
            Effect.fnUntraced(function*(directory: string) {
              yield* tool.run(
                ChildProcess.make(tool.executable, ["--check", main], { cwd, stdin: "ignore" }),
                Sink.drain,
              );
              const config = yield* Schema.encodeEffect(SeaConfig)({
                main,
                mainFormat: input.mainFormat ?? "commonjs",
                executable: base,
                output,
                assets: Object.fromEntries(
                  Object.entries(input.assets ?? {}).map(([name, file]) => [name, path.resolve(cwd, file)]),
                ),
                useSnapshot: false,
                useCodeCache: false,
                disableExperimentalSEAWarning: input.disableExperimentalSEAWarning ?? false,
              }).pipe(Effect.mapError(prepareFailure));
              const configFile = path.join(directory, "sea-config.json");
              yield* fs.writeFileString(configFile, config).pipe(Effect.mapError(prepareFailure));
              yield* tool.run(
                ChildProcess.make(tool.executable, ["--build-sea", configFile], { cwd, stdin: "ignore" }),
                Sink.drain,
              );
            }),
            (directory) =>
              fs.remove(directory, { recursive: true }).pipe(
                Effect.mapError((cause) => NodeSeaError.make({ step: "cleanup", cause })),
              ),
          );
        });
        if (input.atomic === true) {
          return yield* Atomic.file(outfile, produce, { check: Executable.checkNative });
        }
        yield* produce(outfile);
        return outfile;
      },
      Effect.provideContext(platform),
    );
    return { assemble };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
