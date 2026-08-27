import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import type { Format, Options, Platform, Sourcemap, WatchInput } from "../internal/Command.js";
import { renderWatchArgv, validateValue, validateWatchOutput } from "../internal/Command.js";
import type { EsbuildCommandInputInvalid } from "../internal/CommandError.js";
import type { ProcessError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { Format, Options, Platform, Sourcemap };
export type Input = WatchInput;

export interface Watch {
  readonly _tag: "BuildWatch";
  readonly tool: Tool.Observation<"esbuild">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly publication: "provider-direct-durable";
}

export const watch = (
  input: Input,
): Effect.Effect<Watch, ProcessError | EsbuildCommandInputInvalid, Runtime | import("effect").Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateWatchOutput("watch", input.output);
    for (const entrypoint of input.entrypoints) yield* validateValue("watch", entrypoint, "entrypoint");
    const runtime = yield* Runtime;
    const process = yield* runtime.process("buildWatch", ["--watch=forever", ...renderWatchArgv(input)], input);
    return {
      _tag: "BuildWatch",
      tool: runtime.tool.observation,
      process,
      publication: "provider-direct-durable",
    };
  });
