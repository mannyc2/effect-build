import { Context, Crypto, Effect, FileSystem, Layer, Path, Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Target, Tool } from "effect-build";
import { InputInvalid } from "./InputInvalid.js";
import * as Native from "./internal/CompileCommand.js";
import { type Check, type ImportPermissions, type ProjectOptions, renderCheck, renderPermission, renderProject, validatePath, validatePermission } from "./internal/Options.js";

export { InputInvalid } from "./InputInvalid.js";
export type { Options as CompileOptions, Permissions } from "./internal/CompileCommand.js";
export type { PermissionValue } from "./internal/Options.js";

export type CompileArtifact = Artifact.Executable & { readonly runtime?: { readonly path: string; readonly sha256: string } };
interface Service {
  readonly tool: Tool.Resolved;
  readonly runtime?: { readonly path: string; readonly sha256: string };
}
export class Deno extends Context.Service<Deno, Service>()("effect-build-deno/Deno") {}
export interface LayerOptions {
  readonly executable?: string;
  readonly version?: string | ((version: string) => boolean);
  /** An explicit denort file; its bytes are recorded without executing it. */
  readonly runtime?: string;
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
type Env = Deno | Fs | ChildProcessSpawner.ChildProcessSpawner;
export type BuildError = InputInvalid | Tool.Failed | Tool.SpawnFailed | Artifact.ArtifactError | Commit.CommitError;
export type CompileError = BuildError | Executable.InspectError | Executable.TargetMismatch;

/** 2.9.6 removed transpile --conditions and compile --allow-scripts. */
export const tested = "=2.9.5";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Deno,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported | Artifact.ArtifactError,
  Fs | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Deno, Effect.gen(function*() {
  const tool = yield* Tool.resolve({
    name: "deno",
    ...(options.executable === undefined ? {} : { executable: options.executable }),
    parseVersion: (completion) => /^deno\s+(\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
  }).pipe(Tool.requireVersion(options.version ?? tested));
  if (options.runtime === undefined) return { tool };
  const runtime = yield* Artifact.file(options.runtime, { name: "denort", version: tool.version });
  return { tool, runtime: { path: runtime.path, sha256: runtime.sha256 } };
}));

interface Invocation {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly extendEnv?: boolean;
}
export interface CompileInput extends Invocation {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly target?: Target.Target | Native.Target;
  readonly options?: Native.Options;
  readonly scriptArgs?: readonly string[];
  readonly atomic?: boolean;
}
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });
const runOptions = (input: Invocation, runtime?: Service["runtime"]): Tool.RunOptions => {
  const env = runtime === undefined ? input.env : { ...input.env, DENORT_BIN: runtime.path };
  return {
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(env === undefined ? {} : { env }),
    ...(input.extendEnv === undefined ? {} : { extendEnv: input.extendEnv }),
  };
};
const outputPath = (path: string, cwd?: string) => Path.Path.use((p) => Effect.succeed(p.resolve(cwd ?? "", path)));
const compileInput = (input: CompileInput, outfile: string) => Effect.gen(function*() {
  const target = input.target === undefined ? undefined : Native.Target.literals.find((t) => t === input.target || Native.systemTarget(t) === input.target);
  if (input.target !== undefined && target === undefined) {
    return yield* new InputInvalid({ operation: "compile", reason: `Deno does not compile target ${input.target}` });
  }
  const expected = target === undefined ? Target.host() : Native.systemTarget(target);
  if (expected?.startsWith("windows") === true && !outfile.endsWith(".exe")) {
    return yield* new InputInvalid({ operation: "compile", reason: "Windows outfile must end in .exe" });
  }
  const native: Native.Input = {
    ...input.options,
    entrypoint: input.entrypoint,
    outfile,
    ...(target === undefined ? {} : { target }),
    ...(input.scriptArgs === undefined ? {} : { scriptArgs: input.scriptArgs }),
  };
  yield* Native.validateInput(native);
  return { native, target: expected };
});

