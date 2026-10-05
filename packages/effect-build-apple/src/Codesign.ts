import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Sink } from "effect";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

interface Common {
  readonly path: string;
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
}

export interface SignInput extends Common {
  readonly identity: string;
  readonly force?: boolean | undefined;
  readonly hardenedRuntime?: boolean | undefined;
  readonly timestamp?: boolean | undefined;
  readonly entitlements?: string | undefined;
}

export interface VerifyInput extends Common {
  readonly strict?: boolean | undefined;
}

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
