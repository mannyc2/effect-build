import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { directoryArgv, validateDirectory, type WatchInput } from "../internal/BuildCommand.js";
import { BunCommandInputInvalid } from "../internal/CommandError.js";
import type { WatchError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { WatchInput };

export interface Watch {
  readonly _tag: "BuildWatch";
  readonly tool: Tool.Observation<"bun">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly outdir: string;
  readonly publication: "provider-direct-durable";
}

/** Opaque scoped child with raw byte streams; no typed rebuild events are invented. */
export const watch = (
  input: WatchInput,
): Effect.Effect<Watch, WatchError | BunCommandInputInvalid, Runtime | import("effect").Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateDirectory(input);
    const runtime = yield* Runtime;
    const process = yield* runtime.watch(
      directoryArgv(input, true, input.noClearScreen === true),
      input,
    );
    return {
      _tag: "BuildWatch",
      tool: runtime.tool.observation,
      process,
      outdir: input.outdir,
      publication: "provider-direct-durable",
    };
  });
