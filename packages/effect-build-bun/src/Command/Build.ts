import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import {
  buildArgv,
  type BuildInput,
  type BuildToDirectoryInput,
  directoryArgv,
  type Format,
  type Loader,
  type MinifyOptions,
  type NamingOptions,
  type Options,
  type Sourcemap,
  type Target,
  validateBuild,
  validateDirectory,
} from "../internal/BuildCommand.js";
import { BunCommandInputInvalid } from "../internal/CommandError.js";
import type { Completion, RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type {
  BuildInput,
  BuildToDirectoryInput,
  Format,
  Loader,
  MinifyOptions,
  NamingOptions,
  Options,
  Sourcemap,
  Target,
};

export interface BuildResult {
  readonly _tag: "BuildResult";
  readonly tool: Tool.Observation<"bun">;
  readonly output: Uint8Array;
  readonly completion: Completion;
}

export interface BuildToDirectoryResult {
  readonly _tag: "BuildToDirectoryResult";
  readonly tool: Tool.Observation<"bun">;
  readonly outdir: string;
  readonly completion: Completion;
  readonly publication: "provider-direct-durable";
}

export const build = (
  input: BuildInput,
): Effect.Effect<BuildResult, RunError | BunCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateBuild(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run("buildStdout", "none", buildArgv(input), input);
    return {
      _tag: "BuildResult",
      tool: completion.tool,
      output: completion.stdout.bytes,
      completion,
    };
  });

/** Provider-direct output; failure/interruption may leave a partial or mixed tree. */
export const buildToDirectory = (
  input: BuildToDirectoryInput,
): Effect.Effect<BuildToDirectoryResult, RunError | BunCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateDirectory(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "buildDirect",
      "provider-direct-durable",
      directoryArgv(input),
      input,
    );
    return {
      _tag: "BuildToDirectoryResult",
      tool: completion.tool,
      outdir: input.outdir,
      completion,
      publication: "provider-direct-durable",
    };
  });
