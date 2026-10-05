import type { Config, FileSystem } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Executable from "effect-build/Executable";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export const Target = Schema.Literals([
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc",
  "aarch64-pc-windows-msvc",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
]);
export type Target = typeof Target.Type;

const Common = {
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  config: Schema.optionalKey(Schema.Union([Schema.String, Schema.Literal(false)])),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
  atomic: Schema.optionalKey(Schema.Boolean),
};

export const CompileInput = Schema.Struct({
  ...Common,
  entrypoint: Schema.String,
  outfile: Schema.String,
  target: Schema.optionalKey(Target),
  allowAll: Schema.optionalKey(Schema.Boolean),
  scriptArgs: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type CompileInput = typeof CompileInput.Type;

export const BundleInput = Schema.Struct({
  ...Common,
  entrypoints: Schema.NonEmptyArray(Schema.String),
  outdir: Schema.String,
  platform: Schema.optionalKey(Schema.Literals(["browser", "deno"])),
  format: Schema.optionalKey(Schema.Literals(["esm", "cjs", "iife"])),
  minify: Schema.optionalKey(Schema.Boolean),
});
export type BundleInput = typeof BundleInput.Type;

const flags = (input: CompileInput | BundleInput) => {
  const args = [...(input.extraArgs ?? [])];
  if (input.config === false) args.push("--no-config");
  else if (input.config !== undefined) args.push("--config", input.config);
  return args;
};

export interface Options {
  readonly executable?: string | undefined;
  /** Select a native denort without recording or probing its bytes. */
  readonly runtime?: string | undefined;
}

export class Deno extends Context.Service<Deno>()("effect-build-deno/Deno", {
  make: Effect.fn("Deno.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("deno", { executable: options.executable });
    const path = yield* Path.Path;
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const run = (input: CompileInput | BundleInput, args: ReadonlyArray<string>) =>
      tool.run(
        ChildProcess.make(tool.executable, args, {
          cwd: input.cwd,
          env: options.runtime === undefined ? input.env : { ...input.env, DENORT_BIN: options.runtime },
          extendEnv: options.runtime === undefined ? input.extendEnv : (input.extendEnv ?? true),
          stdin: "ignore",
        }),
        Sink.drain,
      );
    return {
      /** Deno embeds the output basename; staging keeps that basename intact. */
      compile: Effect.fn("Deno.compile")(function*(input: CompileInput) {
        const requested = path.resolve(input.cwd ?? ".", input.outfile);
        const windows = input.target === undefined ? path.sep === "\\" : input.target.endsWith("-windows-msvc");
        const outfile = windows && !requested.endsWith(".exe") ? `${requested}.exe` : requested;
        const produce = (out: string) =>
          run(input, [
            "compile",
            ...flags(input),
            ...(input.allowAll === true ? ["--allow-all"] : []),
            ...(input.target === undefined ? [] : ["--target", input.target]),
            "--output",
            out,
            input.entrypoint,
            ...(input.scriptArgs ?? []),
          ]);
        if (input.atomic === true) return yield* Atomic.file(outfile, produce, { check: Executable.checkNative });
        yield* produce(outfile);
        return outfile;
      }, Effect.provideContext(platform)),
      /** Bundles with the native Deno command and returns the output directory. */
      bundle: Effect.fn("Deno.bundle")(function*(input: BundleInput) {
        const outdir = path.resolve(input.cwd ?? ".", input.outdir);
        const produce = (out: string) =>
          run(input, [
            "bundle",
            ...flags(input),
            ...(input.platform === undefined ? [] : ["--platform", input.platform]),
            ...(input.format === undefined ? [] : ["--format", input.format]),
            ...(input.minify === true ? ["--minify"] : []),
            "--outdir",
            out,
            ...input.entrypoints,
          ]);
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
