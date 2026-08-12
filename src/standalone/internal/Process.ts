import { Effect, PlatformError, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";

export type ChildProcessSpawner = EffectChildProcessSpawner.ChildProcessSpawner;
export const ChildProcessSpawner = EffectChildProcessSpawner.ChildProcessSpawner;

const outputLimit = 1024 * 1024;

export interface BoundedOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface ProcessCompletion {
  readonly exitCode: number;
  readonly stdout: BoundedOutput;
  readonly stderr: BoundedOutput;
}

interface Accumulator {
  readonly bytes: Uint8Array;
  readonly truncated: boolean;
}

const appendBounded = (state: Accumulator, chunk: Uint8Array): Accumulator => {
  const remaining = outputLimit - state.bytes.byteLength;
  if (remaining <= 0) return { bytes: state.bytes, truncated: true };
  const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
  const bytes = new Uint8Array(state.bytes.byteLength + retained.byteLength);
  bytes.set(state.bytes);
  bytes.set(retained, state.bytes.byteLength);
  return { bytes, truncated: state.truncated || retained.byteLength !== chunk.byteLength };
};

const collect = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  Stream.runFold(stream, (): Accumulator => ({ bytes: new Uint8Array(0), truncated: false }), appendBounded).pipe(
    Effect.map((output): BoundedOutput => ({
      text: new TextDecoder().decode(output.bytes),
      truncated: output.truncated,
    })),
  );

export const runProcess = (
  executable: string,
  argv: readonly string[],
  cwd?: string,
): Effect.Effect<ProcessCompletion, PlatformError.PlatformError, ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* ChildProcess.make(executable, argv, {
        ...(cwd === undefined ? {} : { cwd }),
        shell: false,
        forceKillAfter: "2 seconds",
      });
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout), collect(handle.stderr), handle.exitCode] as const,
        { concurrency: "unbounded" },
      );
      return { exitCode: Number(exitCode), stdout, stderr };
    }),
  );
