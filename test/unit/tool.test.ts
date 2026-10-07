import { assert, describe, it } from "@effect/vitest";
import {
  ByteSize,
  Cause,
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Logger,
  Option,
  Path,
  PlatformError,
  Redacted,
  Ref,
  Schema,
  Sink,
  Stream,
  Tracer,
} from "effect";
import * as Environment from "effect-build/Environment";
import { ToolTest } from "effect-build/testing";
import * as Tool from "effect-build/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { TestClock } from "effect/testing";

const bytes = (text: string) => new TextEncoder().encode(text);
const command = ChildProcess.make("fixture", ["credential"], { env: { TOKEN: "env-credential" } });
const platformFailure = () =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: "fixture credential",
    syscall: "spawn fixture credential",
    description: "env-credential",
    cause: Object.assign(new Error("EPIPE credential env-credential"), { spawnargs: ["credential"] }),
  });
const makeFake = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Tool.make("fixture", { executable: "fixture" }).pipe(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
    Effect.provide(Layer.mergeAll(ToolTest.layer(() => Effect.succeed(handle)), FileSystem.layerNoop({}), Path.layer)),
  );
const fileInfo = (type: FileSystem.File.Type, mode: number): FileSystem.File.Info => ({
  type,
  mode,
  dev: 0,
  size: ByteSize.bytes(0),
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  ino: Option.none(),
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  blksize: Option.none(),
  blocks: Option.none(),
});

describe("checked native runs", () => {
  it.effect("requires both output completion and an accepted exit", () =>
    Effect.gen(function*() {
      const complete = yield* Deferred.make<void>();
      const handle = ToolTest.handle({
        stdout: Stream.concat(
          Stream.succeed(bytes("first")),
          Stream.fromEffect(Deferred.await(complete).pipe(Effect.as(bytes("last")))),
        ),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(7)),
      });
      const tool = yield* makeFake(handle);
      const fiber = yield* Effect.forkChild(tool.run(command, tool.text({ maxBytes: 64 })).pipe(Effect.flip));
      yield* Effect.yieldNow;
      assert.isUndefined(fiber.pollUnsafe());
      yield* Deferred.succeed(complete, undefined);
      const error = yield* Fiber.join(fiber);
      assert.instanceOf(error.reason, Tool.Exit);
      const accepted = yield* tool.run(command, tool.text({ maxBytes: 64 }), { exitCodes: [0, 7] });
      assert.strictEqual(accepted, "firstlast");
    }));

  it.effect("an early sink drains once and preserves a late read failure", () =>
    Effect.gen(function*() {
      const acquired = yield* Ref.make(0);
      const stdout = Stream.unwrap(
        Effect.acquireRelease(Ref.update(acquired, (n) => n + 1), () => Effect.void).pipe(
          Effect.as(Stream.concat(Stream.make(bytes("one"), bytes("two")), Stream.fail(platformFailure()))),
        ),
      );
      const tool = yield* makeFake(ToolTest.handle({ stdout }));
      const error = yield* tool.run(command, Sink.take<Uint8Array>(1)).pipe(Effect.flip);
      assert.instanceOf(error.reason, Tool.Process);
      assert.strictEqual(yield* Ref.get(acquired), 1);
      assert.notInclude(JSON.stringify(error), "credential");
    }));

  it.effect("redacts overlapping UTF-8 values across chunks before trimming the tail", () =>
    Effect.gen(function*() {
      const input = bytes("diagnostic token=€SECRET-1\n");
      const stderr = Stream.fromIterable(Array.from(input, (byte) => Uint8Array.of(byte)));
      const tool = yield* makeFake(
        ToolTest.handle({ stderr, exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(3)) }),
      );
      const error = yield* tool.run(command, Sink.drain, {
        redact: [Redacted.make("€SECRET"), Redacted.make("€SECRET-1"), Redacted.make("")],
        stderrTailBytes: 9,
      }).pipe(Effect.flip);
      assert.instanceOf(error.reason, Tool.Exit);
      assert.strictEqual(error.reason.stderr, "edacted>\n");
      assert.notInclude(JSON.stringify(error), "SECRET");
    }));

  it.effect("keeps the newest bytes when chunks wrap or exceed the tail", () =>
    Effect.gen(function*() {
      const failing = Effect.fnUntraced(function*(stderr: Stream.Stream<Uint8Array>) {
        const tool = yield* makeFake(
          ToolTest.handle({ stderr, exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)) }),
        );
        return yield* tool.run(command, Sink.drain, { stderrTailBytes: 6 }).pipe(Effect.flip);
      });
      const wrapped = yield* failing(Stream.make(bytes("abcd"), bytes("efgh"), bytes("ij")));
      assert.strictEqual(wrapped.reason._tag === "Exit" ? wrapped.reason.stderr : "", "efghij");
      const oversized = yield* failing(Stream.make(bytes("ab"), bytes("0123456789")));
      assert.strictEqual(oversized.reason._tag === "Exit" ? oversized.reason.stderr : "", "456789");
      const empty = yield* failing(Stream.empty);
      assert.strictEqual(empty.message, "fixture exited with code 1");
    }));

  it.effect("drains accessible extra output pipes", () =>
    Effect.gen(function*() {
      const drained = yield* Deferred.make<void>();
      const tool = yield* makeFake(ToolTest.handle({
        outputFds: { 3: Stream.fromEffect(Deferred.succeed(drained, undefined).pipe(Effect.as(bytes("diagnostics")))) },
        exitCode: Deferred.await(drained).pipe(Effect.as(ChildProcessSpawner.ExitCode(0))),
      }));
      const result = yield* tool.run(
        ChildProcess.make("fixture", [], { additionalFds: { fd3: { type: "output" } } }),
        Sink.drain,
      );
      assert.isUndefined(result);
    }));

  it.effect("preserves caller errors and foreign defects", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle({ stdout: "output" }));
      const callerError = { _tag: "CallerError", detail: "caller" };
      assert.strictEqual(yield* tool.run(command, Sink.fail(callerError)).pipe(Effect.flip), callerError);
      const defect = new Error("foreign defect");
      const result = yield* tool.run(command, Sink.fromEffect(Effect.die(defect))).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(result));
      assert.isTrue(Exit.isFailure(result) && Cause.hasDies(result.cause));
    }));
});

