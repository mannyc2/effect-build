import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Cause, Deferred, Effect, Fiber, Logger, Option, Ref, Sink, Stream } from "effect";
import * as Tool from "effect-build/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const native = NodeServices.layer;
const nodeCommand = (tool: Tool.Tool, script: string, options?: ChildProcess.CommandOptions) =>
  ChildProcess.make(tool.executable, ["-e", script], {
    stdin: "ignore",
    detached: false,
    killSignal: "SIGTERM",
    forceKillAfter: "100 millis",
    ...options,
  });
const isAlive = (pid: number) =>
  Effect.sync(() => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
const trackedTool = Effect.fnUntraced(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const pid = yield* Ref.make(Option.none<number>());
  const tool = yield* Tool.make("node", { executable: process.execPath }).pipe(Effect.provideService(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      spawner.spawn(command).pipe(Effect.tap((handle) => Ref.set(pid, Option.some(handle.pid))))
    ),
  ));
  return { tool, pid };
});
const assertChildGone = Effect.fnUntraced(function*(pid: Ref.Ref<Option.Option<number>>) {
  const value = yield* Ref.get(pid);
  assert.isTrue(Option.isSome(value));
  const alive = yield* Option.match(value, { onNone: () => Effect.succeed(true), onSome: isAlive });
  assert.isFalse(alive);
});

