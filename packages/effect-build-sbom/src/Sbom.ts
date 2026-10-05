import type { Config, FileSystem } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import { ChildProcess } from "effect/process";
import * as Atomic from "effect-build/Atomic";
import * as Tool from "effect-build/Tool";

export const Format = Schema.Literals(["syft-json", "spdx-json@2.3", "cyclonedx-json@1.6"]);
export type Format = typeof Format.Type;

const Common = {
  /** A native Syft source, for example a directory path or `file:archive.tar`. */
  source: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
};

export const GenerateInput = Schema.Struct({
  ...Common,
  format: Format,
  outfile: Schema.String,
  atomic: Schema.optionalKey(Schema.Boolean),
});
export type GenerateInput = typeof GenerateInput.Type;

export const ReportInput = Schema.Struct(Common);
export type ReportInput = typeof ReportInput.Type;

export interface Options {
  readonly executable?: string | undefined;
}

export class Sbom extends Context.Service<Sbom>()("effect-build-sbom/Sbom", {
  make: Effect.fn("Sbom.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("syft", options);
    const path = yield* Path.Path;
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const command = (input: ReportInput, output: string) => ChildProcess.make(tool.executable, [
      "scan", input.source, ...(input.extraArgs ?? []), "--output", output, "--quiet",
    ], { cwd: input.cwd, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" });
    return {
      /** Writes the requested native format; discovery does not establish completeness. */
      generate: Effect.fn("Sbom.generate")(function*(input: GenerateInput) {
        const outfile = path.resolve(input.cwd ?? ".", input.outfile);
        const produce = (out: string) => tool.run(command(input, `${input.format}=${out}`), Sink.drain);
        if (input.atomic === true) return yield* Atomic.file(outfile, produce);
        yield* produce(outfile);
        return outfile;
      }, Effect.provideContext(platform)),
      /** Decodes Syft's native JSON report, bounded to 16 MiB. */
      report: Effect.fn("Sbom.report")(function*(input: ReportInput) {
        const json = yield* tool.run(command(input, "syft-json"), tool.text({ maxBytes: 16 * 1024 * 1024 }));
        return yield* tool.decode(Schema.fromJsonString(Schema.Json))(json);
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
