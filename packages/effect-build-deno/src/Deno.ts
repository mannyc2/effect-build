import { Context, Crypto, Effect, FileSystem, Layer, Path, Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Target, Tool } from "effect-build";
import * as CompileCommand from "./internal/CompileCommand.js";
import { type Check, type ImportPermissions, type ProjectOptions, renderCheck, renderPermission, renderProject, validatePath, validatePermission } from "./internal/Options.js";

export type { Options as CompileOptions, Permissions } from "./internal/CompileCommand.js";
export type { PermissionValue } from "./internal/Options.js";

export type CompileArtifact = Artifact.Executable & { readonly runtime?: { readonly path: string; readonly sha256: string } };
interface Service {
  readonly tool: Tool.Resolved;
  readonly runtime?: { readonly path: string; readonly sha256: string } | undefined;
}
export class Deno extends Context.Service<Deno, Service>()("effect-build-deno/Deno") {}
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
  /** An explicit denort file; its bytes are recorded without executing it. */
  readonly runtime?: string | undefined;
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
type Env = Deno | Fs | ChildProcessSpawner.ChildProcessSpawner;
export type BuildError =
  | Tool.InputInvalid
  | Tool.Failed
  | Tool.SpawnFailed
  | Artifact.ArtifactError
  | Commit.CommitError;
export type CompileError = BuildError | Executable.InspectError | Executable.TargetMismatch;

/** Known removed CLI flags are checked only by the operations that use them. */
export const supported = ">=2.9.5 <3.0.0";
/** Exact version exercised by real-tool CI. */
export const tested = "=2.9.5";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Deno,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported | Artifact.ArtifactError,
  Fs | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Deno, Effect.gen(function*() {
  const tool = yield* Tool.resolve({
    name: "deno",
    executable: options.executable,
    parseVersion: (completion) => /^deno\s+(\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
  }).pipe(Tool.requireVersion(options.version ?? supported));
  if (options.runtime === undefined) return { tool };
  const runtime = yield* Artifact.file(options.runtime, { name: "denort", version: tool.version });
  return { tool, runtime: { path: runtime.path, sha256: runtime.sha256 } };
}));

interface Invocation {
  readonly cwd?: string | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly onOutput?: Tool.RunOptions["onOutput"] | undefined;
}
export interface CompileInput extends Invocation, Commit.ProducerOptions {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly target?: Target.Target | CompileCommand.Target | undefined;
  readonly options?: CompileCommand.Options | undefined;
  readonly scriptArgs?: readonly string[] | undefined;
}
/** An explicit denort is selected through DENORT_BIN; the caller's environment stays inherited unless extendEnv is false. */
const environment = (input: Invocation, runtime?: Service["runtime"]) => {
  const env = runtime === undefined ? input.env : { ...input.env, DENORT_BIN: runtime.path };
  return { cwd: input.cwd, env, extendEnv: env === undefined ? undefined : input.extendEnv ?? true };
};
const prepareOutput = Effect.fnUntraced(function*(operation: string, field: string, value: string, cwd?: string) {
  yield* validatePath(operation, field, value);
  if (cwd?.includes("\0")) return yield* new Tool.InputInvalid({ operation, reason: "cwd must contain no NUL" });
  const p = yield* Path.Path;
  return p.resolve(cwd ?? "", value);
});
const checkCapability = (tool: Tool.Resolved, operation: string, flag: string, used: boolean) =>
  used && Tool.satisfies(">=2.9.6")(tool.version)
    ? Effect.fail(new Tool.InputInvalid({
      operation,
      reason: `${flag} was removed in Deno 2.9.6; omit it or explicitly select 2.9.5`,
    }))
    : Effect.void;
