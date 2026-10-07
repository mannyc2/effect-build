/** Resolved native tools with checked runs, streams and caller-owned sessions. */
import { Cause, Config, Effect, Fiber, FileSystem, Path, Schema, Sink, Stream } from "effect";
import type { PlatformError, Redacted, Scope } from "effect";
import { identity } from "effect/Function";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { describeIssue } from "./internal/Output.js";
import { checkBound, commandOutputFds, sanitize } from "./internal/Process.js";
import { stderrTail } from "./internal/Stderr.js";

/** No runnable executable was found on PATH. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  executable: Schema.String,
}) {
  override get message(): string {
    return "was not found on PATH";
  }
}

/** The process could not start, or reading, writing or waiting on it failed. */
export class Process extends Schema.TaggedError<Process>()("Process", {
  /** The platform error's message without argv, such as `NotFound: ChildProcess.spawn (ffprobe): spawn ffprobe ENOENT`. */
  detail: Schema.String,
  /** The platform's PlatformError, rebuilt without argv or environment values. */
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `process failed: ${this.detail}`;
  }
}

/** The process exited with a code the command does not accept. */
export class Exit extends Schema.TaggedError<Exit>()("Exit", {
  code: Schema.Int,
  // Bounded tail of piped stderr, with the command's redacted values removed.
  stderr: Schema.String,
}) {
  override get message(): string {
    return this.stderr === "" ? `exited with code ${this.code}` : `exited with code ${this.code}: ${this.stderr}`;
  }
}

/** The tool's output did not decode. */
export class Output extends Schema.TaggedError<Output>()("Output", {
  /** Schema paths and expectations, such as `Expected string at status`, without output values or output-derived keys. */
  detail: Schema.String,
}) {
  override get message(): string {
    return `produced output that did not decode: ${this.detail}`;
  }
}

/** The tool's output, or one line of it, exceeded a declared bound. */
export class Limit extends Schema.TaggedError<Limit>()("Limit", {
  unit: Schema.Literals(["output", "line"]),
  maxBytes: Schema.Int,
}) {
  override get message(): string {
    return `${this.unit === "line" ? "an output line" : "output"} exceeded ${this.maxBytes} bytes`;
  }
}

export class ToolError extends Schema.TaggedError<ToolError>()("ToolError", {
  tool: Schema.String,
  reason: Schema.Union([NotFound, Process, Exit, Output, Limit]),
}) {
  override get message(): string {
    return `${this.tool} ${this.reason.message}`;
  }
}

export interface RunOptions {
  /** Exit codes that count as success. Default `[0]`. */
  readonly exitCodes?: ReadonlyArray<number> | undefined;
  /** Values the command reveals into argv or env; removed from the stderr tail. */
  readonly redact?: ReadonlyArray<Redacted.Redacted<string>> | undefined;
  /** Bytes of piped stderr kept for the Exit reason. Default 8 KiB. */
  readonly stderrTailBytes?: number | undefined;
}

