import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import { DenoCommandInputInvalid } from "../internal/CommandError.js";
import { type ProjectOptions, renderProject, validatePath } from "../internal/Options.js";
import type { Completion, RunError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type SourceMap = "none" | "inline" | "separate";

export interface Options extends ProjectOptions {
  readonly sourceMap?: SourceMap;
  readonly quiet?: boolean;
}

export interface StdoutInput extends Omit<Options, "sourceMap"> {
  readonly file: string;
  readonly sourceMap?: "none" | "inline";
}

export interface TranspileToDirectoryInput extends Options {
  readonly files: readonly [string, ...string[]];
  readonly outdir: string;
}

export interface EmitDeclarationsInput extends TranspileToDirectoryInput {}

export interface StdoutResult {
  readonly _tag: "StdoutResult";
  readonly tool: Tool.Observation<"deno">;
  readonly output: Uint8Array;
  readonly completion: Completion;
}

export interface TranspileToDirectoryResult {
  readonly _tag: "TranspileToDirectoryResult";
  readonly tool: Tool.Observation<"deno">;
  readonly outdir: string;
  readonly completion: Completion;
  readonly publication: "provider-direct-durable";
}

const renderOptions = (input: Options): readonly string[] => [
  ...renderProject(input),
  ...(input.sourceMap === undefined ? [] : ["--source-map", input.sourceMap]),
  ...(input.quiet === true ? ["--quiet"] : []),
];

const renderStdoutArgv = (input: StdoutInput): readonly string[] => [
  "transpile",
  ...renderOptions(input),
  input.file,
];

const renderDirectArgv = (input: TranspileToDirectoryInput, declarations = false): readonly string[] => [
  "transpile",
  ...(declarations ? ["--declaration"] : []),
  ...renderOptions(input),
  "--outdir",
  input.outdir,
  ...input.files,
];

const validateDirect = (input: TranspileToDirectoryInput): Effect.Effect<void, DenoCommandInputInvalid> =>
  Effect.gen(function*() {
    yield* validatePath("transpile", "outdir", input.outdir);
    for (const file of input.files) yield* validatePath("transpile", "file", file);
  });

export const transpile = (
  input: StdoutInput,
): Effect.Effect<StdoutResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validatePath("transpileStdout", "file", input.file);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run("transpileStdout", "none", renderStdoutArgv(input), input);
    return { _tag: "StdoutResult", tool: completion.tool, output: completion.stdout.bytes, completion };
  });

/** Provider-direct output; separate maps may survive a later failure. */
export const transpileToDirectory = (
  input: TranspileToDirectoryInput,
): Effect.Effect<TranspileToDirectoryResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateDirect(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "transpileDirect",
      "provider-direct-durable",
      renderDirectArgv(input),
      input,
    );
    return {
      _tag: "TranspileToDirectoryResult",
      tool: completion.tool,
      outdir: input.outdir,
      completion,
      publication: "provider-direct-durable",
    };
  });

/** Deno tsc-backed declaration emission, not bundle declaration roll-up. */
export const emitDeclarations = (
  input: EmitDeclarationsInput,
): Effect.Effect<TranspileToDirectoryResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateDirect(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "transpileDeclarations",
      "provider-direct-durable",
      renderDirectArgv(input, true),
      input,
    );
    return {
      _tag: "TranspileToDirectoryResult",
      tool: completion.tool,
      outdir: input.outdir,
      completion,
      publication: "provider-direct-durable",
    };
  });
