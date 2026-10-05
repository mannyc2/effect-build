import type { Config, FileSystem } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export const Format = Schema.Literals(["deb", "rpm", "apk", "archlinux", "msix"]);
export type Format = typeof Format.Type;

export const PackageInput = Schema.Struct({
  /** Native nFPM YAML or JSON configuration. */
  config: Schema.String,
  format: Format,
  outfile: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
  atomic: Schema.optionalKey(Schema.Boolean),
});
export type PackageInput = typeof PackageInput.Type;

export interface Options {
  readonly executable?: string | undefined;
}

export class Nfpm extends Context.Service<Nfpm>()("effect-build-nfpm/Nfpm", {
  make: Effect.fn("Nfpm.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("nfpm", options);
    const path = yield* Path.Path;
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    return {
      /** Packages the native configuration and returns its absolute output path. */
      package: Effect.fn("Nfpm.package")(function*(input: PackageInput) {
        const outfile = path.resolve(input.cwd ?? ".", input.outfile);
        const produce = (out: string) =>
          tool.run(
            ChildProcess.make(tool.executable, [
              "package",
              ...(input.extraArgs ?? []),
              "--config",
              input.config,
              "--packager",
              input.format,
              "--target",
              out,
            ], { cwd: input.cwd, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" }),
            Sink.drain,
          );
        if (input.atomic === true) return yield* Atomic.file(outfile, produce);
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