/** A resolved tool. Its functions capture the spawner, so they require no service. */
export interface Tool {
  readonly name: string;
  readonly executable: string;
  /**
   * Spawns `command`, reads stdout through `output` and then drains the rest,
   * drains piped stderr into a bounded tail, and checks the exit code. A
   * process exit never cancels unread output.
   */
  readonly run: <A, E = never>(
    command: ChildProcess.Command,
    output: Sink.Sink<A, Uint8Array, Uint8Array, E>,
    options?: RunOptions,
  ) => Effect.Effect<A, ToolError | E>;
  /**
   * Spawns `command` when the stream is consumed. Emits `events(stdout)`, then
   * drains the rest of stdout and checks the exit code before it ends.
   */
  readonly stream: <A, E = never>(
    command: ChildProcess.Command,
    events: (stdout: Stream.Stream<Uint8Array, ToolError>) => Stream.Stream<A, E>,
    options?: RunOptions,
  ) => Stream.Stream<A, ToolError | E>;
  /**
   * Spawns `command` in the caller's Scope and returns the platform's handle
   * type. Its PlatformErrors are rebuilt without argv; the platform's own
   * errors embed the whole command line.
   */
  readonly session: (
    command: ChildProcess.Command,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, ToolError, Scope.Scope>;
  /** Collects UTF-8 text, failing with Limit past `maxBytes`. */
  readonly text: (options: { readonly maxBytes: number }) => Sink.Sink<string, Uint8Array, Uint8Array, ToolError>;
  /** Splits UTF-8 lines (LF or CRLF), flushing a final unterminated line; Limit past `maxLineBytes`. */
  readonly lines: (
    options: { readonly maxLineBytes: number },
  ) => <E, R>(self: Stream.Stream<Uint8Array, E, R>) => Stream.Stream<string, E | ToolError, R>;
  /** Decodes tool output, failing with Output. */
  readonly decode: <S extends Schema.Decoder<unknown, unknown>>(
    schema: S,
  ) => (input: unknown) => Effect.Effect<S["Type"], ToolError, S["DecodingServices"]>;
}

export interface VersionCheck {
  /** Arguments that print the version, such as `["--version"]`. Run with stdin ignored and a 10-second deadline. */
  readonly args: ReadonlyArray<string>;
  /** The tested range, for the warning. */
  readonly tested: string;
  readonly isTested: (output: string) => boolean;
}

export interface Options {
  /** Used exactly as given; skips the PATH search. */
  readonly executable?: string | undefined;
  /** Probe once here; log one warning outside the tested range, or if the probe fails or times out. Never fails. */
  readonly version?: VersionCheck | undefined;
  /**
   * Applied to every command this tool runs, including the version probe, after it is rendered. Use it for native
   * options a binding does not expose, such as `killSignal`, or for `Environment.scrub`, which replaces the whole
   * environment, including values a binding adds.
   */
  readonly mapCommand?: ((command: ChildProcess.Command) => ChildProcess.Command) | undefined;
}

const findOnPath = Effect.fnUntraced(function*(name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const windows = path.sep === "\\";
  const value = yield* Config.String("PATH").pipe(Config.orElse(() => Config.String("Path")));
  // Windows launches only executables without a shell; batch and script shims need an explicit command.
  const names = windows ? [name.toLowerCase().endsWith(".exe") ? name : `${name}.exe`] : [name];
  const candidates = value.split(windows ? ";" : ":").filter((directory) => directory.length > 0)
    .flatMap((directory) => names.map((file) => path.resolve(directory, file)));
  const found = yield* Effect.findFirst(candidates, (candidate) =>
    fs.stat(candidate).pipe(
      Effect.map((info) => info.type === "File" && (windows || (info.mode & 0o111) !== 0)),
      Effect.orElseSucceed(() => false),
    ));
  return yield* Effect.fromOption(found).pipe(
    Effect.mapError(() => ToolError.make({ tool: name, reason: NotFound.make({ executable: name }) })),
  );
});

const makeTool = (
  name: string,
  executable: string,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  mapCommand: (command: ChildProcess.Command) => ChildProcess.Command,
): Tool => {
  const processError = (cause: PlatformError.PlatformError) =>
    ToolError.make({ tool: name, reason: Process.make({ detail: cause.message, cause }) });
  const limit = (unit: "output" | "line", maxBytes: number) =>
    ToolError.make({ tool: name, reason: Limit.make({ unit, maxBytes }) });

  const session = Effect.fnUntraced(function*(command: ChildProcess.Command) {
    const scrub = sanitize(command);
    const handle = yield* spawner.spawn(command).pipe(Effect.mapError(scrub), Effect.mapError(processError));
    return ChildProcessSpawner.makeHandle({
      pid: handle.pid,
      exitCode: Effect.mapError(handle.exitCode, scrub),
      isRunning: Effect.mapError(handle.isRunning, scrub),
      kill: (options) => Effect.mapError(handle.kill(options), scrub),
      stdin: Sink.mapError(handle.stdin, scrub),
      stdout: Stream.mapError(handle.stdout, scrub),
      stderr: Stream.mapError(handle.stderr, scrub),
      all: Stream.mapError(handle.all, scrub),
      getInputFd: (fd) => Sink.mapError(handle.getInputFd(fd), scrub),
      getOutputFd: (fd) => Stream.mapError(handle.getOutputFd(fd), scrub),
      unref: Effect.mapError(handle.unref, scrub).pipe(Effect.map((reref) => Effect.mapError(reref, scrub))),
    });
  });

  const checkExit = Effect.fnUntraced(function*(code: number, stderr: string, options?: RunOptions) {
    if (!(options?.exitCodes ?? [0]).includes(code)) {
      return yield* ToolError.make({ tool: name, reason: Exit.make({ code, stderr }) });
    }
  });

  const outputs = Effect.fnUntraced(
    function*(command: ChildProcess.Command, handle: ChildProcessSpawner.ChildProcessHandle, options?: RunOptions) {
      const [tail] = yield* Effect.all([
        stderrTail(
          Stream.mapError(handle.stderr, processError),
          options?.stderrTailBytes ?? 8192,
          options?.redact ?? [],
        ),
        Effect.forEach(
          commandOutputFds(command),
          (fd) => Stream.runDrain(Stream.mapError(handle.getOutputFd(fd), processError)),
          { concurrency: "unbounded", discard: true },
        ),
      ], { concurrency: "unbounded" });
      return tail;
    },
  );

  const run: Tool["run"] = Effect.fn("Tool.run")(
    function*<A, E>(
      command: ChildProcess.Command,
      output: Sink.Sink<A, Uint8Array, Uint8Array, E>,
      options?: RunOptions,
    ) {
      yield* checkBound(options?.stderrTailBytes ?? 8192, "stderrTailBytes");
      const mapped = mapCommand(command);
      const handle = yield* session(mapped);
      const [value, tail, code] = yield* Effect.all([
        Stream.run(
          Stream.mapError(handle.stdout, processError),
          Sink.flatMap(output, (value) => Sink.as(Sink.drain, value)),
        ),
        outputs(mapped, handle, options),
        Effect.mapError(handle.exitCode, processError),
      ], { concurrency: "unbounded" });
      yield* checkExit(code, tail, options);
      return value;
    },
    Effect.scoped,
  );

  const acquireStream = Effect.fnUntraced(
    function*<A, E>(
      command: ChildProcess.Command,
      events: (stdout: Stream.Stream<Uint8Array, ToolError>) => Stream.Stream<A, E>,
      options?: RunOptions,
    ) {
      yield* checkBound(options?.stderrTailBytes ?? 8192, "stderrTailBytes");
      const mapped = mapCommand(command);
      const handle = yield* session(mapped);
      // The native reader belongs to this scope, including when the transform stops early.
      const pull = yield* Stream.toPull(Stream.mapError(handle.stdout, processError));
      const stdout = Stream.fromPull(Effect.succeed(pull));
      const terminal = yield* Effect.forkScoped(Effect.all([
        outputs(mapped, handle, options),
        Effect.mapError(handle.exitCode, processError),
      ], { concurrency: "unbounded" }));
      const finish = Effect.gen(function*() {
        yield* Stream.runDrain(stdout);
        const [tail, code] = yield* Fiber.join(terminal);
        yield* checkExit(code, tail, options);
      });
      return Stream.concat(events(stdout), Stream.fromEffectDrain(finish)).pipe(
        Stream.mergeEffect(Fiber.join(terminal)),
      );
    },
  );
  const stream: Tool["stream"] = (command, events, options) => Stream.unwrap(acquireStream(command, events, options));

  const text: Tool["text"] = (options) =>
    Sink.unwrap(
      checkBound(options.maxBytes, "maxBytes").pipe(Effect.map(() =>
        Sink.suspend(() => {
          // The default decoder drops a leading byte order mark, which JSON decoding would reject.
          const decoder = new TextDecoder("utf-8");
          return Sink.reduceEffect(() => ({ size: 0, text: "" }), (state, chunk: Uint8Array) => {
            const size = state.size + chunk.length;
            return size > options.maxBytes
              ? Effect.fail(limit("output", options.maxBytes))
              : Effect.succeed({ size, text: state.text + decoder.decode(chunk, { stream: true }) });
          }).pipe(Sink.map((state) => state.text + decoder.decode()));
        })
      )),
    );

  const lines: Tool["lines"] = (options) => (self) =>
    Stream.unwrap(
      checkBound(options.maxLineBytes, "maxLineBytes").pipe(Effect.as(Stream.suspend(() => {
        const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
        let first = true;
        // Only the first line can begin with the stream's byte order mark.
        const decodeLine = (line: Uint8Array) => {
          const text = decoder.decode(line);
          const bom = first && text.startsWith("\uFEFF");
          first = false;
          return bom ? text.slice(1) : text;
        };
        const frame = Effect.fnUntraced(function*(pending: Uint8Array, chunk: Uint8Array | undefined) {
          if (chunk === undefined) {
            if (pending.length > options.maxLineBytes) return yield* limit("line", options.maxLineBytes);
            return [new Uint8Array(0), pending.length === 0 ? [] : [decodeLine(pending)]] as const;
          }
          const bytes = new Uint8Array(pending.length + chunk.length);
          bytes.set(pending);
          bytes.set(chunk, pending.length);
          const out: Array<string> = [];
          let start = 0;
          for (let end = bytes.indexOf(10); end !== -1; end = bytes.indexOf(10, start)) {
            const size = end - start - (bytes[end - 1] === 13 ? 1 : 0);
            if (size > options.maxLineBytes) return yield* limit("line", options.maxLineBytes);
            out.push(decodeLine(bytes.subarray(start, start + size)));
            start = end + 1;
          }
          const rest = bytes.subarray(start);
          if (rest.length - (rest.at(-1) === 13 ? 1 : 0) > options.maxLineBytes) {
            return yield* limit("line", options.maxLineBytes);
          }
          // Copy the partial line rather than retaining the whole source chunk.
          return [rest.slice(), out] as const;
        });
        return Stream.concat(self, Stream.succeed(undefined)).pipe(
          Stream.mapAccumEffect(() => new Uint8Array(0), frame),
        );
      }))),
    );

  const decode: Tool["decode"] = (schema) => {
    const parse = Schema.decodeUnknownEffect(schema, { reportInput: false });
    // Record keys and parse-time messages can contain output even with input reporting disabled.
    return (input) =>
      parse(input).pipe(
        Effect.mapError((error) =>
          ToolError.make({ tool: name, reason: Output.make({ detail: describeIssue(error.issue) }) })
        ),
      );
  };
  const mappedSession: Tool["session"] = (command) => session(mapCommand(command));
  return { name, executable, run, stream, session: mappedSession, text, lines, decode };
};

// Raw probe output and stderr can be arbitrary, so warnings name only the failure kind and a version number.
const probeFailure = (error: ToolError | Cause.TimeoutError): string => {
  if (Cause.isTimeoutError(error)) return "timed out after 10 seconds";
  switch (error.reason._tag) {
    case "Exit":
      return `exited with code ${error.reason.code}`;
    case "NotFound":
    case "Process":
      return "could not run";
    case "Output":
    case "Limit":
      return "printed unreadable output";
  }
};

const probeVersion = Effect.fnUntraced(function*(tool: Tool, version: VersionCheck) {
  const output = yield* tool.run(
    ChildProcess.make(tool.executable, version.args, {
      stdin: "ignore",
      killSignal: "SIGTERM",
      forceKillAfter: "500 millis",
    }),
    tool.text({ maxBytes: 4096 }),
  ).pipe(Effect.timeout("10 seconds"), Effect.result);
  if (output._tag === "Failure") {
    yield* Effect.logWarning(
      `${tool.name} version probe ${probeFailure(output.failure)}; tested range is ${version.tested}`,
    );
  } else if (!version.isTested(output.success)) {
    const found = /\d+\.\d+(?:\.\d+)?/u.exec(output.success)?.[0];
    const detail = found === undefined ? "" : ` (found ${found})`;
    yield* Effect.logWarning(`${tool.name} is outside the tested range ${version.tested}${detail}`);
  }
});

/** Resolves once and captures the spawner. No tool is installed, retried or substituted. */
export const make = Effect.fn("Tool.make")(function*(name: string, options?: Options): Effect.fn.Return<
  Tool,
  ToolError | Config.ConfigError,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const executable = options?.executable ?? (yield* findOnPath(name));
  const tool = makeTool(name, executable, spawner, options?.mapCommand ?? identity);
  if (options?.version !== undefined) yield* probeVersion(tool, options.version);
  return tool;
});
