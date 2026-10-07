import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Schema, Sink } from "effect";
import * as Atomic from "effect-build/Atomic";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export type Format = "syft-json" | "spdx-json@2.3" | "cyclonedx-json@1.6";

interface Common {
  /** A native Syft source, for example a directory path or `file:archive.tar`. */
  readonly source: string;
  readonly cwd?: string | undefined;
  /** `Redacted` values are revealed only into the command and removed from failure diagnostics. */
  readonly env?: Environment.Variables | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
}

export interface GenerateInput extends Common {
  readonly format: Format;
  readonly outfile: string;
  readonly atomic?: boolean | undefined;
}

export type ReportInput = Common;

export interface Options {
  readonly executable?: string | undefined;
  readonly mapCommand?: Tool.Options["mapCommand"];
}

export class Sbom extends Context.Service<Sbom>()("effect-build-sbom/Sbom", {
  make: Effect.fn("Sbom.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("syft", options);
    const path = yield* Path.Path;
    const platform = yield* Atomic.context;
    const scan = <A>(
      input: ReportInput,
      output: string,
      sink: Sink.Sink<A, Uint8Array, Uint8Array, Tool.ToolError>,
    ) => {
      const { env, redact } = Environment.reveal(input.env);
      return tool.run(
        ChildProcess.make(tool.executable, [
          "scan",
          input.source,
          ...(input.extraArgs ?? []),
          "--output",
          output,
          "--quiet",
        ], { cwd: input.cwd, env, extendEnv: input.extendEnv, stdin: "ignore" }),
        sink,
        { redact },
      );
    };
    return {
      /** Writes the requested native format; discovery does not establish completeness. */
      generate: Effect.fn("Sbom.generate")(function*(input: GenerateInput) {
        const outfile = path.resolve(input.cwd ?? ".", input.outfile);
        const produce = (out: string) => scan(input, `${input.format}=${out}`, Sink.drain);
        if (input.atomic === true) return yield* Atomic.file(outfile, produce);
        yield* produce(outfile);
        return outfile;
      }, Effect.provideContext(platform)),
      /** Decodes Syft's native JSON report, bounded to 16 MiB. */
      report: Effect.fn("Sbom.report")(function*(input: ReportInput) {
        const json = yield* scan(input, "syft-json", tool.text({ maxBytes: 16 * 1024 * 1024 }));
        return yield* tool.decode(Schema.fromJsonString(Schema.Json))(json);
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
