// TestClock drives the application watchdog while typed service doubles control each writer.
import { assert, describe, it } from "@effect/vitest";
import {
  Cause,
  Clock,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  PlatformError,
  Queue,
  Redacted,
  Schema,
  Sink,
  Stream,
} from "effect";
import type { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process";
import { TestClock } from "effect/testing";
import { EncoderStopped, Exited, runGeneration, Stalled, type Tick, TicksEnded } from "../src/Encoder.js";
import { Ffmpeg, type Progress } from "../src/Ffmpeg.js";

// "open" accepts every chunk, "closed" blocks each chunk on a permit, an error fails the first chunk.
type Gate = "open" | "closed" | PlatformError.PlatformError;

const outcome = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isSuccess(exit) ? "Success" : Cause.hasInterruptsOnly(exit.cause) ? "Interrupted" : "Failed";

// `kill` fails with `killFails` instead of ending the process, when given.
const fixture = Effect.fnUntraced(function*(gates: {
  readonly video: Gate;
  readonly audio: Gate;
  readonly killFails?: PlatformError.PlatformError;
}) {
  const ticks = yield* Queue.unbounded<Tick, Cause.Done>();
  const progress = yield* Queue.unbounded<Progress>();
  const exited = yield* Deferred.make<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>();
  const killed: Array<{ readonly at: number; readonly signal: ChildProcess.KillOptions["killSignal"] }> = [];
  const advanced: Array<number> = [];
  const logs: Array<{ readonly level: string; readonly message: unknown }> = [];
  const logger = Logger.layer([Logger.make((entry) => logs.push({ level: entry.logLevel, message: entry.message }))]);
  const exits: Record<string, string> = {};
  const recordExit = (name: string) => <A, E>(exit: Exit.Exit<A, E>) =>
    Effect.sync(() => {
      exits[name] = outcome(exit);
    });

  const writer = Effect.fnUntraced(function*(name: "video" | "audio", gate: Gate) {
    const open = { value: gate === "open" };
    const permits = yield* Queue.unbounded<void>();
    const taken = yield* Queue.unbounded<number>();
    const seen: Array<number> = [];
    const sink = Sink.forEach((bytes: Uint8Array) =>
      Effect.gen(function*() {
        const first = bytes[0];
        if (first === undefined) return assert.fail("expected a nonempty writer chunk");
        seen.push(first);
        yield* Queue.offer(taken, first);
        if (typeof gate === "object") return yield* gate;
        if (!open.value) yield* Queue.take(permits);
      })
    ).pipe(Sink.onExit(recordExit(name)));
    return {
      sink,
      seen,
      taken: (n: number) => Effect.forEach(Array.from({ length: n }), () => Queue.take(taken)),
      release: Effect.sync(() => {
        open.value = true;
      }).pipe(Effect.andThen(Queue.offer(permits, undefined))),
    };
  });
  const video = yield* writer("video", gates.video);
  const audio = yield* writer("audio", gates.audio);

  const layer = Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      encode: () =>
        Effect.succeed({
          video: video.sink,
          audio: audio.sink,
          progress: Stream.fromQueue(progress).pipe(Stream.onExit(recordExit("progress"))),
          exitCode: Deferred.await(exited),
          kill: (options?: ChildProcess.KillOptions) =>
            Clock.currentTimeMillis.pipe(
              Effect.tap((at) => Effect.sync(() => killed.push({ at, signal: options?.killSignal }))),
              Effect.andThen(
                gates.killFails === undefined
                  ? Deferred.succeed(exited, ChildProcessSpawner.ExitCode(137))
                  : Effect.fail(gates.killFails),
              ),
              Effect.asVoid,
              Effect.uninterruptible,
            ),
        }),
    }),
  );

  const context = yield* Layer.build(Layer.merge(layer, logger));
  const start = (writeDeadline: Duration.Input = "500 millis") =>
    runGeneration({
      input: { output: { _tag: "Rtsp", url: Redacted.make("rtsp://unused") }, videoBitrate: 1_500_000 },
      ticks: Stream.fromQueue(ticks).pipe(Stream.onExit(recordExit("ticks"))),
      writeDeadline: Duration.fromInputUnsafe(writeDeadline),
      onOutputAdvance: (micros) => Effect.sync(() => advanced.push(micros)),
    }).pipe(Effect.provideContext(context), Effect.forkChild, Effect.tap(() => settle));

  const send = (index: number) =>
    Queue.offer(ticks, { index, video: Uint8Array.of(index), audio: Int16Array.of(index) });
  const emit = (...events: ReadonlyArray<Progress>) =>
    Queue.offerAll(progress, events).pipe(Effect.andThen(TestClock.adjust(0)));

  // Tick 1 is held inside each closed writer, 2 and 3 fill the capacity-two queues, tick 4's offer blocks.
  const blocked = Effect.gen(function*() {
    yield* send(1);
    yield* video.taken(1);
    if (gates.audio === "closed") yield* audio.taken(1);
    yield* Effect.forEach([2, 3, 4], send);
    if (gates.audio === "open") assert.deepStrictEqual(yield* audio.taken(4), [1, 2, 3, 4]);
    else yield* settle;
  });

  return { start, send, emit, blocked, video, audio, exited, killed, advanced, exits, ticks, logs };
});

