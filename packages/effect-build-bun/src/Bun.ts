import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Target, Tool } from "effect-build";

export class Bun extends Context.Service<Bun, { readonly tool: Tool.Resolved }>()("effect-build-bun/Bun") {}

export interface LayerOptions {
  /** Use this binary instead of searching PATH. */
  readonly executable?: string | undefined;
  /** Accept these versions: an npm semver range or predicate. Default: `supported`. */
  readonly version?: string | ((version: string) => boolean) | undefined;
}

/** Exact versions exercised by real-tool CI. */
export const tested = "1.3.14 || 1.4.2";
/** Compatible major; emitted builds separately reject the known 1.4.1 defect. */
export const supported = ">=1.3.14 <2.0.0";

export const layer = (
  options: LayerOptions = {},
): Layer.Layer<
  Bun,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    Bun,
    Tool.resolve({ name: "bun", executable: options.executable }).pipe(
      Tool.requireVersion(options.version ?? supported),
      Effect.map((tool) => ({ tool })),
    ),
  );

/** Bun's own target names, for people who want the variants (`-baseline`, `-modern`). */
export const BunTarget = Schema.Literals([
  "bun-linux-x64", "bun-linux-x64-baseline", "bun-linux-x64-modern", "bun-linux-x64-musl",
  "bun-linux-arm64", "bun-linux-arm64-musl",
  "bun-darwin-x64", "bun-darwin-x64-baseline", "bun-darwin-arm64",
  "bun-windows-x64", "bun-windows-x64-baseline", "bun-windows-x64-modern", "bun-windows-arm64",
] as const);
export type BunTarget = typeof BunTarget.Type;

const toBunTarget = (t: Target.Target | BunTarget): BunTarget => t.startsWith("bun-") ? t as BunTarget : `bun-${t}` as BunTarget;
const toTarget = (t: BunTarget): Target.Target =>
  t.replace(/^bun-/, "").replace(/-(baseline|modern)$/, "") as Target.Target;

export interface MinifyOptions {
  readonly syntax?: boolean | undefined;
  readonly whitespace?: boolean | undefined;
  readonly identifiers?: boolean | undefined;
  readonly keepNames?: boolean | undefined;
}

export interface CompileOptions {
  readonly minify?: boolean | MinifyOptions | undefined;
  readonly sourcemap?: "inline" | "none" | undefined;
  readonly bytecode?: boolean | undefined;
  readonly packages?: "bundle" | "external" | undefined;
  readonly external?: readonly string[] | undefined;
  readonly conditions?: readonly string[] | undefined;
  readonly define?: Readonly<Record<string, string>> | undefined;
  readonly environmentInline?: "inline" | "disable" | `${string}*` | undefined;
  readonly execArgv?: readonly string[] | undefined;
  readonly autoloadDotenv?: boolean | undefined;
  readonly autoloadBunfig?: boolean | undefined;
  readonly autoloadTsconfig?: boolean | undefined;
  readonly autoloadPackageJson?: boolean | undefined;
  readonly windows?: {
    readonly hideConsole?: boolean | undefined;
    readonly icon?: string | undefined;
    readonly title?: string | undefined;
    readonly publisher?: string | undefined;
    readonly version?: string | undefined;
    readonly description?: string | undefined;
    readonly copyright?: string | undefined;
  } | undefined;
}

export interface CompileInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outfile: string;
  /** Default: the host. */
  readonly target?: Target.Target | BunTarget | undefined;
  readonly cwd?: string | undefined;
  readonly options?: CompileOptions | undefined;
  /** Build into a sibling temp path and rename into place. Default true. */
  readonly atomic?: boolean | undefined;
  readonly onOutput?: Tool.RunOptions["onOutput"] | undefined;
}

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("BunInputInvalid", { reason: Schema.String }) {
  override get message(): string {
    return this.reason;
  }
}

export type CompileError =
  | InputInvalid
  | Tool.Failed
  | Tool.SpawnFailed
  | Artifact.ArtifactError
  | Executable.InspectError
  | Executable.TargetMismatch
  | Commit.CommitError;

