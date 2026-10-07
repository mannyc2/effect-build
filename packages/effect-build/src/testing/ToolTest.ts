// effect-build/testing: the transport seam. Thin defaults over the platform's
// own ChildProcessSpawner.make and makeHandle; no scripted-step language.
import { Effect, Layer, Sink, Stream } from "effect";
import type { PlatformError } from "effect";
import { ChildProcessSpawner } from "effect/process";
import type { ChildProcess } from "effect/process";

export interface HandleOptions {
  /** Default 1. */
  readonly pid?: number | undefined;
  /** Bytes or text for stdout. Default empty. */
  readonly stdout?: string | Stream.Stream<Uint8Array, PlatformError.PlatformError> | undefined;
  /** Bytes or text for stderr. Default empty. */
  readonly stderr?: string | Stream.Stream<Uint8Array, PlatformError.PlatformError> | undefined;
  /** Default `Effect.succeed(ExitCode(0))`. A PlatformError fakes a signal exit. */
  readonly exitCode?: Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError> | undefined;
  /** Default `Sink.drain`. */
  readonly stdin?: Sink.Sink<void, Uint8Array> | undefined;
  readonly inputFds?: Readonly<Record<number, Sink.Sink<void, Uint8Array>>> | undefined;
  readonly outputFds?: Readonly<Record<number, Stream.Stream<Uint8Array, PlatformError.PlatformError>>> | undefined;
  /** Default `Effect.void`. */
  readonly kill?: ((options?: ChildProcess.KillOptions) => Effect.Effect<void>) | undefined;
}

/** A ChildProcessHandle with the given streams and defaults for the rest. */
const bytes = (output: HandleOptions["stdout"]): Stream.Stream<Uint8Array, PlatformError.PlatformError> =>
  typeof output === "string" ? Stream.succeed(new TextEncoder().encode(output)) : output ?? Stream.empty;

export const handle = (options?: HandleOptions): ChildProcessSpawner.ChildProcessHandle => {
  const stdout = bytes(options?.stdout);
  const stderr = bytes(options?.stderr);
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(options?.pid ?? 1),
    exitCode: options?.exitCode ?? Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(false),
    kill: options?.kill ?? (() => Effect.void),
    stdin: options?.stdin ?? Sink.drain,
    stdout,
    stderr,
    all: Stream.merge(stdout, stderr),
    getInputFd: (fd) => options?.inputFds?.[fd] ?? Sink.drain,
    getOutputFd: (fd) => options?.outputFds?.[fd] ?? Stream.empty,
    unref: Effect.succeed(Effect.void),
  });
};

/**
 * A spawner layer that answers every command with `spawn(command)`. Fail the
 * Effect with a PlatformError to fake a spawn failure. A binding layer also
 * needs FileSystem and Path; tests provide them (FileSystem.layerNoop, Path.layer).
 */
export const layer: (
  spawn: (
    command: ChildProcess.Command,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, PlatformError.PlatformError>,
) => Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = (spawn) =>
  Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawn));