describe("lazy checked streams", () => {
  it.effect("defers spawn, lends one reader, drains an early transform and checks exit", () =>
    Effect.gen(function*() {
      const acquired = yield* Ref.make(0);
      const drained = yield* Ref.make(false);
      const source = Stream.unwrap(
        Effect.acquireRelease(Ref.update(acquired, (n) => n + 1), () => Effect.void).pipe(Effect.as(
          Stream.make(bytes("first"), bytes("second"), bytes("third")).pipe(Stream.ensuring(Ref.set(drained, true))),
        )),
      );
      const tool = yield* makeFake(
        ToolTest.handle({ stdout: source, exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(2)) }),
      );
      const seen: Array<string> = [];
      const stream = tool.stream(command, (stdout) =>
        stdout.pipe(Stream.take(1), Stream.map((chunk) => new TextDecoder().decode(chunk))));
      assert.strictEqual(yield* Ref.get(acquired), 0);
      const error = yield* stream.pipe(
        Stream.runForEach((value) =>
          Effect.sync(() => seen.push(value))
        ),
        Effect.flip,
      );
      assert.deepStrictEqual(seen, ["first"]);
      assert.instanceOf(error.reason, Tool.Exit);
      assert.strictEqual(yield* Ref.get(acquired), 1);
      assert.isTrue(yield* Ref.get(drained));
    }));

  it.effect("a stderr failure interrupts blocked stdout", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle({ stdout: Stream.never, stderr: Stream.fail(platformFailure()) }));
      const error = yield* tool.stream(command, (stdout) => stdout).pipe(Stream.runDrain, Effect.flip);
      assert.instanceOf(error.reason, Tool.Process);
    }));

  it.effect("does not end at stdout EOF while exit remains pending", () =>
    Effect.gen(function*() {
      const exited = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
      const tool = yield* makeFake(ToolTest.handle({ stdout: "event", exitCode: Deferred.await(exited) }));
      const fiber = yield* Effect.forkChild(Stream.runCollect(tool.stream(command, (stdout) => stdout)));
      yield* Effect.yieldNow;
      assert.isUndefined(fiber.pollUnsafe());
      yield* Deferred.succeed(exited, ChildProcessSpawner.ExitCode(0));
      assert.strictEqual((yield* Fiber.join(fiber)).length, 1);
    }));
});

