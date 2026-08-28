import { Effect } from "effect";
import { EsbuildCommandInputInvalid } from "./CommandError.js";

export type Format = "iife" | "cjs" | "esm";
export type Platform = "browser" | "node" | "neutral";
export type Sourcemap = boolean | "linked" | "external" | "inline";

export interface Environment {
  readonly values: Readonly<Record<string, string | undefined>>;
  readonly inherit?: boolean;
}

export interface InvocationOptions {
  readonly cwd?: string;
  readonly environment?: Environment;
}

export interface Options extends InvocationOptions {
  readonly bundle?: boolean;
  readonly format?: Format;
  readonly platform?: Platform;
  readonly target?: string | readonly string[];
  readonly minify?: boolean;
  readonly sourcemap?: Sourcemap;
  readonly splitting?: boolean;
  readonly external?: readonly string[];
  readonly define?: Readonly<Record<string, string>>;
  readonly loader?: Readonly<Record<string, string>>;
  readonly inject?: readonly string[];
  readonly packages?: "bundle" | "external";
  readonly publicPath?: string;
  readonly tsconfig?: string;
  readonly metafile?: string;
  readonly outbase?: string;
  readonly entryNames?: string;
  readonly chunkNames?: string;
  readonly assetNames?: string;
  readonly allowOverwrite?: boolean;
  readonly logLevel?: "verbose" | "debug" | "info" | "warning" | "error" | "silent";
}

export interface StdoutInput extends Options {
  readonly entrypoint: string;
}

export interface DirectoryInput extends Options {
  readonly entrypoints: readonly [string, ...string[]];
  readonly directory: string;
}

export interface WatchInput extends Options {
  readonly entrypoints: readonly [string, ...string[]];
  readonly output:
    | { readonly _tag: "Outfile"; readonly path: string }
    | { readonly _tag: "Outdir"; readonly path: string };
}

export interface ServeInput extends WatchInput {
  readonly host?: string;
  readonly port?: number;
  readonly servedir?: string;
  readonly fallback?: string;
  readonly corsOrigins?: readonly string[];
}

const values = (items: readonly string[] | undefined, prefix: string): readonly string[] =>
  (items ?? []).map((value) => `${prefix}${value}`);

const renderOptions = (input: Options): readonly string[] => [
  ...(input.bundle === true ? ["--bundle"] : []),
  ...(input.format === undefined ? [] : [`--format=${input.format}`]),
  ...(input.platform === undefined ? [] : [`--platform=${input.platform}`]),
  ...(input.target === undefined
    ? []
    : [`--target=${typeof input.target === "string" ? input.target : input.target.join(",")}`]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.sourcemap === undefined || input.sourcemap === false
    ? []
    : [input.sourcemap === true ? "--sourcemap" : `--sourcemap=${input.sourcemap}`]),
  ...(input.splitting === true ? ["--splitting"] : []),
  ...values(input.external, "--external:"),
  ...Object.entries(input.define ?? {}).map(([key, value]) => `--define:${key}=${value}`),
  ...Object.entries(input.loader ?? {}).map(([extension, loader]) => `--loader:${extension}=${loader}`),
  ...values(input.inject, "--inject:"),
  ...(input.packages === undefined ? [] : [`--packages=${input.packages}`]),
  ...(input.publicPath === undefined ? [] : [`--public-path=${input.publicPath}`]),
  ...(input.tsconfig === undefined ? [] : [`--tsconfig=${input.tsconfig}`]),
  ...(input.metafile === undefined ? [] : [`--metafile=${input.metafile}`]),
  ...(input.outbase === undefined ? [] : [`--outbase=${input.outbase}`]),
  ...(input.entryNames === undefined ? [] : [`--entry-names=${input.entryNames}`]),
  ...(input.chunkNames === undefined ? [] : [`--chunk-names=${input.chunkNames}`]),
  ...(input.assetNames === undefined ? [] : [`--asset-names=${input.assetNames}`]),
  ...(input.allowOverwrite === true ? ["--allow-overwrite"] : []),
  ...(input.logLevel === undefined ? [] : [`--log-level=${input.logLevel}`]),
];

export const renderStdoutArgv = (input: StdoutInput): readonly string[] => [
  ...renderOptions(input),
  input.entrypoint,
];

export const renderDirectoryArgv = (input: DirectoryInput): readonly string[] => [
  ...renderOptions(input),
  `--outdir=${input.directory}`,
  ...input.entrypoints,
];

export const renderWatchArgv = (input: WatchInput): readonly string[] => [
  ...renderOptions(input),
  input.output._tag === "Outfile" ? `--outfile=${input.output.path}` : `--outdir=${input.output.path}`,
  ...input.entrypoints,
];

export const valuesWithPrefix = values;

export const validateWatchOutput = (
  operation: "watch" | "serve",
  output: WatchInput["output"],
): Effect.Effect<void, EsbuildCommandInputInvalid> =>
  output._tag === "Outfile" || output._tag === "Outdir"
    ? validateValue(operation, output.path, "output path")
    : Effect.fail(
      new EsbuildCommandInputInvalid({
        operation,
        reason: "output._tag must be Outfile or Outdir",
      }),
    );

export const validateValue = (
  operation: "build" | "buildToDirectory" | "watch" | "serve",
  value: string,
  label: string,
): Effect.Effect<void, EsbuildCommandInputInvalid> =>
  value.length > 0 && !value.includes("\0")
    ? Effect.void
    : Effect.fail(
      new EsbuildCommandInputInvalid({
        operation,
        reason: `${label} must be non-empty and contain no NUL`,
      }),
    );