export const compile = (input: CompileInput): Effect.Effect<CompileArtifact, CompileError, Env> => Effect.gen(function*() {
  const outfile = yield* outputPath(input.outfile, input.cwd);
  const { native, target } = yield* compileInput(input, outfile);
  const { tool, runtime } = yield* Deno;
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const produce = (out: string) => Effect.gen(function*() {
    yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* Tool.run(tool, Native.renderArgv(native, out), runOptions(input, runtime));
    const artifact = yield* Artifact.executable(out, Tool.producer(tool), target);
    return runtime === undefined ? artifact : { ...artifact, runtime };
  });
  return yield* input.atomic === false ? produce(outfile) : Commit.atomic(outfile, produce);
});

export interface BundleOptions extends ProjectOptions, ImportPermissions {
  readonly platform?: "browser" | "deno";
  readonly format?: "esm" | "cjs" | "iife";
  readonly sourcemap?: "linked" | "inline" | "external";
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
  readonly declaration?: boolean;
}
export interface BundleInput extends Invocation {
  readonly entrypoints: readonly string[];
  readonly outdir: string;
  readonly options?: BundleOptions;
  readonly atomic?: boolean;
}
export interface TranspileOptions extends ProjectOptions {
  readonly sourceMap?: "none" | "inline" | "separate";
  readonly quiet?: boolean;
  readonly declaration?: boolean;
}
export interface TranspileInput extends Invocation {
  readonly files: readonly string[];
  readonly outdir: string;
  readonly options?: TranspileOptions;
  readonly atomic?: boolean;
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
const directory = (input: Invocation & { readonly outdir: string; readonly atomic?: boolean }, files: readonly string[], args: readonly string[]) => Effect.gen(function*() {
  if (files.length === 0) return yield* new InputInvalid({ reason: "At least one input file is required" });
  for (const file of files) yield* validatePath(args[0]!, "input", file);
  yield* validatePath(args[0]!, "outdir", input.outdir);
  const outdir = yield* outputPath(input.outdir, input.cwd);
  const { tool } = yield* Deno;
  const fs = yield* FileSystem.FileSystem;
  const produce = (out: string) => Effect.gen(function*() {
    yield* fs.makeDirectory(out, { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* Tool.run(tool, [...args, "--outdir", out, ...files], runOptions(input));
    return yield* Artifact.directory(out, Tool.producer(tool));
  });
  return yield* input.atomic === false ? produce(outdir) : Commit.atomic(outdir, produce);
});
export const bundle = (input: BundleInput): Effect.Effect<Artifact.Directory, BuildError, Env> => Effect.gen(function*() {
  const options = input.options ?? {};
  yield* validatePermission("bundle", "allowImport", options.allowImport);
  yield* validatePermission("bundle", "denyImport", options.denyImport);
  yield* validatePermission("bundle", "allowScripts", options.allowScripts);
  return yield* directory(input, input.entrypoints, ["bundle", ...renderBundle(options)]);
});
export const transpile = (input: TranspileInput): Effect.Effect<Artifact.Directory, BuildError, Env> => {
  const options = input.options ?? {};
  return directory(input, input.files, ["transpile", ...renderProject(options),
    ...(options.sourceMap === undefined ? [] : ["--source-map", options.sourceMap]),
    ...(options.quiet === true ? ["--quiet"] : []), ...(options.declaration === true ? ["--declaration"] : [])]);
};

export interface WatchInput extends Omit<CompileInput, "atomic"> {
  readonly noClearScreen?: boolean;
  readonly watchExclude?: readonly string[];
}
export interface Watch {
  readonly tool: Tool.Resolved;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly outfile: string;
}
/** Rebuilds directly into outfile while its scope is open. */
export const watch = (input: WatchInput): Effect.Effect<Watch, InputInvalid | Tool.SpawnFailed, Deno | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> => Effect.gen(function*() {
  const outfile = yield* outputPath(input.outfile, input.cwd);
  const { native } = yield* compileInput(input, outfile);
  const { tool, runtime } = yield* Deno;
  const process = yield* ChildProcess.make(tool.path, Native.renderArgv(native, outfile, {
    ...(input.noClearScreen === undefined ? {} : { noClearScreen: input.noClearScreen }),
    ...(input.watchExclude === undefined ? {} : { watchExclude: input.watchExclude }),
  }), { ...runOptions(input, runtime), shell: false }).pipe(
    Effect.mapError((error) => new Tool.SpawnFailed({ name: tool.name, detail: String(error) })),
  );
  return { tool, process, outfile };
});