const settle = Effect.repeat(Effect.yieldNow, { times: 50 });

/** The typed failures of a finished generation, all of them, to catch a second reason racing the first. */
const failures = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error) : [];

const stalledAt = (exit: Exit.Exit<unknown, unknown>, tick: number) => {
  const reason = stopped(exit);
  assert.instanceOf(reason, Stalled, `expected Stalled, got ${reason._tag}: ${reason.message}`);
  if (!Schema.is(Stalled)(reason)) return assert.fail("expected Stalled");
  assert.strictEqual(reason.tick, tick);
};

const stopped = (exit: Exit.Exit<unknown, unknown>) => {
  const errors = failures(exit);
  assert.strictEqual(errors.length, 1, Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "succeeded");
  assert.instanceOf(errors[0], EncoderStopped);
  const error = errors[0];
  if (!Schema.is(EncoderStopped)(error)) return assert.fail("expected EncoderStopped");
  return error.reason;
};

const pending = (fiber: Fiber.Fiber<unknown, unknown>) => assert.isUndefined(fiber.pollUnsafe());

describe("paired writer watchdog", () => {
  it.effect("keeps the same paired offer pending while video advances, without duplicating accepted audio", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "open" });
      const fiber = yield* f.start();
      yield* f.blocked;
      yield* TestClock.adjust(400);
      yield* f.emit({ _tag: "Frame", frame: 1 }, { _tag: "OutputTime", micros: 1_000 });
      yield* TestClock.adjust(100);
      assert.deepStrictEqual(f.killed, []);
      yield* TestClock.adjust(300);
      yield* f.emit({ _tag: "Frame", frame: 2 }, { _tag: "OutputTime", micros: 2_000 });
      yield* TestClock.adjust(300);
      assert.deepStrictEqual(f.killed, []);
      yield* f.video.release;
      assert.deepStrictEqual(yield* f.video.taken(3), [2, 3, 4]);
      yield* TestClock.adjust(500);
      assert.deepStrictEqual(f.video.seen, [1, 2, 3, 4]);
      assert.deepStrictEqual(f.audio.seen, [1, 2, 3, 4]);
      assert.deepStrictEqual(f.killed, []);
      assert.deepStrictEqual(f.advanced, [1_000, 2_000]);
      pending(fiber); // stands in for `encoder.generation === 1`: the same generation is still running
    }));

  it.effect("kills 500 ms after video stops advancing, even when audio output keeps advancing", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "open" });
      const fiber = yield* f.start();
      yield* f.blocked;
      yield* TestClock.adjust(400);
      yield* f.emit({ _tag: "Frame", frame: 1 }, { _tag: "OutputTime", micros: 1_000 });
      yield* TestClock.adjust(300);
      yield* f.emit({ _tag: "Frame", frame: 1 }, { _tag: "OutputTime", micros: 2_000 });
      yield* TestClock.adjust(199);
      assert.deepStrictEqual(f.killed, []);
      yield* TestClock.adjust(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 900, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
    }));

  it.effect("kills a blocked startup with no video output after 500 ms", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "open" });
      const fiber = yield* f.start();
      yield* f.blocked;
      yield* TestClock.adjust(499);
      assert.deepStrictEqual(f.killed, []);
      yield* TestClock.adjust(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 500, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
    }));
});

