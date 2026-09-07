import { Effect, Schema } from "effect";
import type { Target as CoreTarget } from "effect-build/Target";
import { InputInvalid } from "../InputInvalid.js";
import {
  type Check,
  type PermissionValue,
  type ProjectOptions,
  renderCheck,
  renderPermission,
  renderProject,
  validatePath,
  validatePermission,
} from "./Options.js";

export const Target = Schema.Literals(
  [
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
    "aarch64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
  ] as const,
);
export type Target = typeof Target.Type;

export interface Permissions {
  readonly allowAll?: boolean;
  readonly permissionSet?: true | string;
  readonly noPrompt?: boolean;
  readonly allowRead?: PermissionValue;
  readonly allowWrite?: PermissionValue;
  readonly allowNet?: PermissionValue;
  readonly allowEnv?: PermissionValue;
  readonly allowRun?: PermissionValue;
  readonly allowFfi?: PermissionValue;
  readonly allowSys?: PermissionValue;
  readonly allowImport?: PermissionValue;
  readonly denyRead?: PermissionValue;
  readonly denyWrite?: PermissionValue;
  readonly denyNet?: PermissionValue;
  readonly denyEnv?: PermissionValue;
  readonly denyRun?: PermissionValue;
  readonly denyFfi?: PermissionValue;
  readonly denySys?: PermissionValue;
  readonly denyImport?: PermissionValue;
  readonly ignoreRead?: PermissionValue;
  readonly ignoreEnv?: PermissionValue;
}

export interface Options extends ProjectOptions, Permissions {
  readonly cachedOnly?: boolean;
  readonly check?: Check;
  readonly quiet?: boolean;
  readonly allowScripts?: true | readonly [string, ...string[]];
  readonly envFile?: true | string;
  readonly ext?: "ts" | "tsx" | "js" | "jsx" | "mts" | "mjs" | "cts" | "cjs";
  readonly location?: string;
  readonly preload?: readonly string[];
  readonly require?: readonly string[];
  readonly seed?: number;
  readonly v8Flags?: readonly string[];
  readonly noCodeCache?: boolean;
  readonly appName?: string;
  readonly bundle?: boolean;
  readonly minify?: boolean;
  readonly engine?: "v8" | "quickjs";
  readonly exclude?: readonly string[];
  readonly excludeUnusedNpm?: boolean;
  readonly icon?: string;
  readonly include?: readonly string[];
  readonly noTerminal?: boolean;
  readonly selfExtracting?: boolean;
}

export interface Input extends Options {
  readonly entrypoint: string;
  readonly scriptArgs?: readonly string[];
  readonly outfile: string;
  readonly target?: Target;
}

const targetSet = new Set<string>(Target.literals);

export const systemTarget = (target: Target): CoreTarget => {
  switch (target) {
    case "x86_64-unknown-linux-gnu":
      return "linux-x64";
    case "aarch64-unknown-linux-gnu":
      return "linux-arm64";
    case "x86_64-pc-windows-msvc":
      return "windows-x64";
    case "aarch64-pc-windows-msvc":
      return "windows-arm64";
    case "x86_64-apple-darwin":
      return "darwin-x64";
    case "aarch64-apple-darwin":
      return "darwin-arm64";
  }
};

const permissionFields = [
  ["allow-read", "allowRead"],
  ["allow-write", "allowWrite"],
  ["allow-net", "allowNet"],
  ["allow-env", "allowEnv"],
  ["allow-run", "allowRun"],
  ["allow-ffi", "allowFfi"],
  ["allow-sys", "allowSys"],
  ["allow-import", "allowImport"],
  ["deny-read", "denyRead"],
  ["deny-write", "denyWrite"],
  ["deny-net", "denyNet"],
  ["deny-env", "denyEnv"],
  ["deny-run", "denyRun"],
  ["deny-ffi", "denyFfi"],
  ["deny-sys", "denySys"],
  ["deny-import", "denyImport"],
  ["ignore-read", "ignoreRead"],
  ["ignore-env", "ignoreEnv"],
] as const;

