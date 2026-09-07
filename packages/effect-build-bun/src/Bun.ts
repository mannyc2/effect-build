import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Target, Tool } from "effect-build";

export class Bun extends Context.Service<Bun, { readonly tool: Tool.Resolved }>()("effect-build-bun/Bun") {}

export interface LayerOptions {
  /** Use this binary instead of searching PATH. */
  readonly executable?: string;
  /** Accept these versions: a range string or predicate. Default: `tested`. */
  readonly version?: string | ((version: string) => boolean);
}

/** 1.4.0 is unreviewed; 1.4.1 reproduces a variable collision in emitted programs. */
export const tested = ">=1.3.14 <1.4.0 || >=1.4.2 <1.5.0";

export const layer = (
  options: LayerOptions = {},
): Layer.Layer<
  Bun,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    Bun,
    Tool.resolve({ name: "bun", ...(options.executable === undefined ? {} : { executable: options.executable }) }).pipe(
      Tool.requireVersion(options.version ?? tested),
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
  readonly syntax?: boolean;
  readonly whitespace?: boolean;
  readonly identifiers?: boolean;
  readonly keepNames?: boolean;
}

export interface CompileOptions {
  readonly minify?: boolean | MinifyOptions;
  readonly sourcemap?: "inline" | "none";
  readonly bytecode?: boolean;
  readonly packages?: "bundle" | "external";
  readonly external?: readonly string[];
  readonly conditions?: readonly string[];
  readonly define?: Readonly<Record<string, string>>;
  readonly environmentInline?: "inline" | "disable" | `${string}*`;
  readonly execArgv?: readonly string[];
  readonly autoloadDotenv?: boolean;
  readonly autoloadBunfig?: boolean;
  readonly autoloadTsconfig?: boolean;
  readonly autoloadPackageJson?: boolean;
  readonly windows?: {
    readonly hideConsole?: boolean;
    readonly icon?: string;
    readonly title?: string;
    readonly publisher?: string;
    readonly version?: string;
    readonly description?: string;
    readonly copyright?: string;
  };
}

export interface CompileInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outfile: string;
  /** Default: the host. */
  readonly target?: Target.Target | BunTarget;
  readonly cwd?: string;
  readonly options?: CompileOptions;
  /** Build into a sibling temp path and rename into place. Default true. */
  readonly atomic?: boolean;
}

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("BunInputInvalid", { reason: Schema.String }) {}

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

const renderArgv = (input: CompileInput, out: string, target: BunTarget): string[] => {
  const o = input.options ?? {};
  return [
    "build", "--compile", `--target=${target}`,
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
const validate = (entrypoints: readonly string[], output?: string) =>
  Effect.gen(function*() {
    if (entrypoints.length === 0 || entrypoints.some((entrypoint) => !validPath(entrypoint))) {
      return yield* new InputInvalid({ reason: "entrypoints must be non-empty paths without NUL" });
    }
    if (output !== undefined && !validPath(output)) {
      return yield* new InputInvalid({ reason: "output must be a non-empty path without NUL" });
    }
  });

const outputPath = (output: string, cwd?: string) =>
  Effect.map(Path.Path, (p) => p.resolve(cwd ?? ".", output));

/**
 * `bun build --compile` as an Effect. Verifies the produced binary's header
 * against the requested target before returning it.
 */
export const compile = (
  input: CompileInput,
): Effect.Effect<
  Artifact.Executable,
  CompileError,
  Bun | FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    yield* validate(input.entrypoints, input.outfile);
    const { tool } = yield* Bun;
    const requested = input.target ?? Target.host();
    if (requested === undefined) return yield* new InputInvalid({ reason: "unsupported host; pass target" });
    const bunTarget = toBunTarget(requested);
    if (!BunTarget.literals.includes(bunTarget)) {
      return yield* new InputInvalid({ reason: `unsupported Bun target: ${requested}` });
    }
    const target = toTarget(bunTarget);
    const suffix = Target.parts(target).executableSuffix;
    if (suffix !== "" && !input.outfile.endsWith(suffix)) {
      // Bun always names Windows outputs *.exe, so the caller's outfile must too.
      return yield* new InputInvalid({ reason: `outfile for ${target} must end with ${suffix}` });
    }
    const produce = (out: string) =>
      Effect.gen(function*() {
        yield* Tool.run(tool, renderArgv(input, out, bunTarget), input.cwd === undefined ? {} : { cwd: input.cwd });
        return yield* Artifact.executable(out, Tool.producer(tool), target);
      });
    const outfile = yield* outputPath(input.outfile, input.cwd);
    return input.atomic === false ? yield* produce(outfile) : yield* Commit.atomic(outfile, produce);
  });

