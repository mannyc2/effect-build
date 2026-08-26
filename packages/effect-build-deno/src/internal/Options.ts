import { Effect } from "effect";
import { DenoCommandInputInvalid } from "./CommandError.js";
import type { InvocationOptions } from "./Runtime.js";

export type PermissionValue = true | readonly [string, ...string[]];
export type Check = false | true | "all" | "remote";
export type NodeModulesDir = "auto" | "manual" | "none";
export type NodeModulesLinker = "isolated" | "hoisted";

export interface ProjectOptions extends InvocationOptions {
  /** undefined preserves native config discovery; false renders --no-config. */
  readonly config?: string | false;
  readonly importMap?: string;
  /** undefined preserves discovery, false disables, true selects the default deno.lock. */
  readonly lock?: string | boolean;
  readonly frozen?: boolean;
  readonly noNpm?: boolean;
  readonly noRemote?: boolean;
  readonly nodeModulesDir?: NodeModulesDir;
  readonly nodeModulesLinker?: NodeModulesLinker;
  readonly reload?: true | readonly [string, ...string[]];
  readonly vendor?: boolean;
  readonly cert?: string;
  readonly conditions?: readonly [string, ...string[]];
  readonly minimumDependencyAge?: string;
}

export interface ImportPermissions {
  readonly allowImport?: PermissionValue;
  readonly denyImport?: PermissionValue;
}

export const renderPermission = (name: string, value: PermissionValue | undefined): readonly string[] =>
  value === undefined ? [] : [value === true ? `--${name}` : `--${name}=${value.join(",")}`];

export const validatePermission = (
  operation: string,
  field: string,
  value: PermissionValue | undefined,
): Effect.Effect<void, DenoCommandInputInvalid> =>
  Array.isArray(value) && value.length === 0
    ? Effect.fail(
      new DenoCommandInputInvalid({
        operation,
        reason: `${field} must be true or a non-empty list`,
      }),
    )
    : Effect.void;

export const renderProject = (input: ProjectOptions): readonly string[] => [
  ...(input.config === undefined ? [] : input.config === false ? ["--no-config"] : ["--config", input.config]),
  ...(input.importMap === undefined ? [] : ["--import-map", input.importMap]),
  ...(input.lock === undefined
    ? []
    : input.lock === false
    ? ["--no-lock"]
    : input.lock === true
    ? ["--lock"]
    : ["--lock", input.lock]),
  ...(input.frozen === undefined ? [] : [input.frozen ? "--frozen" : "--frozen=false"]),
  ...(input.noNpm === true ? ["--no-npm"] : []),
  ...(input.noRemote === true ? ["--no-remote"] : []),
  ...(input.nodeModulesDir === undefined ? [] : [`--node-modules-dir=${input.nodeModulesDir}`]),
  ...(input.nodeModulesLinker === undefined ? [] : [`--node-modules-linker=${input.nodeModulesLinker}`]),
  ...(input.reload === undefined ? [] : [input.reload === true ? "--reload" : `--reload=${input.reload.join(",")}`]),
  ...(input.vendor === undefined ? [] : [input.vendor ? "--vendor" : "--vendor=false"]),
  ...(input.cert === undefined ? [] : ["--cert", input.cert]),
  ...(input.conditions ?? []).flatMap((condition) => ["--conditions", condition]),
  ...(input.minimumDependencyAge === undefined ? [] : ["--minimum-dependency-age", input.minimumDependencyAge]),
];

export const renderCheck = (check: Check | undefined): readonly string[] => {
  switch (check) {
    case undefined:
      return [];
    case true:
      return ["--check"];
    case "all":
      return ["--check=all"];
    case false:
      return ["--no-check"];
    case "remote":
      return ["--no-check=remote"];
  }
};

export const validatePath = (
  operation: string,
  field: string,
  value: string,
): Effect.Effect<void, DenoCommandInputInvalid> =>
  value.length > 0 && !value.includes("\0")
    ? Effect.void
    : Effect.fail(
      new DenoCommandInputInvalid({ operation, reason: `${field} must be non-empty and contain no NUL` }),
    );
