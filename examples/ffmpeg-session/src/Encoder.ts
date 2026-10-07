import { Clock, Duration, Effect, Option, Queue, Schema, Stream, SubscriptionRef } from "effect";
import type { EncodeInput, Progress } from "./Ffmpeg.js";
import { Ffmpeg } from "./Ffmpeg.js";

export interface Tick {
  readonly index: number;
  readonly video: Uint8Array;
  readonly audio: Int16Array;
}

export class TicksEnded extends Schema.TaggedError<TicksEnded>()("TicksEnded", {}) {
  override get message(): string {
    return "the live tick source ended";
  }
}
export class Stalled extends Schema.TaggedError<Stalled>()("Stalled", { tick: Schema.Int }) {
  override get message(): string {
    return `tick ${this.tick} blocked without video advancing`;
  }
}
export class Exited extends Schema.TaggedError<Exited>()("Exited", { code: Schema.Int }) {
  override get message(): string {
    return `ffmpeg exited with code ${this.code}`;
  }
}
export class EncoderStopped extends Schema.TaggedError<EncoderStopped>()("EncoderStopped", {
  reason: Schema.Union([TicksEnded, Stalled, Exited]),
}) {
  override get message(): string {
    return this.reason.message;
  }
}

/**
 * Feeds `ticks` to one encoder until something stops it; it never succeeds.
 * Each tick is one paired offer into capacity-two queues, one persistent writer
 * per input. A tick that blocks while video output has not advanced for
 * `writeDeadline` (measured from the last advance, or from the tick if there
 * was none) kills ffmpeg with SIGKILL.
 */
export const runGeneration = Effect.fn("Encoder.runGeneration")(
  function*(options: {
    readonly input: EncodeInput;
    readonly ticks: Stream.Stream<Tick>;
    readonly writeDeadline: Duration.Duration;
    readonly onOutputAdvance: (micros: number) => Effect.Effect<void>;
  }) {
    const encoding = yield* (yield* Ffmpeg).encode(options.input);
    const video = yield* Queue.bounded<Uint8Array>(2);
    const audio = yield* Queue.bounded<Uint8Array>(2);
    // Monotonic time of the last video advance.
    const videoAdvancedAt = yield* SubscriptionRef.make(Option.none<bigint>());

    const stop = (reason: TicksEnded | Stalled | Exited) => Effect.fail(EncoderStopped.make({ reason }));

    const observe = Effect.fnUntraced(function*(seen: { frame: number; micros: number }, event: Progress) {
      switch (event._tag) {
        case "Frame": {
          if (event.frame <= seen.frame) return seen;
          yield* SubscriptionRef.set(videoAdvancedAt, Option.some(yield* Clock.monotonicTimeNanos));
          return { ...seen, frame: event.frame };
        }
        case "OutputTime": {
          if (event.micros <= seen.micros) return seen;
          yield* options.onOutputAdvance(event.micros);
          return { ...seen, micros: event.micros };
        }
      }
    });

    // Completes once video has not advanced for `deadline`; every advance restarts the wait.
    const videoStalls = (tickStarted: bigint) =>
      SubscriptionRef.changes(videoAdvancedAt).pipe(
        Stream.switchMap(
          (advancedAt) =>
            Stream.fromEffect(Effect.gen(function*() {
              const elapsed = Duration.nanos(
                (yield* Clock.monotonicTimeNanos) - Option.getOrElse(advancedAt, () => tickStarted),
              );
              yield* Effect.sleep(Duration.subtract(options.writeDeadline, elapsed));
            })),
        ),
        Stream.take(1),
        Stream.runDrain,
      );

    const offer = Effect.fnUntraced(function*(tick: Tick) {
      const started = yield* Clock.monotonicTimeNanos;
      const audioBytes = new Uint8Array(tick.audio.buffer, tick.audio.byteOffset, tick.audio.byteLength);
      yield* Effect.all([Queue.offer(video, tick.video), Queue.offer(audio, audioBytes)], {
        discard: true,
        concurrency: 2,
      }).pipe(
        Effect.raceFirst(videoStalls(started).pipe(Effect.andThen(stop(Stalled.make({ tick: tick.index }))))),
      );
    });

    // None of these succeeds while the encoder is healthy; the first failure interrupts the rest.
    // A stall kills only after Stalled has won: killing first lets the exit or a pipe reset report instead.
    const killAfterStall = encoding.kill({ killSignal: "SIGKILL" }).pipe(
      Effect.catch((failure) => Effect.logWarning("SIGKILL failed", failure)),
    );
    yield* Effect.all([
      options.ticks.pipe(Stream.runForEach(offer), Effect.andThen(stop(TicksEnded.make({})))),
      Stream.fromQueue(video).pipe(Stream.run(encoding.video)),
      Stream.fromQueue(audio).pipe(Stream.run(encoding.audio)),
      encoding.progress.pipe(Stream.runFoldEffect(() => ({ frame: 0, micros: 0 }), observe)),
      encoding.exitCode.pipe(Effect.flatMap((code) => stop(Exited.make({ code })))),
    ], { concurrency: "unbounded", discard: true }).pipe(
      Effect.tapError((error) =>
        error._tag === "EncoderStopped" && error.reason._tag === "Stalled"
          ? killAfterStall
          : Effect.void
      ),
    );
  },
  Effect.scoped,
);