export type Loader = "js" | "jsx" | "ts" | "tsx" | "json" | "toml" | "yaml" | "text" | "file"
  | "dataurl" | "base64" | "css" | "html" | "sqlite" | "wasm" | "napi";

export interface BundleOptions extends Omit<CompileOptions,
  "sourcemap" | "execArgv" | "autoloadDotenv" | "autoloadBunfig" | "autoloadTsconfig" | "autoloadPackageJson" | "windows"> {
  readonly target?: "browser" | "bun" | "node";
  readonly format?: "esm" | "cjs" | "iife";
  readonly sourcemap?: "linked" | "inline" | "external" | "none";
  readonly splitting?: boolean;
  readonly publicPath?: string;
  readonly root?: string;
  readonly loader?: Readonly<Record<string, Loader>>;
  readonly naming?: { readonly entry?: string; readonly chunk?: string; readonly asset?: string };
  readonly banner?: string;
  readonly footer?: string;
  readonly metafile?: string;
  readonly drop?: readonly string[];
  readonly features?: readonly string[];
  readonly tsconfig?: string;
  readonly reactFastRefresh?: boolean;
  readonly bundle?: boolean;
}

export interface BundleInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outdir: string;
  readonly cwd?: string;
  readonly options?: BundleOptions;
  readonly atomic?: boolean;
}

export interface BuildInput {
  readonly entrypoints: readonly [string, ...string[]];
  readonly cwd?: string;
  readonly options?: Omit<BundleOptions, "bytecode" | "metafile" | "sourcemap" | "splitting"> & {
    readonly sourcemap?: "inline" | "none";
  };
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

export const build = (input: BuildInput) =>
  Effect.gen(function*() {
    yield* validate(input.entrypoints);
    const { tool } = yield* Bun;
    const result = yield* Tool.run(tool, ["build", ...renderBundleOptions(input.options ?? {}), ...input.entrypoints],
      input.cwd === undefined ? {} : { cwd: input.cwd });
    return result.stdout;
  });

export const bundle = (input: BundleInput) =>
  Effect.gen(function*() {
    yield* validate(input.entrypoints, input.outdir);
    const { tool } = yield* Bun;
    const outdir = yield* outputPath(input.outdir, input.cwd);
    const produce = (out: string) =>
      Effect.gen(function*() {
        yield* Tool.run(tool,
          ["build", ...renderBundleOptions(input.options ?? {}), `--outdir=${out}`, ...input.entrypoints],
          input.cwd === undefined ? {} : { cwd: input.cwd });
        return yield* Artifact.directory(out, Tool.producer(tool));
      });
    return input.atomic === false ? yield* produce(outdir) : yield* Commit.atomic(outdir, produce);
  });

export interface WatchInput extends Omit<BundleInput, "atomic"> {
  readonly noClearScreen?: boolean;
}

/** The caller owns the scope and drains the child's stdout/stderr streams. */
export const watch = (input: WatchInput) =>
  Effect.gen(function*() {
    yield* validate(input.entrypoints, input.outdir);
    const { tool } = yield* Bun;
    const outdir = yield* outputPath(input.outdir, input.cwd);
    const process = yield* ChildProcess.make(tool.path, ["build", "--watch",
      ...(input.noClearScreen === true ? ["--no-clear-screen"] : []),
      ...renderBundleOptions(input.options ?? {}), `--outdir=${outdir}`, ...input.entrypoints], {
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      shell: false,
    }).pipe(Effect.mapError((e) => new Tool.SpawnFailed({ name: tool.name, detail: String(e) })));
    return { tool, process, outdir };
  });