layer(native, { excludeTestServices: true })("Tool with real Node processes", (it) => {
  it.effect(
    "checks nonzero exit after valid output and accepts explicit native status codes",
    () =>
      Effect.gen(function*() {
        assert.isUndefined(process.versions.bun);
        const tool = yield* Tool.make("node", { executable: process.execPath });
        const command = nodeCommand(
          tool,
          "process.stdout.write('valid'); process.stderr.write('native diagnostic'); process.exitCode=7",
        );
        const error = yield* tool.run(command, tool.text({ maxBytes: 64 })).pipe(Effect.flip);
        assert.instanceOf(error.reason, Tool.Exit);
        assert.strictEqual(error.reason.code, 7);
        assert.include(error.message, "native diagnostic");
        assert.strictEqual(yield* tool.run(command, tool.text({ maxBytes: 64 }), { exitCodes: [0, 7] }), "valid");
      }),
    10_000,
  );

  it.effect(
    "drains megabytes of stdout after an early sink and stderr while waiting for exit",
    () =>
      Effect.gen(function*() {
        const tool = yield* Tool.make("node", { executable: process.execPath });
        const command = nodeCommand(
          tool,
          "process.stdout.write(Buffer.alloc(2000000,65));process.stderr.write(Buffer.alloc(4000000,66))",
        );
        const first = yield* tool.run(command, Sink.take<Uint8Array>(1));
        assert.strictEqual(first.length, 1);
        assert.isTrue((first[0]?.length ?? 0) > 0);
        const complete = yield* tool.run(
          nodeCommand(tool, "process.stdout.write(Buffer.alloc(2000000,65))"),
          tool.text({ maxBytes: 2_000_000 }),
        );
        assert.strictEqual(complete.length, 2_000_000);
      }),
    10_000,
  );

  it.effect("a byte-limit failure closes and reaps the child", () =>
    Effect.gen(function*() {
      const { tool, pid } = yield* trackedTool();
      const command = nodeCommand(tool, "process.stdout.write(Buffer.alloc(5000000));setInterval(()=>{},1000)");
      const error = yield* tool.run(command, tool.text({ maxBytes: 1024 })).pipe(Effect.flip);
      assert.instanceOf(error.reason, Tool.Limit);
      yield* assertChildGone(pid);
    }), 10_000);

  it.effect("stream events precede a terminal failed exit", () =>
    Effect.gen(function*() {
      const tool = yield* Tool.make("node", { executable: process.execPath });
      const seen: Array<string> = [];
      const error = yield* tool.stream(
        nodeCommand(tool, "process.stdout.write('one\\ntwo\\n');process.exitCode=3"),
        tool.lines({ maxLineBytes: 32 }),
      ).pipe(
        Stream.runForEach((line) => Effect.sync(() => seen.push(line))),
        Effect.flip,
      );
      assert.deepStrictEqual(seen, ["one", "two"]);
      assert.instanceOf(error.reason, Tool.Exit);
    }), 10_000);

  it.effect("an early stream consumer and interruption close the process scope", () =>
    Effect.gen(function*() {
      const { tool, pid } = yield* trackedTool();
      const command = nodeCommand(
        tool,
        "process.stdout.write('ready\\n');setInterval(()=>process.stdout.write('tick\\n'),1000)",
      );
      const first = yield* tool.stream(command, tool.lines({ maxLineBytes: 32 })).pipe(
        Stream.take(1),
        Stream.runCollect,
      );
      assert.deepStrictEqual(first, ["ready"]);
      yield* assertChildGone(pid);
      const ready = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        tool.stream(command, tool.lines({ maxLineBytes: 32 })).pipe(
          Stream.runForEach(() => Deferred.succeed(ready, undefined)),
        ),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      yield* assertChildGone(pid);
    }), 10_000);

  it.effect(
    "closing the caller's session scope reaps a child whose stdout was never consumed",
    () =>
      Effect.gen(function*() {
        const { tool, pid } = yield* trackedTool();
        yield* Effect.scoped(Effect.gen(function*() {
          const handle = yield* tool.session(nodeCommand(
            tool,
            // Readiness follows a completed stdout write; stdout itself remains unread.
            "process.stdout.write('unread',()=>require('node:fs').writeSync(3,'ready\\n'));setInterval(()=>{},1000)",
            { stdout: "pipe", stderr: "ignore", additionalFds: { fd3: { type: "output" } } },
          ));
          const marker = yield* handle.getOutputFd(3).pipe(
            tool.lines({ maxLineBytes: 16 }),
            Stream.runHead,
            Effect.timeout("3 seconds"),
          );
          assert.deepStrictEqual(marker, Option.some("ready"));
          assert.isTrue(yield* handle.isRunning);
          assert.isTrue(yield* isAlive(handle.pid));
        }));
        yield* assertChildGone(pid);
      }),
    10_000,
  );

  it.effect("sanitizes real failures and preserves native termination status", () =>
    Effect.gen(function*() {
      const tool = yield* Tool.make("node", { executable: process.execPath });
      const error = yield* tool.run(
        ChildProcess.make("/missing-effect-build-native-fixture", ["PRIVATE_ARG"], { stdin: "ignore" }),
        Sink.drain,
      ).pipe(Effect.flip);
      assert.instanceOf(error.reason, Tool.Process);
      assert.notInclude(JSON.stringify(error), "PRIVATE_ARG");
      assert.include(error.message, "/missing-effect-build-native-fixture");
      const killed = yield* Effect.scoped(Effect.gen(function*() {
        const handle = yield* tool.session(
          nodeCommand(tool, "process.stdout.write('ready');setInterval(()=>{},1000)", { stdout: "pipe" }),
        );
        yield* Stream.runHead(handle.stdout);
        yield* handle.kill({ killSignal: "SIGKILL" });
        return yield* handle.exitCode.pipe(Effect.result);
      }));
      if (process.platform === "win32") {
        assert.strictEqual(killed._tag, "Success");
        if (killed._tag === "Success") assert.strictEqual(killed.success, 1);
      } else {
        assert.strictEqual(killed._tag, "Failure");
        if (killed._tag === "Failure") {
          assert.strictEqual(killed.failure._tag, "PlatformError");
          assert.include(killed.failure.message, "SIGKILL");
          assert.notInclude(Cause.pretty(Cause.fail(killed.failure)), "setInterval");
        }
      }
    }), 10_000);

  it.effect("keeps one persistent writer per input and closes both on finite completion", () =>
    Effect.gen(function*() {
      const tool = yield* Tool.make("node", { executable: process.execPath });
      const script =
        "const net=require('node:net');const audio=new net.Socket({fd:3,readable:true,writable:false});let v=0,a=0,ended=0;const done=()=>{if(++ended===2)process.stdout.write(v+':'+a)};process.stdin.on('data',b=>v+=b.length).on('end',done);audio.on('data',b=>a+=b.length).on('end',done)";
      const result = yield* Effect.scoped(Effect.gen(function*() {
        const handle = yield* tool.session(
          nodeCommand(tool, script, { stdin: "pipe", additionalFds: { fd3: { type: "input" } } }),
        );
        const frames = Stream.fromIterable(Array.from({ length: 10 }, () => new Uint8Array(16_384)));
        const [text, , code] = yield* Effect.all([
          Stream.run(handle.stdout, tool.text({ maxBytes: 64 })),
          Effect.all([Stream.run(frames, handle.stdin), Stream.run(frames, handle.getInputFd(3))], { concurrency: 2 }),
          handle.exitCode,
        ], { concurrency: "unbounded" });
        assert.strictEqual(code, 0);
        return text;
      }));
      assert.strictEqual(result, "163840:163840");
    }), 10_000);

  it.effect("warn-only version probing ignores stdin", () =>
    Effect.gen(function*() {
      const warnings: Array<string> = [];
      const logger = Logger.make((entry) => {
        if (entry.logLevel === "Warn") warnings.push(String(entry.message));
      });
      // The probe prints its version only once stdin ends, which an ignored stdin does at once.
      const tool = yield* Tool.make("node", {
        executable: process.execPath,
        version: {
          args: ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('1.0'))"],
          tested: "1.x",
          isTested: (output) => output === "1.0",
        },
      }).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test observes the one construction's warnings.
        Effect.provide(Logger.layer([logger])),
      );
      assert.strictEqual(tool.executable, process.execPath);
      assert.deepStrictEqual(warnings, []);
    }), 10_000);
});
