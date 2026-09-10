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
  readonly allowAll?: boolean | undefined;
  readonly permissionSet?: true | string | undefined;
  readonly noPrompt?: boolean | undefined;
  readonly allowRead?: PermissionValue | undefined;
  readonly allowWrite?: PermissionValue | undefined;
  readonly allowNet?: PermissionValue | undefined;
  readonly allowEnv?: PermissionValue | undefined;
  readonly allowRun?: PermissionValue | undefined;
  readonly allowFfi?: PermissionValue | undefined;
  readonly allowSys?: PermissionValue | undefined;
  readonly allowImport?: PermissionValue | undefined;
  readonly denyRead?: PermissionValue | undefined;
  readonly denyWrite?: PermissionValue | undefined;
  readonly denyNet?: PermissionValue | undefined;
  readonly denyEnv?: PermissionValue | undefined;
  readonly denyRun?: PermissionValue | undefined;
  readonly denyFfi?: PermissionValue | undefined;
  readonly denySys?: PermissionValue | undefined;
  readonly denyImport?: PermissionValue | undefined;
  readonly ignoreRead?: PermissionValue | undefined;
  readonly ignoreEnv?: PermissionValue | undefined;
}

export interface Options extends ProjectOptions, Permissions {
  readonly cachedOnly?: boolean | undefined;
  readonly check?: Check | undefined;
  readonly quiet?: boolean | undefined;
  readonly allowScripts?: true | readonly [string, ...string[]] | undefined;
  readonly envFile?: true | string | undefined;
  readonly ext?: "ts" | "tsx" | "js" | "jsx" | "mts" | "mjs" | "cts" | "cjs" | undefined;
  readonly location?: string | undefined;
  readonly preload?: readonly string[] | undefined;
  readonly require?: readonly string[] | undefined;
  readonly seed?: number | undefined;
  readonly v8Flags?: readonly string[] | undefined;
  readonly noCodeCache?: boolean | undefined;
  readonly appName?: string | undefined;
  readonly bundle?: boolean | undefined;
  readonly minify?: boolean | undefined;
  readonly engine?: "v8" | "quickjs" | undefined;
  readonly exclude?: readonly string[] | undefined;
  readonly excludeUnusedNpm?: boolean | undefined;
  readonly icon?: string | undefined;
  readonly include?: readonly string[] | undefined;
  readonly noTerminal?: boolean | undefined;
  readonly selfExtracting?: boolean | undefined;
}

export interface Input extends Options {
  readonly entrypoint: string;
  readonly scriptArgs?: readonly string[] | undefined;
  readonly target?: Target | undefined;
}

const systemTargets = {
  "x86_64-unknown-linux-gnu": "linux-x64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-pc-windows-msvc": "windows-x64",
  "aarch64-pc-windows-msvc": "windows-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "aarch64-apple-darwin": "darwin-arm64",
} satisfies Record<Target, CoreTarget>;

export const systemTarget = (target: Target): CoreTarget => systemTargets[target];

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
  watch: false | { readonly noClearScreen?: boolean | undefined; readonly watchExclude?: readonly string[] | undefined } = false,
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

export const validateOptions = Effect.fnUntraced(function*(operation: string, input: Options): Effect.fn.Return<void, InputInvalid> {
  for (const [, field] of permissionFields) {
    yield* validatePermission(operation, field, input[field]);
  }
  yield* validatePermission(operation, "allowScripts", input.allowScripts);
});
