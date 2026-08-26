import { Effect } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { DenoCommandInputInvalid } from "../internal/CommandError.js";
import {
  type Check,
  type ImportPermissions,
  type ProjectOptions,
  renderCheck,
  renderPermission,
  renderProject,
  validatePath,
  validatePermission,
} from "../internal/Options.js";
import type { Completion, RunError, WatchError } from "../internal/Runtime.js";
import { Runtime } from "../internal/Runtime.js";

export type Platform = "browser" | "deno";
export type Format = "esm" | "cjs" | "iife";
export type Sourcemap = "linked" | "inline" | "external";

export interface Options extends ProjectOptions, ImportPermissions {
  readonly platform?: Platform;
  readonly format?: Format;
  readonly sourcemap?: Sourcemap;
  readonly minify?: boolean;
  readonly keepNames?: boolean;
  readonly codeSplitting?: boolean;
  readonly inlineImports?: boolean;
  readonly packages?: "bundle" | "external";
  readonly external?: readonly string[];
  readonly check?: Check;
  readonly quiet?: boolean;
  readonly allowScripts?: true | readonly [string, ...string[]];
  readonly envFile?: true | string;
}

export interface StdoutInput extends Omit<Options, "codeSplitting" | "sourcemap"> {
  readonly entrypoint: string;
  readonly codeSplitting?: false;
  readonly sourcemap?: "inline";
}

export type Destination =
  | { readonly _tag: "Output"; readonly path: string }
  | { readonly _tag: "Outdir"; readonly path: string };

export interface DirectInput extends Options {
  readonly entrypoints: readonly [string, ...string[]];
  readonly destination: Destination;
}

export interface WatchInput extends DirectInput {}

export interface DeclarationsInput extends Omit<DirectInput, "destination"> {
  readonly destination: { readonly _tag: "Outdir"; readonly path: string };
}

export interface StdoutResult {
  readonly _tag: "StdoutResult";
  readonly stability: "experimental";
  readonly tool: Tool.Observation<"deno">;
  readonly output: Uint8Array;
  readonly completion: Completion;
}

export interface DirectResult {
  readonly _tag: "DirectWriteResult";
  readonly stability: "experimental";
  readonly tool: Tool.Observation<"deno">;
  readonly destination: Destination;
  readonly completion: Completion;
  readonly publication: "provider-direct-durable";
}

export interface Watch {
  readonly _tag: "BundleWatch";
  readonly stability: "experimental";
  readonly tool: Tool.Observation<"deno">;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly publication: "provider-direct-durable";
}

const renderOptions = (input: Options): readonly string[] => [
  ...renderProject(input),
  ...renderCheck(input.check),
  ...renderPermission("allow-import", input.allowImport),
  ...renderPermission("deny-import", input.denyImport),
  ...renderPermission("allow-scripts", input.allowScripts),
  ...(input.envFile === undefined ? [] : [input.envFile === true ? "--env-file" : `--env-file=${input.envFile}`]),
  ...(input.platform === undefined ? [] : ["--platform", input.platform]),
  ...(input.format === undefined ? [] : ["--format", input.format]),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.keepNames === true ? ["--keep-names"] : []),
  ...(input.codeSplitting === true ? ["--code-splitting"] : []),
  ...(input.inlineImports === undefined ? [] : [`--inline-imports=${input.inlineImports}`]),
  ...(input.packages === undefined ? [] : ["--packages", input.packages]),
  ...(input.external ?? []).flatMap((external) => ["--external", external]),
  ...(input.quiet === true ? ["--quiet"] : []),
];

const destinationArgv = (destination: Destination): readonly string[] =>
  destination._tag === "Output" ? ["--output", destination.path] : ["--outdir", destination.path];

const renderStdoutArgv = (input: StdoutInput): readonly string[] => [
  "bundle",
  ...renderOptions(input),
  input.entrypoint,
];

const renderDirectArgv = (
  input: DirectInput,
  mode: "direct" | "watch" | "declarations" = "direct",
): readonly string[] => [
  "bundle",
  ...(mode === "watch" ? ["--watch"] : []),
  ...(mode === "declarations" ? ["--declaration"] : []),
  ...renderOptions(input),
  ...destinationArgv(input.destination),
  ...input.entrypoints,
];

const validatePermissionLists = (
  operation: "bundleStdout" | "bundle",
  input: Options,
): Effect.Effect<void, DenoCommandInputInvalid> =>
  Effect.gen(function*() {
    yield* validatePermission(operation, "allowImport", input.allowImport);
    yield* validatePermission(operation, "denyImport", input.denyImport);
    yield* validatePermission(operation, "allowScripts", input.allowScripts);
  });

const validateDirect = (input: DirectInput): Effect.Effect<void, DenoCommandInputInvalid> =>
  Effect.gen(function*() {
    yield* validatePermissionLists("bundle", input);
    yield* validatePath("bundle", "destination", input.destination.path);
    for (const entrypoint of input.entrypoints) yield* validatePath("bundle", "entrypoint", entrypoint);
  });

export const stdout = (
  input: StdoutInput,
): Effect.Effect<StdoutResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validatePermissionLists("bundleStdout", input);
    yield* validatePath("bundleStdout", "entrypoint", input.entrypoint);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run("bundleStdout", "none", renderStdoutArgv(input), input);
    return {
      _tag: "StdoutResult",
      stability: "experimental",
      tool: completion.tool,
      output: completion.stdout.bytes,
      completion,
    };
  });

/** Provider-direct durable output; failure can leave a partial tree. */
export const direct = (
  input: DirectInput,
): Effect.Effect<DirectResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateDirect(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "bundleDirect",
      "provider-direct-durable",
      renderDirectArgv(input),
      input,
    );
    return {
      _tag: "DirectWriteResult",
      stability: "experimental",
      tool: completion.tool,
      destination: input.destination,
      completion,
      publication: "provider-direct-durable",
    };
  });

/** Declaration roll-up is distinct from transpile declarations. */
export const declarations = (
  input: DeclarationsInput,
): Effect.Effect<DirectResult, RunError | DenoCommandInputInvalid, Runtime> =>
  Effect.gen(function*() {
    yield* validateDirect(input);
    const runtime = yield* Runtime;
    const completion = yield* runtime.run(
      "bundleDeclarations",
      "provider-direct-durable",
      renderDirectArgv(input, "declarations"),
      input,
    );
    return {
      _tag: "DirectWriteResult",
      stability: "experimental",
      tool: completion.tool,
      destination: input.destination,
      completion,
      publication: "provider-direct-durable",
    };
  });

/** Opaque scoped process with raw streams; no rebuild-event parser is exposed. */
export const watch = (
  input: WatchInput,
): Effect.Effect<Watch, WatchError | DenoCommandInputInvalid, Runtime | import("effect").Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateDirect(input);
    const runtime = yield* Runtime;
    const process = yield* runtime.watch("bundleWatch", renderDirectArgv(input, "watch"), input);
    return {
      _tag: "BundleWatch",
      stability: "experimental",
      tool: runtime.tool.observation,
      process,
      publication: "provider-direct-durable",
    };
  });
