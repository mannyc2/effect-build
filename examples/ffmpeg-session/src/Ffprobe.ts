import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Schema } from "effect";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const Probe = Schema.fromJsonString(Schema.Struct({
  streams: Schema.Array(Schema.Struct({
    index: Schema.Int,
    codec_type: Schema.String,
    codec_name: Schema.optionalKey(Schema.String),
  })),
  format: Schema.Struct({
    format_name: Schema.String,
    duration: Schema.optionalKey(Schema.FiniteFromString),
  }),
}));

export interface Options {
  readonly executable?: string | undefined;
}

export class Ffprobe extends Context.Service<Ffprobe>()("@effect-build/example-ffmpeg-session/Ffprobe", {
  make: Effect.fn("Ffprobe.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("ffprobe", options);
    const probe = (file: string, args: ReadonlyArray<string>, maxBytes: number) =>
      tool.run(
        ChildProcess.make(tool.executable, ["-v", "error", ...args, "-i", file], { stdin: "ignore" }),
        tool.text({ maxBytes }),
      );

    return {
      /** Distinct codec types; MPEG-TS repeats rows per program. */
      codecTypes: Effect.fn("Ffprobe.codecTypes")(function*(file: string) {
        const csv = yield* probe(file, ["-show_entries", "stream=codec_type", "-of", "csv=p=0"], 64 * 1024);
        return [...new Set(csv.split(/\r?\n/u).map((row) => row.trim()).filter((row) => row !== ""))];
      }),
      /** Container duration in seconds. */
      duration: Effect.fn("Ffprobe.duration")(function*(file: string) {
        const csv = yield* probe(file, ["-show_entries", "format=duration", "-of", "csv=p=0"], 4096);
        return yield* tool.decode(Schema.FiniteFromString)(csv.trim());
      }),
      json: Effect.fn("Ffprobe.json")(function*(file: string) {
        const json = yield* probe(file, ["-show_streams", "-show_format", "-of", "json"], 4 * 1024 * 1024);
        return yield* tool.decode(Probe)(json);
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