it.effect("checked run and stream observe a stderr failure after raw exit", () =>
  Effect.gen(function*() {
    for (const mode of ["run", "stream"] as const) {
      const stdoutEnded = yield* Deferred.make<void>();
      const stderrStarted = yield* Deferred.make<void>();
      const failStderr = yield* Deferred.make<void>();
      const rawExit = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
      const exitObserved = yield* Deferred.make<void>();
      const released = yield* Ref.make(0);
      const handle = ToolTest.handle({
        stdout: Stream.succeed(bytes("event")).pipe(Stream.onEnd(Deferred.succeed(stdoutEnded, undefined))),
        stderr: Stream.fromEffect(
          Deferred.succeed(stderrStarted, undefined).pipe(
            Effect.andThen(Deferred.await(failStderr)),
            Effect.andThen(Effect.fail(platformFailure())),
          ),
        ),
        exitCode: Deferred.await(rawExit).pipe(Effect.tap(() => Deferred.succeed(exitObserved, undefined))),
      });
      const spawner = ChildProcessSpawner.make(() =>
        Effect.acquireRelease(Effect.succeed(handle), () => Ref.update(released, (count) => count + 1))
      );
      const tool = yield* Tool.make("fixture", { executable: "fixture" }).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test constructs the complete fake platform once, including its process scope.
        Effect.provide(Layer.mergeAll(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
          FileSystem.layerNoop({}),
          Path.layer,
        )),
      );
      const operation = mode === "run"
        ? tool.run(command, Sink.drain)
        : tool.stream(command, (stdout) => stdout).pipe(Stream.runDrain);
      const fiber = yield* Effect.forkChild(operation.pipe(Effect.flip));
      yield* Deferred.await(stderrStarted);
      yield* Deferred.await(stdoutEnded);
      yield* Deferred.succeed(rawExit, ChildProcessSpawner.ExitCode(0));
      yield* Deferred.await(exitObserved);
      yield* Effect.yieldNow;
      assert.isUndefined(fiber.pollUnsafe());
      assert.strictEqual(yield* Ref.get(released), 0);
      yield* Deferred.succeed(failStderr, undefined);
      const error = yield* Fiber.join(fiber);
      assert.instanceOf(error.reason, Tool.Process);
      assert.notInclude(JSON.stringify(error), "credential");
      assert.strictEqual(yield* Ref.get(released), 1);
    }
  }));

