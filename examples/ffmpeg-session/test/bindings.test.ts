import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Redacted, Stream } from "effect";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";
import { Ffmpeg } from "../src/Ffmpeg.js";
import { Ffprobe } from "../src/Ffprobe.js";

const platform = Layer.merge(FileSystem.layerNoop({}), Path.layer);

describe("ffprobe native protocols", () => {
  it.effect("decodes duplicated MPEG-TS codec rows and finite duration through the captured spawner", () =>
    Effect.gen(function*() {
      const calls: ReadonlyArray<string>[] = [];
      const spawner = ToolTest.layer((command) =>
        Effect.sync(() => {
          if (command._tag !== "StandardCommand") return assert.fail("expected a native ffprobe command");
          calls.push(command.args);
          return ToolTest.handle({
            stdout: command.args.includes("stream=codec_type") ? "video\r\naudio\r\n\r\nvideo\naudio\n" : "1.25\n",
          });
        })
      );
      const probe = yield* Ffprobe.make({ executable: "chosen-ffprobe" }).pipe(
        Effect.provideContext(yield* Layer.build(Layer.merge(platform, spawner))),
      );
      assert.deepStrictEqual(yield* probe.codecTypes("clip.mp4"), ["video", "audio"]);
      assert.strictEqual(yield* probe.duration("clip.mp4"), 1.25);
      assert.deepStrictEqual(calls[0], [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        "-i",
        "clip.mp4",
      ]);
    }));

  it.effect("valid CSV followed by a failed exit retains the tool's diagnostic", () =>
    Effect.gen(function*() {
      const spawner = ToolTest.layer(() =>
        Effect.succeed(ToolTest.handle({
          stdout: "video\n",
          stderr: "Invalid data",
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(7)),
        }))
      );
      const probe = yield* Ffprobe.make({ executable: "ffprobe" }).pipe(
        Effect.provideContext(yield* Layer.build(Layer.merge(platform, spawner))),
      );
      const error = yield* probe.codecTypes("clip.mp4").pipe(Effect.flip);
      assert.strictEqual(error.reason._tag, "Exit");
      assert.include(error.message, "Invalid data");
    }));

  it.effect("malformed duration and JSON fail at the decoding boundary", () =>
    Effect.gen(function*() {
      const spawner = ToolTest.layer(() => Effect.succeed(ToolTest.handle({ stdout: "invalid" })));
      const probe = yield* Ffprobe.make({ executable: "ffprobe" }).pipe(
        Effect.provideContext(yield* Layer.build(Layer.merge(platform, spawner))),
      );
      assert.strictEqual((yield* probe.duration("clip.mp4").pipe(Effect.flip)).reason._tag, "Output");
      assert.strictEqual((yield* probe.json("clip.mp4").pipe(Effect.flip)).reason._tag, "Output");
    }));
});

describe("ffmpeg scoped session", () => {
  it.effect("orders both native inputs, requests fd3, and decodes bounded progress events", () =>
    Effect.gen(function*() {
      const spawner = ToolTest.layer((command) =>
        Effect.sync(() => {
          if (command._tag !== "StandardCommand") return assert.fail("expected a native ffmpeg command");
          assert.isBelow(command.args.indexOf("pipe:0"), command.args.indexOf("pipe:3"));
          assert.deepStrictEqual(command.options.additionalFds, { fd3: { type: "input" } });
          assert.strictEqual(command.options.stderr, "inherit");
          assert.strictEqual(command.options.killSignal, "SIGINT");
          assert.include(command.args, "rtsp://credential@example/live");
          return ToolTest.handle({
            stdout: "frame=1\nout_time_us=1000\nframe=invalid\nframe=1=bad\nunknown=1\nout_time_us=0\nframe=2",
          });
        })
      );
      const binding = yield* Ffmpeg.make({ executable: "ffmpeg" }).pipe(
        Effect.provideContext(yield* Layer.build(Layer.merge(platform, spawner))),
      );
      const encoding = yield* binding.encode({
        output: { _tag: "Rtsp", url: Redacted.make("rtsp://credential@example/live") },
        videoBitrate: 1_500_000,
      });
      assert.deepStrictEqual(yield* Stream.runCollect(encoding.progress), [
        { _tag: "Frame", frame: 1 },
        { _tag: "OutputTime", micros: 1000 },
        { _tag: "Frame", frame: 2 },
      ]);
    }).pipe(Effect.scoped));
});
