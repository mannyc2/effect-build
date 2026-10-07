import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Sink } from "effect";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export interface Input {
  readonly path: string;
  readonly cwd?: string | undefined;
  /** `Redacted` values are revealed only into the command and removed from failure diagnostics. */
  readonly env?: Environment.Variables | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
}

export interface Options {
  /** Explicit native stapler path. Otherwise xcrun is resolved once. */
  readonly executable?: string | undefined;
  readonly mapCommand?: Tool.Options["mapCommand"];
}

export class Stapler extends Context.Service<Stapler>()("effect-build-apple/Stapler", {
  make: Effect.fn("Stapler.make")(function*(options: Options = {}) {
    // Errors name stapler even when it runs through xcrun.
    const xcrun = options.executable === undefined ? yield* Tool.make("xcrun", options) : undefined;
    const tool = yield* Tool.make("stapler", { ...options, executable: xcrun?.executable ?? options.executable });
    const prefix = xcrun === undefined ? [] : ["stapler"];
    const path = yield* Path.Path;
    const run = (input: Input, operation: string) => {
      const { env, redact } = Environment.reveal(input.env);
      return tool.run(
        ChildProcess.make(tool.executable, [
          ...prefix,
          operation,
          ...(input.extraArgs ?? []),
          path.resolve(input.cwd ?? ".", input.path),
        ], { cwd: input.cwd, env, extendEnv: input.extendEnv, stdin: "ignore" }),
        Sink.drain,
        { redact },
      );
    };
    return {
      staple: Effect.fn("Stapler.staple")(function*(input: Input) {
        yield* run(input, "staple");
        return path.resolve(input.cwd ?? ".", input.path);
      }),
      validate: Effect.fn("Stapler.validate")(function*(input: Input) {
        yield* run(input, "validate");
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