describe("bounded output decoding", () => {
  it.effect("flushes incomplete UTF-8, splits CRLF, and retains final lines", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle());
      const text = yield* Stream.make(Uint8Array.of(0xe2), Uint8Array.of(0x82, 0xac, 0xe2)).pipe(
        Stream.run(tool.text({ maxBytes: 4 })),
      );
      assert.strictEqual(text, "€�");
      const lines = yield* Stream.make(bytes("one\r"), bytes("\n\nlast"), Uint8Array.of(0xe2)).pipe(
        tool.lines({ maxLineBytes: 8 }),
        Stream.runCollect,
      );
      assert.deepStrictEqual(lines, ["one", "", "last�"]);
    }));

  it.effect("enforces output and partial-line byte bounds", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle());
      const output = yield* Stream.succeed(bytes("€€")).pipe(Stream.run(tool.text({ maxBytes: 5 })), Effect.flip);
      assert.deepStrictEqual({
        tag: output.reason._tag,
        unit: output.reason._tag === "Limit" ? output.reason.unit : "",
      }, { tag: "Limit", unit: "output" });
      const line = yield* Stream.make(bytes("123"), bytes("45")).pipe(
        tool.lines({ maxLineBytes: 4 }),
        Stream.runDrain,
        Effect.flip,
      );
      assert.instanceOf(line.reason, Tool.Limit);
      const trailing = yield* Stream.succeed(bytes("1234\r")).pipe(
        tool.lines({ maxLineBytes: 4 }),
        Stream.runDrain,
        Effect.flip,
      );
      assert.instanceOf(trailing.reason, Tool.Limit);
    }));

  it.effect("rejects invalid bounds even for an empty source", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle());
      const result = yield* Stream.empty.pipe(Stream.run(tool.text({ maxBytes: Number.NaN })), Effect.exit);
      assert.isTrue(Exit.isFailure(result) && Cause.hasDies(result.cause));
      const lines = yield* Stream.empty.pipe(tool.lines({ maxLineBytes: -1 }), Stream.runDrain, Effect.exit);
      assert.isTrue(Exit.isFailure(lines) && Cause.hasDies(lines.cause));
    }));

  it.effect("describes declared paths and expectations without output values or output-derived keys", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle());
      const marker = "STDOUT_PRIVATE_MARKER";
      const Status = Schema.Struct({
        id: Schema.String,
        status: Schema.Literals(["Accepted", "Invalid"]),
        logs: Schema.Record(Schema.String, Schema.Finite),
      });
      const errors = yield* Effect.all([
        tool.decode(Status)({ id: "x", status: marker, logs: {} }).pipe(Effect.flip),
        tool.decode(Status)({ status: "Accepted", logs: { [marker]: marker } }).pipe(Effect.flip),
        tool.decode(Schema.String.check(Schema.makeFilter((input) => `invalid ${input}`)))(marker).pipe(Effect.flip),
        tool.decode(Schema.fromJsonString(Status))(`{"${marker}`).pipe(Effect.flip),
      ]);
      const details = errors.map((error) => error.reason._tag === "Output" ? error.reason.detail : "");
      assert.deepStrictEqual(details, [
        `Expected "Accepted" | "Invalid" at status`,
        "Missing key at id",
        "Expected <filter>",
        "Expected a valid JSON string",
      ]);
      const record = yield* tool.decode(Status)({ id: "x", status: "Accepted", logs: { [marker]: marker } }).pipe(
        Effect.flip,
      );
      assert.strictEqual(record.message, "fixture produced output that did not decode: Expected number at logs.<key>");
      for (const error of [...errors, record]) {
        assert.instanceOf(error.reason, Tool.Output);
        assert.notInclude(JSON.stringify(error), marker);
        assert.notInclude(Cause.pretty(Cause.fail(error.reason)), marker);
      }
    }));

  it.effect("drops a leading byte order mark from text and the first line only", () =>
    Effect.gen(function*() {
      const tool = yield* makeFake(ToolTest.handle());
      const bom = Uint8Array.of(0xef, 0xbb, 0xbf);
      assert.strictEqual(yield* Stream.make(bom, bytes("{}")).pipe(Stream.run(tool.text({ maxBytes: 8 }))), "{}");
      const lines = yield* Stream.make(bom, bytes("one\n"), bom, bytes("two")).pipe(
        tool.lines({ maxLineBytes: 8 }),
        Stream.runCollect,
      );
      assert.deepStrictEqual(lines, ["one", "\uFEFFtwo"]);
    }));
});

