import { Context, Effect, Fiber, FileSystem, Layer, Path, PlatformError, Scope, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

export interface Call {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface Reply {
  readonly exitCode?: number | undefined;
  readonly stdout?: string | Uint8Array | undefined;
  readonly stderr?: string | Uint8Array | undefined;
}

/** Scripts may write real files, fail with a platform error, and wait until interrupted. */
export type Script<R = FileSystem.FileSystem | Path.Path> = (
  call: Call,
) => Effect.Effect<Reply, PlatformError.PlatformError, R>;

export class Calls extends Context.Service<Calls, {
  readonly all: Effect.Effect<readonly Call[]>;
}>()("effect-build/testing/Calls") {}

const output = (value: string | Uint8Array | undefined): Stream.Stream<Uint8Array> =>
  value === undefined
    ? Stream.empty
    : Stream.succeed(typeof value === "string" ? new TextEncoder().encode(value) : value);

/** A scoped process fake. It exercises process consumers and real file I/O, not OS launch semantics. */
export const layer = <R>(
  script: Script<R>,
): Layer.Layer<ChildProcessSpawner.ChildProcessSpawner | Calls, never, Exclude<R, Scope.Scope> | Path.Path> =>
  Layer.effectContext(Effect.gen(function*() {
    const context = yield* Effect.context<Exclude<R, Scope.Scope>>();
    const path = yield* Path.Path;
    const calls: Call[] = [];
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.gen(function*() {
        if (command._tag !== "StandardCommand") {
          return yield* PlatformError.badArgument({
            module: "ChildProcessSpawner",
            method: "spawn",
            description: "TestSpawner scripts support standard commands, not OS pipelines",
          });
        }
        const inherited = typeof process === "undefined" ? {} : process.env;
        const source = command.options.env === undefined || command.options.extendEnv === true
          ? { ...inherited, ...command.options.env }
          : command.options.env;
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(source)) if (value !== undefined) env[key] = value;
        const call: Call = {
          command: command.command,
          args: [...command.args],
          cwd: path.resolve(command.options.cwd ?? "."),
          env,
        };
        calls.push(call);
        let running = true;
        const child = yield* Effect.suspend(() => script(call)).pipe(
          Effect.scoped,
          Effect.provideContext(context),
          Effect.ensuring(Effect.sync(() => {
            running = false;
          })),
          Effect.forkScoped,
        );
        const reply = Fiber.join(child);
        const stdout = Stream.unwrap(Effect.map(reply, (value) => output(value.stdout)));
        const stderr = Stream.unwrap(Effect.map(reply, (value) => output(value.stderr)));
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(calls.length),
          exitCode: Effect.map(reply, (value) => ChildProcessSpawner.ExitCode(value.exitCode ?? 0)),
          isRunning: Effect.sync(() => running),
          kill: () => Fiber.interrupt(child),
          stdin: Sink.drain,
          stdout,
          stderr,
          all: Stream.merge(stdout, stderr),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      })
    );
    return Context.make(ChildProcessSpawner.ChildProcessSpawner, spawner).pipe(
      Context.add(Calls, { all: Effect.sync(() => [...calls]) }),
    );
  }));
