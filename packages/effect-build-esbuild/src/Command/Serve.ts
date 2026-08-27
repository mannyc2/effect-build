import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import type { Format, Options, Platform, ServeInput, Sourcemap } from "../internal/Command.js";
import { renderWatchArgv, validateValue, validateWatchOutput, valuesWithPrefix } from "../internal/Command.js";
import type { EsbuildCommandInputInvalid } from "../internal/CommandError.js";
import { EsbuildCommandInputInvalid as InputInvalid } from "../internal/CommandError.js";
import type { ProcessError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type { Format, Options, Platform, Sourcemap };
export type Input = ServeInput;

export interface Server {
  readonly _tag: "BuildServer";
  readonly tool: Tool.Observation<"esbuild">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly publication: "provider-direct-durable";
}

export const serve = (
  input: Input,
): Effect.Effect<Server, ProcessError | EsbuildCommandInputInvalid, Runtime | import("effect").Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateWatchOutput("serve", input.output);
    for (const entrypoint of input.entrypoints) yield* validateValue("serve", entrypoint, "entrypoint");
    if (input.port !== undefined && (!Number.isSafeInteger(input.port) || input.port < 0 || input.port > 65_535)) {
      return yield* new InputInvalid({ operation: "serve", reason: "port must be an integer from 0 through 65535" });
    }
    const runtime = yield* Runtime;
    const address = input.host === undefined ? `${input.port ?? 8000}` : `${input.host}:${input.port ?? 8000}`;
    const process = yield* runtime.process("serve", [
      `--serve=${address}`,
      ...(input.servedir === undefined ? [] : [`--servedir=${input.servedir}`]),
      ...(input.fallback === undefined ? [] : [`--serve-fallback=${input.fallback}`]),
      ...valuesWithPrefix(input.corsOrigins, "--cors-origin="),
      ...renderWatchArgv(input),
    ], input);
    return {
      _tag: "BuildServer",
      tool: runtime.tool.observation,
      process,
      publication: "provider-direct-durable",
    };
  });