const prepareCompile = Effect.fnUntraced(function*(operation: "Deno.compile" | "Deno.watch", input: CompileInput) {
  yield* validatePath(operation, "entrypoint", input.entrypoint);
  const outfile = yield* prepareOutput(operation, "outfile", input.outfile, input.cwd);
  const target = input.target === undefined
    ? undefined
    : CompileCommand.Target.literals.find((t) => t === input.target || CompileCommand.systemTarget(t) === input.target);
  if (input.target !== undefined && target === undefined) {
    return yield* new Tool.InputInvalid({ operation, reason: `Deno does not compile target ${input.target}` });
  }
  const expected = target === undefined ? Target.host() : CompileCommand.systemTarget(target);
  // Deno embeds the output basename; a lowercase .exe keeps the staged and committed names identical.
  if (expected?.startsWith("windows") === true && !outfile.endsWith(".exe")) {
    return yield* new Tool.InputInvalid({ operation, reason: "Windows outfile must end in .exe" });
  }
  const command: CompileCommand.Input = {
    ...input.options,
    entrypoint: input.entrypoint,
    target,
    scriptArgs: input.scriptArgs,
  };
  yield* CompileCommand.validateOptions(operation, command);
  const { tool, runtime } = yield* Deno;
  yield* checkCapability(tool, operation, "--allow-scripts", command.allowScripts !== undefined);
  return { command, outfile, target: expected, tool, runtime };
});

export const compile = Effect.fn("Deno.compile")(function*(input: CompileInput): Effect.fn.Return<CompileArtifact, CompileError, Env> {
  const { command, outfile, target, tool, runtime } = yield* prepareCompile("Deno.compile", input);
  const produce = (out: string) =>
    Tool.run(tool, CompileCommand.renderArgv(command, out), { ...environment(input, runtime), onOutput: input.onOutput }).pipe(
      Effect.andThen(Artifact.executable(out, Tool.producer(tool), target)),
      Effect.map((artifact): CompileArtifact => runtime === undefined ? artifact : { ...artifact, runtime }),
    );
  return yield* Commit.output(outfile, produce, input);
});

