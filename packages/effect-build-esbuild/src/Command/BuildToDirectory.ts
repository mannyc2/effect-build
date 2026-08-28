import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { DirectoryInput, Format, Options, Platform, Sourcemap } from "../internal/Command.js";
import { renderDirectoryArgv, validateValue } from "../internal/Command.js";
import type { EsbuildCommandInputInvalid } from "../internal/CommandError.js";
import type { Completion, RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { Format, Options, Platform, Sourcemap };
export type Input = DirectoryInput;

export interface Result {
  readonly _tag: "BuildToDirectoryResult";
  readonly tool: Tool.Observation<"esbuild">;
  readonly directory: string;
  readonly completion: Completion;
  readonly publication: "provider-direct-durable";
}

export const buildToDirectory = (
  input: Input,
): Effect.Effect<Result, RunError | EsbuildCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateValue("buildToDirectory", input.directory, "directory");
    for (const entrypoint of input.entrypoints) {
      yield* validateValue("buildToDirectory", entrypoint, "entrypoint");
    }
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "buildDirect",
      "provider-direct-durable",
      renderDirectoryArgv(input),
      input,
    );
    return {
      _tag: "BuildToDirectoryResult",
      tool: completion.tool,
      directory: input.directory,
      completion,
      publication: "provider-direct-durable",
    };
  });
