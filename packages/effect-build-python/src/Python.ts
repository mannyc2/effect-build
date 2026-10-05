import type { Config, FileSystem } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export const BuildInput = Schema.Struct({
  project: Schema.String,
  outdir: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
  atomic: Schema.optionalKey(Schema.Boolean),
});
export type BuildInput = typeof BuildInput.Type;

export interface Options {
  readonly executable?: string | undefined;
}

export class Python extends Context.Service<Python>()("effect-build-python/Python", {
  make: Effect.fn("Python.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("uv", options);
    const path = yield* Path.Path;
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    return {
      /** uv builds its wheel from the sdist by default. Returns the distribution directory. */
      build: Effect.fn("Python.build")(function*(input: BuildInput) {
        const project = path.resolve(input.cwd ?? ".", input.project);
        const outdir = path.resolve(input.cwd ?? ".", input.outdir);
        const produce = (out: string) =>
          tool.run(
            ChildProcess.make(tool.executable, [
              "build",
              ...(input.extraArgs ?? []),
              project,
              "--out-dir",
              out,
              "--no-create-gitignore",
            ], { cwd: project, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" }),
            Sink.drain,
          );
        if (input.atomic === true) return yield* Atomic.directory(outdir, produce);
        yield* produce(outdir);
        return outdir;
      }, Effect.provideContext(platform)),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