describe("runGeneration", () => {
  it.effect("2. stalls writeDeadline after the blocking tick started, with no progress ever", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "closed" });
      const fiber = yield* f.start();
      // Ticks 1-3 at t=0 do not block; tick 4 starts, and blocks, at t=1000.
      yield* f.send(1);
      yield* f.video.taken(1);
      yield* f.audio.taken(1);
      yield* Effect.forEach([2, 3], f.send);
      yield* TestClock.adjust(1_000);
      assert.deepStrictEqual(f.killed, []);
      yield* f.send(4);
      yield* settle;
      yield* TestClock.adjust(499);
      assert.deepStrictEqual(f.killed, []);
      pending(fiber);
      yield* TestClock.adjust(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 1_500, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
    }));

  it.effect("3. each video advance moves the bound; the stall comes writeDeadline after the last one", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "closed" });
      const fiber = yield* f.start();
      yield* f.blocked;
      for (let frame = 1; frame <= 10; frame++) {
        yield* TestClock.adjust(250);
        yield* f.emit({ _tag: "Frame", frame });
        assert.deepStrictEqual(f.killed, [], `killed after frame ${frame}`);
      }
      // t=2500 = 5 x writeDeadline, last advance at 2500.
      yield* TestClock.adjust(499);
      assert.deepStrictEqual(f.killed, []);
      pending(fiber);
      yield* TestClock.adjust(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 3_000, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
    }));

  it.effect("4. an advance 2 x writeDeadline old stalls a tick at once when it blocks", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "closed" });
      const fiber = yield* f.start();
      yield* f.send(1);
      yield* f.video.taken(1);
      yield* f.audio.taken(1);
      yield* Effect.forEach([2, 3], f.send);
      yield* f.emit({ _tag: "Frame", frame: 1 }); // the last advance, at t=0
      yield* TestClock.adjust(1_000);
      assert.deepStrictEqual(f.killed, []);
      yield* f.send(4); // blocks at t=1000
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 1_000, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
    }));

  it.effect("4a. Duration.subtract goes negative, and a negative sleep completes without the clock moving", () =>
    Effect.gen(function*() {
      const remaining = Duration.subtract(Duration.millis(500), Duration.nanos(1_000_000_000n));
      assert.isTrue(Duration.isNegative(remaining));
      assert.strictEqual(Duration.toMillis(remaining), -500);
      const fiber = yield* Effect.forkChild(Effect.sleep(remaining));
      yield* Effect.yieldNow;
      assert.isTrue(Exit.isExit(fiber.pollUnsafe()), "TestClock sleep(-500ms) did not complete");
    }));

  it.live("4b. a negative sleep on the live clock completes immediately", () =>
    Effect.gen(function*() {
      const before = performance.now();
      yield* Effect.sleep(Duration.subtract(Duration.millis(500), Duration.millis(1_000)));
      assert.isBelow(performance.now() - before, 20);
    }));

  it.effect("5. out_time_us advances call onOutputAdvance with increasing micros, only on increase", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "open", audio: "open" });
      const fiber = yield* f.start();
      yield* f.emit(
        { _tag: "OutputTime", micros: 1_000 },
        { _tag: "OutputTime", micros: 1_000 },
        { _tag: "Frame", frame: 1 },
        { _tag: "OutputTime", micros: 500 },
        { _tag: "OutputTime", micros: 2_000 },
        { _tag: "Frame", frame: 2 },
        { _tag: "OutputTime", micros: 2_000 },
        { _tag: "OutputTime", micros: 3_000 },
      );
      yield* settle;
      assert.deepStrictEqual(f.advanced, [1_000, 2_000, 3_000]);
      pending(fiber);
    }));

  it.effect("6. exit code 0 ends the generation with Exited and interrupts writers and progress", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "closed", audio: "closed" });
      const fiber = yield* f.start();
      yield* f.send(1);
      yield* f.video.taken(1);
      yield* f.audio.taken(1);
      yield* Deferred.succeed(f.exited, ChildProcessSpawner.ExitCode(0));
      const exit = yield* Fiber.await(fiber);
      const reason = stopped(exit);
      assert.instanceOf(reason, Exited);
      if (!Schema.is(Exited)(reason)) return assert.fail("expected Exited");
      assert.strictEqual(reason.code, 0);
      assert.deepStrictEqual(f.exits, {
        video: "Interrupted",
        audio: "Interrupted",
        progress: "Interrupted",
        ticks: "Interrupted",
      });
      assert.deepStrictEqual(f.killed, []);
    }));

  it.effect("7. the tick source ending while healthy fails with TicksEnded", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "open", audio: "open" });
      const fiber = yield* f.start();
      yield* Effect.forEach([1, 2], f.send);
      assert.deepStrictEqual(yield* f.video.taken(2), [1, 2]);
      assert.deepStrictEqual(yield* f.audio.taken(2), [1, 2]);
      yield* Queue.end(f.ticks);
      const reason = stopped(yield* Fiber.await(fiber));
      assert.instanceOf(reason, TicksEnded);
      assert.deepStrictEqual(f.killed, []);
      assert.strictEqual(f.exits.ticks, "Success");
    }));

  it.effect("8. a writer failing with a PlatformError fails the generation with that error", () =>
    Effect.gen(function*() {
      const error = PlatformError.systemError({ _tag: "WriteZero", module: "ChildProcess", method: "stdin" });
      const f = yield* fixture({ video: error, audio: "open" });
      const fiber = yield* f.start();
      yield* f.send(1);
      const exit = yield* Fiber.await(fiber);
      const errors = failures(exit);
      assert.deepStrictEqual(errors, [error]);
      assert.deepStrictEqual(f.killed, []);
      assert.deepStrictEqual(f.exits, {
        video: "Failed",
        audio: "Interrupted",
        progress: "Interrupted",
        ticks: "Interrupted",
      });
    }));

  it.effect("9. a SIGKILL that fails during a stall still fails with Stalled, and logs a warning", () =>
    Effect.gen(function*() {
      const error = PlatformError.systemError({ _tag: "PermissionDenied", module: "ChildProcess", method: "kill" });
      const f = yield* fixture({ video: "closed", audio: "open", killFails: error });
      const fiber = yield* f.start();
      yield* f.blocked;
      yield* TestClock.adjust(499);
      assert.deepStrictEqual(f.killed, []);
      yield* TestClock.adjust(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, [{ at: 500, signal: "SIGKILL" }]);
      stalledAt(yield* Fiber.await(fiber), 4);
      assert.deepStrictEqual(f.logs, [{ level: "Warn", message: ["SIGKILL failed", error] }]);
    }));
});

describe("native terminal outcomes", () => {
  it.effect("P2. exitCode failing with a PlatformError (a signal death) fails the generation with it", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "open", audio: "open" });
      const fiber = yield* f.start();
      const error = PlatformError.systemError({ _tag: "Unknown", module: "ChildProcess", method: "exitCode" });
      yield* Deferred.fail(f.exited, error);
      assert.deepStrictEqual(failures(yield* Fiber.await(fiber)), [error]);
    }));

  it.effect("P1. a tick whose offers do not block is not stalled, even when the last advance is stale", () =>
    Effect.gen(function*() {
      const f = yield* fixture({ video: "open", audio: "open" });
      const fiber = yield* f.start();
      yield* f.emit({ _tag: "Frame", frame: 1 });
      yield* TestClock.adjust(1_000);
      yield* f.send(1);
      yield* settle;
      assert.deepStrictEqual(f.killed, []);
      pending(fiber);
    }));
});