describe("construction", () => {
  it.effect("uses an explicit executable exactly and captures the chosen spawner", () =>
    Effect.gen(function*() {
      const tool = yield* Tool.make("fixture", { executable: "./chosen" }).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
        Effect.provide(Layer.mergeAll(
          ToolTest.layer(() => Effect.succeed(ToolTest.handle({ stdout: "captured" }))),
          FileSystem.layerNoop({ stat: () => Effect.die(new Error("unexpected lookup")) }),
          Path.layer,
        )),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
      );
      assert.strictEqual(tool.executable, "./chosen");
      assert.strictEqual(yield* tool.run(command, tool.text({ maxBytes: 16 })), "captured");
    }));

  it.effect("walks PATH in order once, skips directories and non-executables", () =>
    Effect.gen(function*() {
      const visited: Array<string> = [];
      const tool = yield* Tool.make("fixture").pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
        Effect.provide(Layer.mergeAll(
          ToolTest.layer(() => Effect.succeed(ToolTest.handle())),
          Path.layer,
          FileSystem.layerNoop({
            stat: (file) =>
              Effect.sync(() => {
                visited.push(file);
                return fileInfo(
                  file.startsWith("/directory/") ? "Directory" : "File",
                  file.startsWith("/readonly/") ? 0o644 : 0o755,
                );
              }),
          }),
        )),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ PATH: "/directory:/readonly:/chosen:/later" }),
        ),
      );
      assert.strictEqual(tool.executable, "/chosen/fixture");
      yield* tool.run(ChildProcess.make(tool.executable), Sink.drain);
      assert.deepStrictEqual(visited, ["/directory/fixture", "/readonly/fixture", "/chosen/fixture"]);
    }));

  it.effect("reports NotFound after one complete walk", () =>
    Effect.gen(function*() {
      const error = yield* Tool.make("absent").pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
        Effect.provide(Layer.mergeAll(
          ToolTest.layer(() => Effect.succeed(ToolTest.handle())),
          FileSystem.layerNoop({}),
          Path.layer,
        )),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: "/missing" })),
        Effect.flip,
      );
      assert.strictEqual(error._tag, "ToolError");
      assert.strictEqual(error._tag === "ToolError" ? error.reason._tag : "", "NotFound");
    }));

  it.effect("on Windows, selects only executables and skips script shims", () =>
    Effect.gen(function*() {
      const visited: Array<string> = [];
      const present = new Set(["/shims/fixture", "/shims/fixture.cmd", "/bin/fixture.exe"]);
      const windowsPath = Effect.map(Path.Path, (path) => ({ ...path, sep: "\\" as const }));
      const tool = yield* Tool.make("fixture").pipe(
        Effect.provideServiceEffect(Path.Path, windowsPath),
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
        Effect.provide(Layer.mergeAll(
          ToolTest.layer(() => Effect.succeed(ToolTest.handle())),
          Path.layer,
          FileSystem.layerNoop({
            stat: (file) =>
              Effect.sync(() => visited.push(file)).pipe(
                Effect.flatMap(() =>
                  present.has(file)
                    ? Effect.succeed(fileInfo("File", 0o644))
                    : Effect.fail(PlatformError.systemError({
                      _tag: "NotFound",
                      module: "FileSystem",
                      method: "stat",
                      pathOrDescriptor: file,
                    }))
                ),
              ),
          }),
        )),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ Path: "/shims;/bin" })),
      );
      assert.strictEqual(tool.executable, "/bin/fixture.exe");
      assert.deepStrictEqual(visited, ["/shims/fixture.exe", "/bin/fixture.exe"]);
    }));

  it.effect("applies mapCommand to every command, including the version probe", () =>
    Effect.gen(function*() {
      const spawned: Array<ChildProcess.Command> = [];
      const tool = yield* Tool.make("fixture", {
        executable: "fixture",
        version: { args: ["--version"], tested: "1.x", isTested: () => true },
        mapCommand: Environment.scrub({ ONLY: "allowed" }),
      }).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
        Effect.provide(Layer.mergeAll(
          ToolTest.layer((request) => Effect.sync(() => spawned.push(request)).pipe(Effect.as(ToolTest.handle()))),
          FileSystem.layerNoop({}),
          Path.layer,
        )),
      );
      yield* tool.run(command, Sink.drain);
      yield* Stream.runDrain(tool.stream(command, (stdout) => stdout));
      yield* Effect.scoped(tool.session(command));
      assert.strictEqual(spawned.length, 4);
      for (const request of spawned) {
        assert.strictEqual(request._tag, "StandardCommand");
        if (request._tag === "StandardCommand") {
          assert.deepStrictEqual(request.options.env, { ONLY: "allowed" });
          assert.strictEqual(request.options.extendEnv, false);
        }
      }
    }));

  it.effect("releases a timed-out probe at ten seconds, warns safely once, and returns the tool", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>();
      const released = yield* Ref.make(0);
      const warnings: Array<string> = [];
      const logger = Logger.make((entry) => {
        if (entry.logLevel === "Warn") warnings.push(String(entry.message));
      });
      const spawn = (request: ChildProcess.Command) =>
        Effect.acquireRelease(
          Effect.gen(function*() {
            assert.strictEqual(request._tag === "StandardCommand" ? request.options.stdin : "", "ignore");
            yield* Deferred.succeed(started, undefined);
            return ToolTest.handle({
              stdout: "PRIVATE_VERSION_OUTPUT",
              stderr: "PRIVATE_VERSION_DIAGNOSTIC",
              exitCode: Effect.never,
            });
          }),
          () => Ref.update(released, (count) => count + 1),
        );
      const fiber = yield* Effect.forkChild(
        Tool.make("fixture", {
          executable: "fixture",
          version: { args: ["--version"], tested: "1.x", isTested: () => true },
        }).pipe(
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawn)),
              FileSystem.layerNoop({}),
              Path.layer,
              Logger.layer([logger]),
            ),
          ),
        ),
      );
      yield* Deferred.await(started);
      yield* TestClock.adjust("9999 millis");
      assert.isUndefined(fiber.pollUnsafe());
      assert.strictEqual(yield* Ref.get(released), 0);
      assert.deepStrictEqual(warnings, []);
      yield* TestClock.adjust("1 millis");
      const tool = yield* Fiber.join(fiber);
      assert.strictEqual(tool.name, "fixture");
      assert.strictEqual(yield* Ref.get(released), 1);
      assert.deepStrictEqual(warnings, ["fixture version probe timed out after 10 seconds; tested range is 1.x"]);
    }));

  it.effect("probes once when selected, warns only when needed, and logs no raw output", () =>
    Effect.gen(function*() {
      const modes = ["absent", "tested", "untested", "versioned", "failed"] as const;
      const expected = {
        absent: [],
        tested: [],
        untested: ["fixture is outside the tested range 1.x"],
        versioned: ["fixture is outside the tested range 1.x (found 9.8.7)"],
        failed: ["fixture version probe exited with code 1; tested range is 1.x"],
      };
      for (const mode of modes) {
        const probes: Array<ChildProcess.Command> = [];
        const warnings: Array<string> = [];
        const logger = Logger.make((entry) => {
          if (entry.logLevel === "Warn") warnings.push(String(entry.message));
        });
        const options: Tool.Options = {
          executable: "fixture",
          version: mode === "absent"
            ? undefined
            : { args: ["--version"], tested: "1.x", isTested: () => mode === "tested" },
        };
        const tool = yield* Tool.make("fixture", options).pipe(
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test provides its complete fake platform once.
          Effect.provide(Layer.mergeAll(
            ToolTest.layer((request) =>
              Effect.sync(() => {
                probes.push(request);
                return ToolTest.handle({
                  stdout: mode === "versioned" ? "PRIVATE_VERSION_OUTPUT 9.8.7" : "PRIVATE_VERSION_OUTPUT",
                  stderr: "PRIVATE_VERSION_DIAGNOSTIC",
                  exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(mode === "failed" ? 1 : 0)),
                });
              })
            ),
            FileSystem.layerNoop({}),
            Path.layer,
            Logger.layer([logger]),
          )),
        );
        assert.strictEqual(tool.executable, "fixture");
        assert.strictEqual(probes.length, mode === "absent" ? 0 : 1);
        assert.deepStrictEqual(warnings, expected[mode]);
      }
    }));
});