const renderBoolean = (flag: string, value: boolean | undefined): string[] =>
  value === undefined ? [] : [`--${value ? "" : "no-"}${flag}`];

const renderMinify = (minify: boolean | MinifyOptions | undefined): string[] => [
  ...(minify === true ? ["--minify"] : []),
  ...(typeof minify === "object" && minify.syntax === true ? ["--minify-syntax"] : []),
  ...(typeof minify === "object" && minify.whitespace === true ? ["--minify-whitespace"] : []),
  ...(typeof minify === "object" && minify.identifiers === true ? ["--minify-identifiers"] : []),
  ...(typeof minify === "object" && minify.keepNames === true ? ["--keep-names"] : []),
];

const renderArgv = (input: CompileInput, out: string, target?: BunTarget): string[] => {
  const o = input.options ?? {};
  return [
    "build", "--compile", ...(target === undefined ? [] : [`--target=${target}`]),
    ...renderMinify(o.minify),
    ...(o.sourcemap ? [`--sourcemap=${o.sourcemap}`] : []),
    ...(o.bytecode ? ["--bytecode"] : []),
    ...(o.packages === undefined ? [] : [`--packages=${o.packages}`]),
    ...(o.external ?? []).map((e) => `--external=${e}`),
    ...(o.conditions ?? []).map((e) => `--conditions=${e}`),
    ...Object.entries(o.define ?? {}).flatMap(([k, v]) => ["--define", `${k}=${v}`]),
    ...(o.environmentInline === undefined ? [] : [`--env=${o.environmentInline}`]),
    ...(o.execArgv ?? []).map((value) => `--compile-exec-argv=${value}`),
    ...renderBoolean("compile-autoload-dotenv", o.autoloadDotenv),
    ...renderBoolean("compile-autoload-bunfig", o.autoloadBunfig),
    ...renderBoolean("compile-autoload-tsconfig", o.autoloadTsconfig),
    ...renderBoolean("compile-autoload-package-json", o.autoloadPackageJson),
    ...(o.windows?.hideConsole === true ? ["--windows-hide-console"] : []),
    ...(o.windows?.icon === undefined ? [] : [`--windows-icon=${o.windows.icon}`]),
    ...(o.windows?.title === undefined ? [] : [`--windows-title=${o.windows.title}`]),
    ...(o.windows?.publisher === undefined ? [] : [`--windows-publisher=${o.windows.publisher}`]),
    ...(o.windows?.version === undefined ? [] : [`--windows-version=${o.windows.version}`]),
    ...(o.windows?.description === undefined ? [] : [`--windows-description=${o.windows.description}`]),
    ...(o.windows?.copyright === undefined ? [] : [`--windows-copyright=${o.windows.copyright}`]),
    `--outfile=${out}`,
    ...input.entrypoints,
  ];
};

const validPath = (value: string): boolean => value.length > 0 && !value.includes("\0");
const validate = Effect.fnUntraced(function*(entrypoints: readonly string[], output?: string) {
  if (entrypoints.length === 0 || entrypoints.some((entrypoint) => !validPath(entrypoint))) {
    return yield* new InputInvalid({ reason: "entrypoints must be non-empty paths without NUL" });
  }
  if (output !== undefined && !validPath(output)) {
    return yield* new InputInvalid({ reason: "output must be a non-empty path without NUL" });
  }
});

const outputPath = (output: string, cwd?: string) =>
  Effect.map(Path.Path, (p) => p.resolve(cwd ?? ".", output));

const checkBuildVersion = (tool: Tool.Resolved) => Tool.satisfies("1.4.1")(tool.version)
  ? Effect.fail(new InputInvalid({ reason: "Bun 1.4.1 has a reproduced variable-collision bug in emitted builds; use another version" }))
  : Effect.void;

/**
 * `bun build --compile` as an Effect. Verifies the produced binary's header
 * against the requested target before returning it.
 */
