import { Effect } from "effect";
import { BunCommandInputInvalid } from "./CommandError.js";
import type { InvocationOptions } from "./Runtime.js";

export type Target = "browser" | "bun" | "node";
export type Format = "esm" | "cjs" | "iife";
export type Sourcemap = "linked" | "inline" | "external" | "none";
export type Loader =
  | "js"
  | "jsx"
  | "ts"
  | "tsx"
  | "json"
  | "toml"
  | "yaml"
  | "text"
  | "file"
  | "dataurl"
  | "base64"
  | "css"
  | "html"
  | "sqlite"
  | "wasm"
  | "napi";

export interface MinifyOptions {
  readonly syntax?: boolean;
  readonly whitespace?: boolean;
  readonly identifiers?: boolean;
  readonly keepNames?: boolean;
}

export interface NamingOptions {
  readonly entry?: string;
  readonly chunk?: string;
  readonly asset?: string;
}

export interface Options extends InvocationOptions {
  readonly target?: Target;
  readonly format?: Format;
  readonly sourcemap?: Sourcemap;
  readonly splitting?: boolean;
  readonly packages?: "bundle" | "external";
  readonly external?: readonly string[];
  readonly conditions?: readonly string[];
  readonly publicPath?: string;
  readonly root?: string;
  readonly define?: Readonly<Record<string, string>>;
  readonly loader?: Readonly<Record<string, Loader>>;
  readonly naming?: NamingOptions;
  readonly minify?: boolean | MinifyOptions;
  readonly bytecode?: boolean;
  readonly banner?: string;
  readonly footer?: string;
  readonly metafile?: string;
  readonly environmentInline?: "inline" | "disable" | `${string}*`;
  readonly drop?: readonly string[];
  readonly features?: readonly string[];
  readonly tsconfig?: string;
  readonly reactFastRefresh?: boolean;
  readonly bundle?: boolean;
}

export interface BuildInput extends Omit<Options, "bytecode" | "metafile" | "sourcemap" | "splitting"> {
  readonly entrypoint: string;
  readonly bytecode?: false;
  readonly metafile?: never;
  readonly sourcemap?: "inline" | "none";
  readonly splitting?: false;
}

export interface BuildToDirectoryInput extends Options {
  readonly entrypoints: readonly [string, ...string[]];
  readonly outdir: string;
}

export interface WatchInput extends BuildToDirectoryInput {
  readonly noClearScreen?: boolean;
}

const strings = (values: readonly string[] | undefined, flag: string): readonly string[] =>
  (values ?? []).flatMap((value) => [flag, value]);

const renderOptions = (input: Options): readonly string[] => {
  const minify = input.minify;
  return [
    ...(input.target === undefined ? [] : [`--target=${input.target}`]),
    ...(input.format === undefined ? [] : [`--format=${input.format}`]),
    ...(input.sourcemap === undefined ? [] : [`--sourcemap=${input.sourcemap}`]),
    ...(input.splitting === true ? ["--splitting"] : []),
    ...(input.packages === undefined ? [] : [`--packages=${input.packages}`]),
    ...(input.external ?? []).map((value) => `--external=${value}`),
    ...(input.conditions ?? []).map((value) => `--conditions=${value}`),
    ...(input.publicPath === undefined ? [] : [`--public-path=${input.publicPath}`]),
    ...(input.root === undefined ? [] : [`--root=${input.root}`]),
    ...Object.entries(input.define ?? {}).flatMap(([key, value]) => ["--define", `${key}=${value}`]),
    ...Object.entries(input.loader ?? {}).flatMap(([extension, loader]) => ["--loader", `${extension}:${loader}`]),
    ...(input.naming?.entry === undefined ? [] : [`--entry-naming=${input.naming.entry}`]),
    ...(input.naming?.chunk === undefined ? [] : [`--chunk-naming=${input.naming.chunk}`]),
    ...(input.naming?.asset === undefined ? [] : [`--asset-naming=${input.naming.asset}`]),
    ...(minify === true ? ["--minify"] : []),
    ...(typeof minify === "object" && minify.syntax === true ? ["--minify-syntax"] : []),
    ...(typeof minify === "object" && minify.whitespace === true ? ["--minify-whitespace"] : []),
    ...(typeof minify === "object" && minify.identifiers === true ? ["--minify-identifiers"] : []),
    ...(typeof minify === "object" && minify.keepNames === true ? ["--keep-names"] : []),
    ...(input.bytecode === true ? ["--bytecode"] : []),
    ...(input.banner === undefined ? [] : [`--banner=${input.banner}`]),
    ...(input.footer === undefined ? [] : [`--footer=${input.footer}`]),
    ...(input.metafile === undefined ? [] : [`--metafile=${input.metafile}`]),
    ...(input.environmentInline === undefined ? [] : [`--env=${input.environmentInline}`]),
    ...strings(input.drop, "--drop"),
    ...strings(input.features, "--feature"),
    ...(input.tsconfig === undefined ? [] : ["--tsconfig-override", input.tsconfig]),
    ...(input.reactFastRefresh === true ? ["--react-fast-refresh"] : []),
    ...(input.bundle === false ? ["--no-bundle"] : []),
  ];
};

export const buildArgv = (input: BuildInput): readonly string[] => [
  "build",
  ...renderOptions(input),
  input.entrypoint,
];

export const directoryArgv = (
  input: BuildToDirectoryInput,
  watch = false,
  noClearScreen = false,
): readonly string[] => [
  "build",
  ...(watch ? ["--watch"] : []),
  ...(watch && noClearScreen ? ["--no-clear-screen"] : []),
  ...renderOptions(input),
  `--outdir=${input.outdir}`,
  ...input.entrypoints,
];

const validPath = (value: string): boolean => value.length > 0 && !value.includes("\0");

export const validateBuild = (input: BuildInput): Effect.Effect<void, BunCommandInputInvalid> =>
  validPath(input.entrypoint)
    ? Effect.void
    : Effect.fail(
      new BunCommandInputInvalid({
        operation: "build",
        reason: "entrypoint must be non-empty and contain no NUL",
      }),
    );

export const validateDirectory = (
  input: BuildToDirectoryInput,
): Effect.Effect<void, BunCommandInputInvalid> => {
  if (!validPath(input.outdir)) {
    return Effect.fail(
      new BunCommandInputInvalid({
        operation: "buildToDirectory",
        reason: "outdir must be non-empty and contain no NUL",
      }),
    );
  }
  if (input.entrypoints.length === 0 || input.entrypoints.some((entrypoint) => !validPath(entrypoint))) {
    return Effect.fail(
      new BunCommandInputInvalid({
        operation: "buildToDirectory",
        reason: "entrypoints must be a non-empty list of non-empty paths without NUL",
      }),
    );
  }
  return Effect.void;
};
