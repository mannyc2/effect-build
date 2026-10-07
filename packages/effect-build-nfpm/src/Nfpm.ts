import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export type Format = "deb" | "rpm" | "apk" | "archlinux" | "msix";

export interface PackageInput {
  /** Native nFPM YAML or JSON configuration. */
  readonly config: string;
  readonly format: Format;
  readonly outfile: string;
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

export class Nfpm extends Context.Service<Nfpm>()("effect-build-nfpm/Nfpm", {
  make: Effect.fn("Nfpm.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("nfpm", options);
    const path = yield* Path.Path;
    const platform = yield* Atomic.context;
    return {
      /** Packages the native configuration and returns its absolute output path. */
      package: Effect.fn("Nfpm.package")(function*(input: PackageInput) {
        const outfile = path.resolve(input.cwd ?? ".", input.outfile);
        const { env, redact } = Environment.reveal(input.env);
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
            ], { cwd: input.cwd, env, extendEnv: input.extendEnv, stdin: "ignore" }),
            Sink.drain,
            { redact },
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
