import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import { ChildProcess } from "effect/process";
import * as Tool from "effect-build/Tool";

export const Input = Schema.Struct({
  path: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type Input = typeof Input.Type;

export interface Options {
  /** Explicit native stapler path. Otherwise xcrun is resolved once. */
  readonly executable?: string | undefined;
}

export class Stapler extends Context.Service<Stapler>()("effect-build-apple/Stapler", {
  make: Effect.fn("Stapler.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make(options.executable === undefined ? "xcrun" : "stapler", options);
    const prefix = options.executable === undefined ? ["stapler"] : [];
    const path = yield* Path.Path;
    const run = (input: Input, operation: string) => tool.run(ChildProcess.make(tool.executable, [
      ...prefix, operation, ...(input.extraArgs ?? []), path.resolve(input.cwd ?? ".", input.path),
    ], { cwd: input.cwd, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" }), Sink.drain);
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