const renderPermissions = (input: Permissions): readonly string[] => [
  ...(input.allowAll === true ? ["--allow-all"] : []),
  ...(input.permissionSet === undefined
    ? []
    : [input.permissionSet === true ? "--permission-set" : `--permission-set=${input.permissionSet}`]),
  ...(input.noPrompt === true ? ["--no-prompt"] : []),
  ...permissionFields.flatMap(([flag, field]) => renderPermission(flag, input[field])),
];

const renderOptions = (input: Options): readonly string[] => [
  ...renderProject(input),
  ...(input.cachedOnly === true ? ["--cached-only"] : []),
  ...renderCheck(input.check),
  ...renderPermissions(input),
  ...renderPermission("allow-scripts", input.allowScripts),
  ...(input.envFile === undefined ? [] : [input.envFile === true ? "--env-file" : `--env-file=${input.envFile}`]),
  ...(input.quiet === true ? ["--quiet"] : []),
  ...(input.ext === undefined ? [] : ["--ext", input.ext]),
  ...(input.location === undefined ? [] : ["--location", input.location]),
  ...(input.preload ?? []).flatMap((file) => ["--preload", file]),
  ...(input.require ?? []).flatMap((file) => ["--require", file]),
  ...(input.seed === undefined ? [] : ["--seed", `${input.seed}`]),
  ...(input.v8Flags === undefined ? [] : [`--v8-flags=${input.v8Flags.join(",")}`]),
  ...(input.noCodeCache === true ? ["--no-code-cache"] : []),
  ...(input.appName === undefined ? [] : ["--app-name", input.appName]),
  ...(input.bundle === true ? ["--bundle"] : []),
  ...(input.minify === true ? ["--minify"] : []),
  ...(input.engine === undefined ? [] : ["--engine", input.engine]),
  ...(input.exclude ?? []).flatMap((value) => ["--exclude", value]),
  ...(input.excludeUnusedNpm === true ? ["--exclude-unused-npm"] : []),
  ...(input.icon === undefined ? [] : ["--icon", input.icon]),
  ...(input.include ?? []).flatMap((value) => ["--include", value]),
  ...(input.noTerminal === true ? ["--no-terminal"] : []),
  ...(input.selfExtracting === true ? ["--self-extracting"] : []),
];

export const renderArgv = (
  input: Input,
  output: string,
  watch: false | { readonly noClearScreen?: boolean; readonly watchExclude?: readonly string[] } = false,
): readonly string[] => [
  "compile",
  ...(watch === false ? [] : ["--watch"]),
  ...(watch !== false && watch.noClearScreen === true ? ["--no-clear-screen"] : []),
  ...(watch === false ? [] : (watch.watchExclude ?? []).map((value) => `--watch-exclude=${value}`)),
  ...renderOptions(input),
  ...(input.target === undefined ? [] : ["--target", input.target]),
  "--output",
  output,
  input.entrypoint,
  ...(input.scriptArgs ?? []),
];

const validatePermissionLists = (
  operation: "compile" | "watch",
  input: Options,
): Effect.Effect<void, InputInvalid> =>
  Effect.gen(function*() {
    for (const [, field] of permissionFields) {
      yield* validatePermission(operation, field, input[field]);
    }
    yield* validatePermission(operation, "allowScripts", input.allowScripts);
  });

const validateCommon = (
  operation: "compile" | "watch",
  input: Input,
): Effect.Effect<void, InputInvalid> =>
  Effect.gen(function*() {
    yield* validatePath(operation, "entrypoint", input.entrypoint);
    yield* validatePath(operation, "outfile", input.outfile);
    yield* validatePermissionLists(operation, input);
    if (input.target !== undefined && !targetSet.has(input.target)) {
      return yield* new InputInvalid({
        operation,
        reason: `unsupported Deno 2.9.5 target: ${String(input.target)}`,
      });
    }
  });

export const validateInput = (
  input: Input,
): Effect.Effect<void, InputInvalid> =>
  validateCommon("compile", input);
