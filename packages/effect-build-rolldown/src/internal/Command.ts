import { Effect } from "effect";
import { RolldownCommandInputInvalid } from "./CommandError.js";

export type Format = "esm" | "cjs" | "iife";
export type Platform = "node" | "browser" | "neutral";

export interface Environment {
  readonly values: Readonly<Record<string, string | undefined>>;
  readonly inherit?: boolean;
}

export interface InvocationOptions {
  readonly cwd?: string;
  readonly environment?: Environment;
}

export interface Options extends InvocationOptions {
  readonly config?: string;
  readonly configLoader?: "bundle" | "native";
  readonly format?: Format;
  readonly platform?: Platform;
  readonly external?: readonly string[];
  readonly globals?: Readonly<Record<string, string>>;
  readonly minify?: boolean;
  readonly name?: string;
  readonly sourcemap?: boolean | "inline" | "hidden";
  readonly tsconfig?: string;
  readonly cleanDir?: boolean;
  readonly entryFileNames?: string;
  readonly chunkFileNames?: string;
  readonly assetFileNames?: string;
  readonly logLevel?: "silent" | "info" | "debug" | "warn";
}

export interface StdoutInput extends Options {
  readonly input: string;
}

export interface DirectoryInput extends Options {
  readonly inputs: readonly [string, ...string[]];
  readonly directory: string;
}

const renderOptions = (input: Options): readonly string[] => [
  ...(input.config === undefined ? [] : ["--config", input.config]),
  ...(input.configLoader === undefined ? [] : ["--configLoader", input.configLoader]),
  ...(input.format === undefined ? [] : ["--format", input.format]),
  ...(input.platform === undefined ? [] : ["--platform", input.platform]),
  ...(input.external === undefined ? [] : ["--external", input.external.join(",")]),
  ...(Object.keys(input.globals ?? {}).length === 0
    ? []
    : ["--globals", Object.entries(input.globals ?? {}).map(([key, value]) => `${key}:${value}`).join(",")]),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.name === undefined ? [] : ["--name", input.name]),
  ...(input.sourcemap === undefined || input.sourcemap === false
    ? []
    : input.sourcemap === true
    ? ["--sourcemap"]
    : ["--sourcemap", input.sourcemap]),
  ...(input.tsconfig === undefined ? [] : ["--tsconfig", input.tsconfig]),
  ...(input.cleanDir === true ? ["--cleanDir"] : []),
  ...(input.entryFileNames === undefined ? [] : ["--entryFileNames", input.entryFileNames]),
  ...(input.chunkFileNames === undefined ? [] : ["--chunkFileNames", input.chunkFileNames]),
  ...(input.assetFileNames === undefined ? [] : ["--assetFileNames", input.assetFileNames]),
  ...(input.logLevel === undefined ? [] : ["--logLevel", input.logLevel]),
];

export const renderStdoutArgv = (input: StdoutInput): readonly string[] => [input.input, ...renderOptions(input)];

export const renderDirectoryArgv = (input: DirectoryInput, watch = false): readonly string[] => [
  ...input.inputs,
  "--dir",
  input.directory,
  ...(watch ? ["--watch"] : []),
  ...renderOptions(input),
];

export const validateValue = (
  operation: "bundle" | "bundleToDirectory" | "watch",
  value: string,
  label: string,
): Effect.Effect<void, RolldownCommandInputInvalid> =>
  value.length > 0 && !value.includes("\0")
    ? Effect.void
    : Effect.fail(
      new RolldownCommandInputInvalid({
        operation,
        reason: `${label} must be non-empty and contain no NUL`,
      }),
    );
