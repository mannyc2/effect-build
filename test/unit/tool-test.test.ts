import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, PlatformError, Sink, Stream } from "effect";
import { ToolTest } from "effect-build/testing";
import * as Tool from "effect-build/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

describe("ToolTest transport seam", () => {
  it.effect("supplies native defaults and configurable input/output descriptors", () =>
    Effect.gen(function*() {
      const received: Array<Uint8Array> = [];
      const handle = ToolTest.handle({
        pid: 42,
        stdout: "video",
        stderr: "warning",
        inputFds: {
          3: Sink.forEach((chunk) =>
            Effect.sync(() => {
              received.push(chunk);
            })
          ),
        },
        outputFds: { 4: Stream.succeed(Uint8Array.of(7)) },
      });
      yield* Stream.succeed(Uint8Array.of(1, 2)).pipe(Stream.run(handle.getInputFd(3)));
      assert.strictEqual(handle.pid, 42);
      assert.strictEqual(yield* handle.exitCode, 0);
      assert.strictEqual(yield* handle.isRunning, false);
      assert.deepStrictEqual(received, [Uint8Array.of(1, 2)]);
      assert.deepStrictEqual(yield* Stream.runCollect(handle.getOutputFd(4)), [Uint8Array.of(7)]);
      assert.deepStrictEqual(yield* Stream.runCollect(handle.getOutputFd(9)), []);
    }));

  it.effect("renders through the real Tool and keeps valid output followed by a bad exit", () =>
    Effect.gen(function*() {
      const commands: Array<ChildProcess.Command> = [];
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The test provides its complete fake platform at binding construction.
      const tool = yield* Tool.make("fixture", { executable: "fixture" }).pipe(Effect.provide(Layer.mergeAll(
        ToolTest.layer((command) =>
          Effect.sync(() => {
            commands.push(command);
            return ToolTest.handle({
              stdout: "valid",
              stderr: "native failure",
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(7)),
            });
          })
        ),
        FileSystem.layerNoop({}),
        Path.layer,
      )));
      const error = yield* tool.run(ChildProcess.make(tool.executable, ["--report"]), tool.text({ maxBytes: 16 })).pipe(
        Effect.flip,
      );
      assert.strictEqual(commands.length, 1);
      assert.instanceOf(error.reason, Tool.Exit);
      assert.strictEqual(error.reason.stderr, "native failure");
      assert.strictEqual(
        yield* tool.run(ChildProcess.make(tool.executable), tool.text({ maxBytes: 16 }), { exitCodes: [7] }),
        "valid",
      );
    }));

  it.effect("can fail acquisition with a native PlatformError", () =>
    Effect.gen(function*() {
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The test provides its complete fake platform at binding construction.
      const tool = yield* Tool.make("fixture", { executable: "fixture" }).pipe(Effect.provide(Layer.mergeAll(
        ToolTest.layer(() =>
          Effect.fail(PlatformError.systemError({ _tag: "NotFound", module: "ChildProcess", method: "spawn" }))
        ),
        FileSystem.layerNoop({}),
        Path.layer,
      )));
      const error = yield* tool.run(ChildProcess.make(tool.executable), Sink.drain).pipe(Effect.flip);
      assert.instanceOf(error.reason, Tool.Process);
      assert.include(error.message, "NotFound");
    }));
});
