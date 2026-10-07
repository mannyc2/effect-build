import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export interface BuildInput {
  readonly project: string;
  readonly outdir: string;
  readonly cwd?: string | undefined;
  /** `Redacted` values are revealed only into the command and removed from failure diagnostics. */
  readonly env?: Environment.Variables | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
  readonly atomic?: boolean | undefined;
}

export interface Options {
  readonly executable?: string | undefined;
  readonly mapCommand?: Tool.Options["mapCommand"];
}

export class Python extends Context.Service<Python>()("effect-build-python/Python", {
  make: Effect.fn("Python.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("uv", options);
    const path = yield* Path.Path;
    const platform = yield* Atomic.context;
    return {
      /** uv builds its wheel from the sdist by default. Returns the distribution directory. */
      build: Effect.fn("Python.build")(function*(input: BuildInput) {
        const project = path.resolve(input.cwd ?? ".", input.project);
        const outdir = path.resolve(input.cwd ?? ".", input.outdir);
        const { env, redact } = Environment.reveal(input.env);
        const produce = (out: string) =>
          tool.run(
            ChildProcess.make(tool.executable, [
              "build",
              ...(input.extraArgs ?? []),
              project,
              "--out-dir",
              out,
              "--no-create-gitignore",
            ], { cwd: project, env, extendEnv: input.extendEnv, stdin: "ignore" }),
            Sink.drain,
            { redact },
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
