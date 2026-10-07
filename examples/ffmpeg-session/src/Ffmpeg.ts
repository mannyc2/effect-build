import type { Config, PlatformError, Scope, Sink } from "effect";
import { Config as C, Context, Effect, Layer, Option, Redacted, Result, Schema, Stream } from "effect";
import * as Tool from "effect-build/Tool";
import type { ChildProcessSpawner } from "effect/process";
import { ChildProcess } from "effect/process";

const width = 1280;
const height = 720;
const fps = 24;
const sampleRate = 48_000;

export interface EncodeInput {
  readonly output:
    | { readonly _tag: "Rtsp"; readonly url: Redacted.Redacted<string> }
    | { readonly _tag: "File"; readonly path: string };
  readonly videoBitrate: number;
}

export type Progress =
  | { readonly _tag: "Frame"; readonly frame: number }
  | { readonly _tag: "OutputTime"; readonly micros: number };

/** A running encoder. Writes are raw RGBA frames and mono s16le audio. */
export interface Encoding {
  readonly video: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError>;
  readonly audio: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError>;
  /** One reader: consume it once. Ends at stdout EOF, which is not the process exit. */
  readonly progress: Stream.Stream<Progress, PlatformError.PlatformError | Tool.ToolError>;
  readonly exitCode: Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>;
  readonly kill: (options?: ChildProcess.KillOptions) => Effect.Effect<void, PlatformError.PlatformError>;
}

const count = Schema.decodeUnknownEffect(
  Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

/** `-progress` writes `key=value` lines; other keys and malformed values are skipped. */
const progress = Effect.fnUntraced(function*(line: string) {
  const separator = line.indexOf("=");
  if (separator === -1) return Result.fail(line);
  const key = line.slice(0, separator);
  const value = line.slice(separator + 1);
  if (key !== "frame" && key !== "out_time_us") return Result.fail(line);
  const decoded = yield* Effect.option(count(value));
  if (Option.isNone(decoded)) return Result.fail(line);
  if (key === "frame") return Result.succeed<Progress>({ _tag: "Frame", frame: decoded.value });
  if (decoded.value > 0) return Result.succeed<Progress>({ _tag: "OutputTime", micros: decoded.value });
  return Result.fail(line);
});

const args = (input: EncodeInput): Array<string> => {
  const rate = String(input.videoBitrate);
  const output = input.output._tag === "Rtsp"
    ? ["-f", "rtsp", "-rtsp_transport", "tcp", Redacted.value(input.output.url)]
    : ["-y", "-f", "mpegts", input.output.path];
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-nostats",
    "-progress",
    "pipe:1",
    "-stats_period",
    "0.25",
    "-filter_threads",
    "1",
    // Input 0: raw video on stdin.
    "-probesize",
    "32",
    "-analyzeduration",
    "0",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    // Input 1: raw audio on fd 3.
    "-probesize",
    "32",
    "-analyzeduration",
    "0",
    "-f",
    "s16le",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-i",
    "pipe:3",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-threads:v",
    "2",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline",
    "-level:v",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    rate,
    "-maxrate",
    rate,
    "-bufsize",
    String(input.videoBitrate * 2),
    "-g",
    String(fps),
    "-keyint_min",
    String(fps),
    "-sc_threshold",
    "0",
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    ...output,
  ];
};

export interface Options {
  readonly executable?: string | undefined;
}

export class Ffmpeg extends Context.Service<Ffmpeg>()("@effect-build/example-ffmpeg-session/Ffmpeg", {
  make: Effect.fn("Ffmpeg.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("ffmpeg", options);
    return {
      /** Starts an encoder that lives, and is traced, until the caller's Scope closes. */
      encode: Effect.fnUntraced(
        function*(input: EncodeInput): Effect.fn.Return<Encoding, Tool.ToolError, Scope.Scope> {
          const handle = yield* tool.session(ChildProcess.make(tool.executable, args(input), {
            detached: false,
            killSignal: "SIGINT",
            forceKillAfter: "500 millis",
            stdin: "pipe",
            stdout: "pipe",
            // Inherited, so diagnostics reach the terminal. A piped stderr must be drained by its reader.
            stderr: "inherit",
            additionalFds: { fd3: { type: "input" } },
          }));
          return {
            video: handle.stdin,
            audio: handle.getInputFd(3),
            progress: handle.stdout.pipe(tool.lines({ maxLineBytes: 4096 }), Stream.filterMapEffect(progress)),
            exitCode: handle.exitCode,
            kill: handle.kill,
          };
        },
        Effect.withSpanScoped("Ffmpeg.encode"),
      ),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
