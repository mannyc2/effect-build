import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const Common = {
  path: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
};

export const SignInput = Schema.Struct({
  ...Common,
  identity: Schema.String,
  force: Schema.optionalKey(Schema.Boolean),
  hardenedRuntime: Schema.optionalKey(Schema.Boolean),
  timestamp: Schema.optionalKey(Schema.Boolean),
  entitlements: Schema.optionalKey(Schema.String),
});
export type SignInput = typeof SignInput.Type;

export const VerifyInput = Schema.Struct({ ...Common, strict: Schema.optionalKey(Schema.Boolean) });
export type VerifyInput = typeof VerifyInput.Type;

export interface Options {
  readonly executable?: string | undefined;
}

export class Codesign extends Context.Service<Codesign>()("effect-build-apple/Codesign", {
  make: Effect.fn("Codesign.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("codesign", options);
    const path = yield* Path.Path;
    const run = (input: SignInput | VerifyInput, args: ReadonlyArray<string>) =>
      tool.run(
        ChildProcess.make(tool.executable, args, {
          cwd: input.cwd,
          env: input.env,
          extendEnv: input.extendEnv,
          stdin: "ignore",
        }),
        Sink.drain,
      );
    return {
      /** Signs a path in place. Nested code ordering belongs to the application. */
      sign: Effect.fn("Codesign.sign")(function*(input: SignInput) {
        const destination = path.resolve(input.cwd ?? ".", input.path);
        yield* run(input, [
          ...(input.extraArgs ?? []),
          "--sign",
          input.identity,
          ...(input.force === true ? ["--force"] : []),
          ...(input.hardenedRuntime === true ? ["--options", "runtime"] : []),
          ...(input.timestamp === undefined ? [] : [input.timestamp ? "--timestamp" : "--timestamp=none"]),
          ...(input.entitlements === undefined ? [] : ["--entitlements", input.entitlements]),
          "--",
          destination,
        ]);
        return destination;
      }),
      verify: Effect.fn("Codesign.verify")(function*(input: VerifyInput) {
        yield* run(input, [
          ...(input.extraArgs ?? []),
          "--verify",
          ...(input.strict === true ? ["--strict"] : []),
          "--",
          path.resolve(input.cwd ?? ".", input.path),
        ]);
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