it.effect("run spans retain safe failure facts without argument or output attributes", () =>
  Effect.gen(function*() {
    const spans: Array<Tracer.NativeSpan> = [];
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const tool = yield* makeFake(
      ToolTest.handle({ stdout: "PRIVATE_STDOUT", exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)) }),
    );
    yield* tool.run(command, tool.text({ maxBytes: 32 })).pipe(Effect.withTracer(tracer), Effect.flip);
    assert.deepStrictEqual(spans.map((span) => span.name), ["Tool.run"]);
    for (const span of spans) {
      assert.strictEqual(span.status._tag, "Ended");
      assert.notInclude(JSON.stringify(Array.from(span.attributes)), "credential");
      assert.notInclude(JSON.stringify(Array.from(span.attributes)), "PRIVATE_STDOUT");
      const status = span.status;
      assert.isTrue(status._tag === "Ended" && Exit.isFailure(status.exit));
      if (status._tag === "Ended" && Exit.isFailure(status.exit)) {
        assert.notInclude(Cause.pretty(status.exit.cause), "credential");
        assert.notInclude(Cause.pretty(status.exit.cause), "PRIVATE_STDOUT");
      }
    }
  }));

it.effect("native tracing covers stream consumption and the caller's session scope", () =>
  Effect.gen(function*() {
    const spans: Array<Tracer.NativeSpan> = [];
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const started = yield* Deferred.make<void>();
    const exited = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
    const tool = yield* makeFake(ToolTest.handle({
      stdout: Stream.fromEffect(Deferred.succeed(started, undefined).pipe(Effect.as(bytes("event")))),
      exitCode: Deferred.await(exited),
    }));
    const session = Effect.fnUntraced(function*(request: ChildProcess.Command) {
      return yield* tool.session(request);
    }, Effect.withSpanScoped("Binding.session"));
    yield* Effect.scoped(Effect.gen(function*() {
      yield* session(command);
      assert.strictEqual(spans.find((span) => span.name === "Binding.session")?.status._tag, "Started");
    })).pipe(Effect.withTracer(tracer));
    assert.strictEqual(spans.find((span) => span.name === "Binding.session")?.status._tag, "Ended");
    const events = tool.stream(command, (stdout) => stdout).pipe(Stream.withSpan("Binding.events"));
    assert.strictEqual(spans.filter((span) => span.name === "Binding.events").length, 0);
    const fiber = yield* Effect.forkChild(Stream.runDrain(events).pipe(Effect.withTracer(tracer)));
    yield* Deferred.await(started);
    assert.strictEqual(spans.find((span) => span.name === "Binding.events")?.status._tag, "Started");
    yield* Deferred.succeed(exited, ChildProcessSpawner.ExitCode(0));
    yield* Fiber.join(fiber);
    assert.strictEqual(spans.find((span) => span.name === "Binding.events")?.status._tag, "Ended");
  }));