export const compile = Effect.fn("Bun.compile")(function*(
  input: CompileInput,
): Effect.fn.Return<
  Artifact.Executable,
  CompileError,
  Bun | FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> {
  yield* validate(input.entrypoints, input.outfile);
  const { tool } = yield* Bun;
  yield* checkBuildVersion(tool);
  const requested = input.target;
  const bunTarget = requested === undefined ? undefined : toBunTarget(requested);
  if (bunTarget !== undefined && !BunTarget.literals.includes(bunTarget)) {
    return yield* new InputInvalid({ reason: `unsupported Bun target: ${requested}` });
  }
  // Omit --target for a native build: Bun knows its own host ABI, even when our
  // orchestrator cannot establish libc (for example Bun on Alpine).
  const target = bunTarget === undefined ? undefined : toTarget(bunTarget);
  const suffix = target === undefined ? (process.platform === "win32" ? ".exe" : "") : Target.parts(target).executableSuffix;
  if (suffix !== "" && !input.outfile.endsWith(suffix)) {
    // Bun always names Windows outputs *.exe, so the caller's outfile must too.
    return yield* new InputInvalid({ reason: `outfile for ${target ?? "the Windows host"} must end with ${suffix}` });
  }
  const produce = (out: string) =>
    Tool.run(tool, renderArgv(input, out, bunTarget), { cwd: input.cwd, onOutput: input.onOutput }).pipe(
      Effect.andThen(Artifact.executable(out, Tool.producer(tool), target)),
    );
  const outfile = yield* outputPath(input.outfile, input.cwd);
  return yield* Commit.output(outfile, produce, { atomic: input.atomic });
});

export type Loader = "js" | "jsx" | "ts" | "tsx" | "json" | "toml" | "yaml" | "text" | "file"
  | "dataurl" | "base64" | "css" | "html" | "sqlite" | "wasm" | "napi";

export interface BundleOptions extends Omit<CompileOptions,
  "sourcemap" | "execArgv" | "autoloadDotenv" | "autoloadBunfig" | "autoloadTsconfig" | "autoloadPackageJson" | "windows"> {
  readonly target?: "browser" | "bun" | "node" | undefined;
  readonly format?: "esm" | "cjs" | "iife" | undefined;
  readonly sourcemap?: "linked" | "inline" | "external" | "none" | undefined;
  readonly splitting?: boolean | undefined;
  readonly publicPath?: string | undefined;
  readonly root?: string | undefined;
  readonly loader?: Readonly<Record<string, Loader>> | undefined;
  readonly naming?: { readonly entry?: string | undefined; readonly chunk?: string | undefined; readonly asset?: string | undefined } | undefined;
  readonly banner?: string | undefined;
  readonly footer?: string | undefined;
  readonly metafile?: string | undefined;
  readonly drop?: readonly string[] | undefined;
  readonly features?: readonly string[] | undefined;
  readonly tsconfig?: string | undefined;
  readonly reactFastRefresh?: boolean | undefined;
  readonly bundle?: boolean | undefined;
}

export interface BundleInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outdir: string;
  readonly cwd?: string | undefined;
  readonly options?: BundleOptions | undefined;
  readonly atomic?: boolean | undefined;
  readonly onOutput?: Tool.RunOptions["onOutput"] | undefined;
}

export interface BuildInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly cwd?: string | undefined;
  readonly onOutput?: Tool.RunOptions["onOutput"] | undefined;
  readonly options?: (Omit<BundleOptions, "bytecode" | "metafile" | "sourcemap" | "splitting"> & {
    readonly sourcemap?: "inline" | "none" | undefined;
  }) | undefined;
}

