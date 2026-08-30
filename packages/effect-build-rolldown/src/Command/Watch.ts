import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import type { DirectoryInput, Format, Options, Platform } from "../internal/Command.js";
import { renderDirectoryArgv, validateValue } from "../internal/Command.js";
import type { RolldownCommandInputInvalid } from "../internal/CommandError.js";
import type { WatchError } from "./Runtime.js";
import { Runtime } from "./Runtime.js";

export type { Format, Options, Platform };
export type Input = DirectoryInput;

export interface Watch {
  readonly _tag: "BundleWatch";
  readonly tool: Tool.Observation<"rolldown">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly directory: string;
  readonly publication: "provider-direct-durable";
}

export const watch = (
  input: Input,
): Effect.Effect<Watch, WatchError | RolldownCommandInputInvalid, Runtime | import("effect").Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateValue("watch", input.directory, "directory");
    for (const entry of input.inputs) yield* validateValue("watch", entry, "input");
    const runtime = yield* Runtime;
    const process = yield* runtime.watch(renderDirectoryArgv(input, true), input);
    return {
      _tag: "BundleWatch",
      tool: runtime.tool.observation,
      process,
      directory: input.directory,
      publication: "provider-direct-durable",
    };
  });
