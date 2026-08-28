import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { Format, Options, Platform, StdoutInput } from "../internal/Command.js";
import { renderStdoutArgv, validateValue } from "../internal/Command.js";
import type { RolldownCommandInputInvalid } from "../internal/CommandError.js";
import type { Completion, RunError } from "./Runtime.js";
import { Runtime } from "./Runtime.js";

export type { Format, Options, Platform };
export type Input = StdoutInput;

export interface Result {
  readonly _tag: "BundleResult";
  readonly tool: Tool.Observation<"rolldown">;
  readonly output: Uint8Array;
  readonly completion: Completion;
}

export const bundle = (input: Input): Effect.Effect<Result, RunError | RolldownCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateValue("bundle", input.input, "input");
    const runtime = yield* Runtime;
    const completion = yield* runtime.run("bundleStdout", "none", renderStdoutArgv(input), input);
    return { _tag: "BundleResult", tool: completion.tool, output: completion.stdout.bytes, completion };
  });