const renderBundleOptions = (o: BundleOptions): string[] => [
  ...(o.target === undefined ? [] : [`--target=${o.target}`]),
  ...(o.format === undefined ? [] : [`--format=${o.format}`]),
  ...(o.sourcemap === undefined ? [] : [`--sourcemap=${o.sourcemap}`]),
  ...(o.splitting === true ? ["--splitting"] : []),
  ...(o.packages === undefined ? [] : [`--packages=${o.packages}`]),
  ...(o.external ?? []).map((value) => `--external=${value}`),
  ...(o.conditions ?? []).map((value) => `--conditions=${value}`),
  ...(o.publicPath === undefined ? [] : [`--public-path=${o.publicPath}`]),
  ...(o.root === undefined ? [] : [`--root=${o.root}`]),
  ...Object.entries(o.define ?? {}).flatMap(([key, value]) => ["--define", `${key}=${value}`]),
  ...Object.entries(o.loader ?? {}).flatMap(([extension, loader]) => ["--loader", `${extension}:${loader}`]),
  ...(o.naming?.entry === undefined ? [] : [`--entry-naming=${o.naming.entry}`]),
  ...(o.naming?.chunk === undefined ? [] : [`--chunk-naming=${o.naming.chunk}`]),
  ...(o.naming?.asset === undefined ? [] : [`--asset-naming=${o.naming.asset}`]),
  ...renderMinify(o.minify),
  ...(o.bytecode === true ? ["--bytecode"] : []),
  ...(o.banner === undefined ? [] : [`--banner=${o.banner}`]),
  ...(o.footer === undefined ? [] : [`--footer=${o.footer}`]),
  ...(o.metafile === undefined ? [] : [`--metafile=${o.metafile}`]),
  ...(o.environmentInline === undefined ? [] : [`--env=${o.environmentInline}`]),
  ...(o.drop ?? []).flatMap((value) => ["--drop", value]),
  ...(o.features ?? []).flatMap((value) => ["--feature", value]),
  ...(o.tsconfig === undefined ? [] : ["--tsconfig-override", o.tsconfig]),
  ...(o.reactFastRefresh === true ? ["--react-fast-refresh"] : []),
  ...(o.bundle === false ? ["--no-bundle"] : []),
];

export const build = Effect.fn("Bun.build")(function*(input: BuildInput) {
  yield* validate(input.entrypoints);
  const { tool } = yield* Bun;
  yield* checkBuildVersion(tool);
  const result = yield* Tool.run(tool, ["build", ...renderBundleOptions(input.options ?? {}), ...input.entrypoints],
    { cwd: input.cwd, onOutput: input.onOutput, stdoutLimit: null });
  return result.stdout;
});

export const bundle = Effect.fn("Bun.bundle")(function*(input: BundleInput) {
  yield* validate(input.entrypoints, input.outdir);
  const { tool } = yield* Bun;
  yield* checkBuildVersion(tool);
  const outdir = yield* outputPath(input.outdir, input.cwd);
  const produce = (out: string) => Tool.run(tool,
    ["build", ...renderBundleOptions(input.options ?? {}), `--outdir=${out}`, ...input.entrypoints],
    { cwd: input.cwd, onOutput: input.onOutput }).pipe(
      Effect.andThen(Artifact.directory(out, Tool.producer(tool))),
    );
  return yield* Commit.output(outdir, produce, { atomic: input.atomic, staging: "sibling" });
});

export interface WatchInput extends Omit<BundleInput, "atomic" | "onOutput"> {
  readonly noClearScreen?: boolean | undefined;
  /** Inherit live diagnostics by default; use pipe to consume process streams. */
  readonly stdio?: "inherit" | "pipe" | undefined;
}

/** The caller owns the scope. Live diagnostics are inherited unless stdio is pipe. */
export const watch = Effect.fn("Bun.watch")(function*(input: WatchInput) {
  yield* validate(input.entrypoints, input.outdir);
  const { tool } = yield* Bun;
  yield* checkBuildVersion(tool);
  const outdir = yield* outputPath(input.outdir, input.cwd);
  const process = yield* ChildProcess.make(tool.path, ["build", "--watch",
    ...(input.noClearScreen === true ? ["--no-clear-screen"] : []),
    ...renderBundleOptions(input.options ?? {}), `--outdir=${outdir}`, ...input.entrypoints], {
    cwd: input.cwd,
    stdout: input.stdio ?? "inherit", stderr: input.stdio ?? "inherit",
    shell: false,
  }).pipe(Effect.mapError((e) => new Tool.SpawnFailed({ tool: tool.name, detail: String(e) })));
  return { tool, process, outdir };
});
