import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { Format, Options, Platform, Sourcemap, StdoutInput } from "../internal/Command.js";
import { renderStdoutArgv, validateValue } from "../internal/Command.js";
import type { EsbuildCommandInputInvalid } from "../internal/CommandError.js";
import type { Completion, RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { Format, Options, Platform, Sourcemap };
export type Input = StdoutInput;

export interface Result {
  readonly _tag: "BuildResult";
  readonly tool: Tool.Observation<"esbuild">;
  readonly output: Uint8Array;
  readonly completion: Completion;
}

export const build = (input: Input): Effect.Effect<Result, RunError | EsbuildCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateValue("build", input.entrypoint, "entrypoint");
    const runtime = yield* Runtime;
    const completion = yield* runtime.run("buildStdout", "none", renderStdoutArgv(input), input);
    return { _tag: "BuildResult", tool: completion.tool, output: completion.stdout.bytes, completion };
  });
