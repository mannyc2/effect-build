import { Effect, FileSystem, Path } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { DenoCommandInputInvalid } from "../internal/CommandError.js";
import { renderArgv, systemTarget, validateWatch, type WatchInput } from "../internal/CompileCommand.js";
import * as NativeExecutable from "../internal/Executable.js";
import type { WatchError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { WatchInput };

export interface Watch {
  readonly _tag: "CompileWatch";
  readonly tool: Tool.Observation<"deno">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly destination: string;
  readonly publication: "provider-direct-durable";
  readonly stability: "experimental";
}

/** Provider-direct repeated replacement. Failed/interrupted rebuilds may leave a partial executable. */
export const watch = (
  input: WatchInput,
): Effect.Effect<
  Watch,
  WatchError | DenoCommandInputInvalid | NativeExecutable.NativeExecutableInspectionFailed,
  Runtime | FileSystem.FileSystem | Path.Path | import("effect").Scope.Scope
> =>
  Effect.gen(function*() {
    yield* validateWatch(input);
    const runtime = yield* Runtime;
    if (runtime.denort !== undefined) {
      yield* NativeExecutable.inspect(
        runtime.denort.executablePath,
        runtime.version,
        input.target === undefined ? undefined : systemTarget(input.target),
      );
    }
    const process = yield* runtime.watch(
      "compileWatch",
      renderArgv(input, input.outfile, {
        ...(input.noClearScreen === undefined ? {} : { noClearScreen: input.noClearScreen }),
        ...(input.watchExclude === undefined ? {} : { watchExclude: input.watchExclude }),
      }),
      input,
    );
    return {
      _tag: "CompileWatch",
      tool: runtime.tool.observation,
      process,
      destination: input.outfile,
      publication: "provider-direct-durable",
      stability: "experimental",
    };
  });