export interface BundleOptions extends ProjectOptions, ImportPermissions {
  readonly platform?: "browser" | "deno" | undefined;
  readonly format?: "esm" | "cjs" | "iife" | undefined;
  readonly sourcemap?: "linked" | "inline" | "external" | undefined;
  readonly minify?: boolean | undefined;
  readonly keepNames?: boolean | undefined;
  readonly codeSplitting?: boolean | undefined;
  readonly inlineImports?: boolean | undefined;
  readonly packages?: "bundle" | "external" | undefined;
  readonly external?: readonly string[] | undefined;
  readonly check?: Check | undefined;
  readonly quiet?: boolean | undefined;
  readonly allowScripts?: true | readonly [string, ...string[]] | undefined;
  readonly envFile?: true | string | undefined;
  readonly declaration?: boolean | undefined;
}
export interface BundleInput extends Invocation, Commit.ProducerOptions {
  readonly entrypoints: readonly string[];
  readonly outdir: string;
  readonly options?: BundleOptions | undefined;
}
export interface TranspileOptions extends ProjectOptions {
  readonly sourceMap?: "none" | "inline" | "separate" | undefined;
  readonly quiet?: boolean | undefined;
  readonly declaration?: boolean | undefined;
}
export interface TranspileInput extends Invocation, Commit.ProducerOptions {
  readonly files: readonly string[];
  readonly outdir: string;
  readonly options?: TranspileOptions | undefined;
}
const renderBundle = (input: BundleOptions): readonly string[] => [
  ...renderProject(input), ...renderCheck(input.check),
  ...renderPermission("allow-import", input.allowImport), ...renderPermission("deny-import", input.denyImport),
  ...renderPermission("allow-scripts", input.allowScripts),
  ...(input.envFile === undefined ? [] : [input.envFile === true ? "--env-file" : `--env-file=${input.envFile}`]),
  ...(input.platform === undefined ? [] : ["--platform", input.platform]),
  ...(input.format === undefined ? [] : ["--format", input.format]),
  ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
  ...(input.minify === true ? ["--minify"] : []), ...(input.keepNames === true ? ["--keep-names"] : []),
  ...(input.codeSplitting === true ? ["--code-splitting"] : []),
  ...(input.inlineImports === undefined ? [] : [`--inline-imports=${input.inlineImports}`]),
  ...(input.packages === undefined ? [] : ["--packages", input.packages]),
  ...(input.external ?? []).flatMap((external) => ["--external", external]),
  ...(input.quiet === true ? ["--quiet"] : []), ...(input.declaration === true ? ["--declaration"] : []),
];
const prepareDirectory = Effect.fnUntraced(function*(
  command: "bundle" | "transpile",
  input: Invocation & Commit.ProducerOptions & { readonly outdir: string },
  files: readonly string[],
) {
  const operation = `Deno.${command}`;
  if (files.length === 0) {
    return yield* new Tool.InputInvalid({
      operation,
      reason: `${command === "bundle" ? "entrypoints" : "files"} are empty`,
    });
  }
  for (const file of files) yield* validatePath(operation, "input", file);
  const outdir = yield* prepareOutput(operation, "outdir", input.outdir, input.cwd);
  const { tool } = yield* Deno;
  return { input, files, command, outdir, tool };
});
const directory = Effect.fnUntraced(function*(
  prepared: Effect.Success<ReturnType<typeof prepareDirectory>>,
  options: readonly string[],
) {
  const { input, files, command, outdir, tool } = prepared;
  const fs = yield* FileSystem.FileSystem;
  const produce = (out: string) => Effect.gen(function*() {
    yield* fs.makeDirectory(out, { recursive: true }).pipe(Effect.mapError(Artifact.ioError(out, "write")));
    yield* Tool.run(tool, [command, ...options, "--outdir", out, ...files], { ...environment(input), onOutput: input.onOutput });
    return yield* Artifact.directory(out, Tool.producer(tool));
  });
  return yield* Commit.output(outdir, produce, input, "sibling");
});
export const bundle = Effect.fn("Deno.bundle")(function*(input: BundleInput): Effect.fn.Return<Artifact.Directory, BuildError, Env> {
  const options = input.options ?? {};
  yield* validatePermission("Deno.bundle", "allowImport", options.allowImport);
  yield* validatePermission("Deno.bundle", "denyImport", options.denyImport);
  yield* validatePermission("Deno.bundle", "allowScripts", options.allowScripts);
  const prepared = yield* prepareDirectory("bundle", input, input.entrypoints);
  return yield* directory(prepared, renderBundle(options));
});
export const transpile = Effect.fn("Deno.transpile")(function*(input: TranspileInput): Effect.fn.Return<Artifact.Directory, BuildError, Env> {
  const options = input.options ?? {};
  const prepared = yield* prepareDirectory("transpile", input, input.files);
  yield* checkCapability(prepared.tool, "Deno.transpile", "--conditions", (options.conditions?.length ?? 0) > 0);
  return yield* directory(prepared, [...renderProject(options),
    ...(options.sourceMap === undefined ? [] : ["--source-map", options.sourceMap]),
    ...(options.quiet === true ? ["--quiet"] : []), ...(options.declaration === true ? ["--declaration"] : [])]);
});

export interface WatchInput extends Omit<CompileInput, keyof Commit.ProducerOptions | "onOutput"> {
  readonly noClearScreen?: boolean | undefined;
  readonly watchExclude?: readonly string[] | undefined;
  /** Inherit live diagnostics by default; use pipe to consume process streams. */
  readonly stdio?: "inherit" | "pipe" | undefined;
}
export interface Watch {
  readonly tool: Tool.Resolved;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly outfile: string;
}
/** Rebuilds directly into outfile while its scope is open. */
export const watch = Effect.fn("Deno.watch")(function*(input: WatchInput): Effect.fn.Return<Watch, Tool.InputInvalid | Tool.SpawnFailed, Deno | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const { command, outfile, tool, runtime } = yield* prepareCompile("Deno.watch", input);
  const process = yield* ChildProcess.make(
    tool.path,
    CompileCommand.renderArgv(command, outfile, { noClearScreen: input.noClearScreen, watchExclude: input.watchExclude }),
    { ...environment(input, runtime), stdout: input.stdio ?? "inherit", stderr: input.stdio ?? "inherit", shell: false },
  ).pipe(Effect.mapError((error) => new Tool.SpawnFailed({ tool: tool.name, detail: String(error) })));
  return { tool, process, outfile };
});
