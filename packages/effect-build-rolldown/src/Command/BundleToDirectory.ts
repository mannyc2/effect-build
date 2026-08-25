import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { DirectoryInput, Format, Options, Platform } from "../internal/Command.js";
import { renderDirectoryArgv, validateValue } from "../internal/Command.js";
import type { RolldownCommandInputInvalid } from "../internal/CommandError.js";
import type { Completion, RunError } from "./Runtime.js";
import { Runtime } from "./Runtime.js";

export type { Format, Options, Platform };
export type Input = DirectoryInput;

export interface Result {
  readonly _tag: "BundleToDirectoryResult";
  readonly tool: Tool.Observation<"rolldown">;
  readonly directory: string;
  readonly completion: Completion;
  readonly publication: "provider-direct-durable";
}

export const bundleToDirectory = (
  input: Input,
): Effect.Effect<Result, RunError | RolldownCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateValue("bundleToDirectory", input.directory, "directory");
    for (const entry of input.inputs) yield* validateValue("bundleToDirectory", entry, "input");
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "bundleDirect",
      "provider-direct-durable",
      renderDirectoryArgv(input),
      input,
    );
    return {
      _tag: "BundleToDirectoryResult",
      tool: completion.tool,
      directory: input.directory,
      completion,
      publication: "provider-direct-durable",
    };
  });