it.effect("sanitizes every native handle failure, including Deno syscall and reref", () =>
  Effect.gen(function*() {
    const bad = platformFailure();
    const failed = Effect.fail(bad);
    const native = ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(1),
      exitCode: failed,
      isRunning: failed,
      kill: () => failed,
      stdin: Sink.fail(bad),
      stdout: Stream.fail(bad),
      stderr: Stream.fail(bad),
      all: Stream.fail(bad),
      getInputFd: () => Sink.fail(bad),
      getOutputFd: () => Stream.fail(bad),
      unref: Effect.succeed(failed),
    });
    const tool = yield* makeFake(native);
    const handle = yield* tool.session(command);
    const failures = yield* Effect.all([
      handle.exitCode.pipe(Effect.flip),
      handle.isRunning.pipe(Effect.flip),
      handle.kill().pipe(Effect.flip),
      Stream.empty.pipe(Stream.run(handle.stdin), Effect.flip),
      Stream.runDrain(handle.stdout).pipe(Effect.flip),
      Stream.runDrain(handle.stderr).pipe(Effect.flip),
      Stream.runDrain(handle.all).pipe(Effect.flip),
      Stream.empty.pipe(Stream.run(handle.getInputFd(3)), Effect.flip),
      Stream.runDrain(handle.getOutputFd(4)).pipe(Effect.flip),
      Effect.flatten(handle.unref).pipe(Effect.flip),
    ]);
    for (const error of failures) {
      assert.strictEqual(error._tag, "PlatformError");
      assert.notInclude(JSON.stringify(error), "credential");
      assert.notInclude(Cause.pretty(Cause.fail(error)), "credential");
      assert.isFalse("cause" in error);
    }
  }));

it.effect("removes argument tokens from spawn failures without rewriting the executable path", () =>
  Effect.gen(function*() {
    const executable = "/usr/local/bin/missing-ffprobe";
    const spawnFailure = PlatformError.systemError({
      _tag: "NotFound",
      module: "ChildProcess",
      method: "spawn",
      pathOrDescriptor: `${executable} -v error --token=SECRET in .`,
      cause: new Error(`spawn ${executable} ENOENT (--token=SECRET in .)`),
    });
    const tool = yield* Tool.make("ffprobe", { executable }).pipe(
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test construction provides its complete fake platform once.
      Effect.provide(
        Layer.mergeAll(ToolTest.layer(() => Effect.fail(spawnFailure)), FileSystem.layerNoop({}), Path.layer),
      ),
    );
    const error = yield* tool.run(
      ChildProcess.make(executable, ["-v", "error", "--token=SECRET", "in", "."]),
      Sink.drain,
    ).pipe(Effect.flip);
    assert.instanceOf(error.reason, Tool.Process);
    assert.include(error.message, `spawn ${executable} ENOENT (<redacted> <redacted> <redacted>)`);
    assert.notInclude(JSON.stringify(error), "SECRET");
  }));
