import type { Config } from "effect";
import { Config as C, Context, Effect, FileSystem, Layer, Path, Schema, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Executable from "effect-build/Executable";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const Common = {
  entrypoints: Schema.NonEmptyArray(Schema.String),
  minify: Schema.optionalKey(Schema.Boolean),
  external: Schema.optionalKey(Schema.Array(Schema.String)),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  /** Stage beside the destination and rename the produced files. Default false. */
  atomic: Schema.optionalKey(Schema.Boolean),
};

export const BuildInput = Schema.Struct({
  ...Common,
  outdir: Schema.String,
  target: Schema.Literals(["bun", "node", "browser"]),
});
export type BuildInput = typeof BuildInput.Type;

export const CompileInput = Schema.Struct({
  ...Common,
  outfile: Schema.String,
  /** Bun's native spelling, for example `bun-linux-x64`. */
  target: Schema.String,
});
export type CompileInput = typeof CompileInput.Type;

const flags = (input: BuildInput | CompileInput) => [
  ...(input.extraArgs ?? []),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.external ?? []).map((name) => `--external=${name}`),
];

export interface Options {
  readonly executable?: string | undefined;
}

export class Bun extends Context.Service<Bun>()("effect-build-bun/Bun", {
  make: Effect.fn("Bun.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("bun", {
      executable: options.executable,
      version: {
        args: ["--version"],
        tested: "1.3.x and 1.4.x",
        isTested: (output) => /^1\.[34]\./u.test(output.trim()),
      },
    });
    const path = yield* Path.Path;
    const platform = Context.make(FileSystem.FileSystem, yield* FileSystem.FileSystem).pipe(
      Context.add(Path.Path, path),
    );
    const bun = (input: BuildInput | CompileInput, args: ReadonlyArray<string>) =>
      tool.run(
        ChildProcess.make(tool.executable, ["build", ...flags(input), ...args, "--", ...input.entrypoints], {
          cwd: input.cwd,
          env: input.env,
          extendEnv: input.extendEnv,
          stdin: "ignore",
        }),
        Sink.drain,
      );
    return {
      /** Bundles into the absolute output directory. Atomic publication is opt-in. */
      build: Effect.fn("Bun.build")(function*(input: BuildInput) {
        const outdir = path.resolve(input.cwd ?? ".", input.outdir);
        const produce = (dir: string) => bun(input, [`--target=${input.target}`, `--outdir=${dir}`]);
        if (input.atomic === true) return yield* Atomic.directory(outdir, produce);
        yield* produce(outdir);
        return outdir;
      }, Effect.provideContext(platform)),
      /** Compiles an executable; Windows targets append `.exe` when needed. */
      compile: Effect.fn("Bun.compile")(function*(input: CompileInput) {
        const requested = path.resolve(input.cwd ?? ".", input.outfile);
        const outfile = input.target.startsWith("bun-windows-") && !requested.endsWith(".exe")
          ? `${requested}.exe`
          : requested;
        const produce = (file: string) => bun(input, ["--compile", `--target=${input.target}`, `--outfile=${file}`]);
        if (input.atomic === true) return yield* Atomic.file(outfile, produce, { check: Executable.checkNative });
        yield* produce(outfile);
        return outfile;
      }, Effect.provideContext(platform)),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
