import type { Options, Permissions, PermissionValue } from "../../Deno.js";
import { InvalidDriverOptions, ToolFailed } from "../BuildError.js";
import type { CompilerAdapter, OptionsValidation } from "./CompilerAdapter.js";
import { type DenoTarget, denoTargetTable } from "./DenoTarget.js";

const invalid = <A = never>(reason: string): OptionsValidation<A> => ({
  _tag: "Invalid",
  error: new InvalidDriverOptions({ tool: "deno", reason }),
});

const allowedOptions: ReadonlySet<string> = new Set(["bundle", "minify", "permissions"]);

const permissionNames = ["read", "write", "net", "env", "run", "ffi", "sys", "import"] as const;
const allowedPermissions: ReadonlySet<string> = new Set(["all", ...permissionNames]);

const isPermissionValue = (value: unknown): value is PermissionValue =>
  value === true
  || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string"));

const renderPermission = (name: string, value: PermissionValue): string =>
  value === true ? `--allow-${name}` : `--allow-${name}=${value.join(",")}`;

/** Validates and renders permission flags once during adapter preflight. */
const validatePermissions = (permissions: Permissions | undefined): OptionsValidation<readonly string[]> => {
  if (permissions === undefined) return { _tag: "Valid", value: [] };
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return invalid("permissions must be an object");
  }
  if (Object.keys(permissions).some((key) => !allowedPermissions.has(key))) {
    return invalid("unknown permission");
  }
  const all = permissions.all;
  if (all !== undefined && typeof all !== "boolean") {
    return invalid("all permission must be boolean");
  }
  if (all === true) {
    return Object.keys(permissions).length === 1
      ? { _tag: "Valid", value: ["--allow-all"] }
      : invalid("allow-all cannot be mixed with scoped permissions");
  }
  const permissionArgs: string[] = [];
  for (const name of permissionNames) {
    const value = permissions[name];
    if (value === undefined) continue;
    if (!isPermissionValue(value)) {
      return invalid(`${name} permission must be true or non-empty strings`);
    }
    permissionArgs.push(renderPermission(name, value));
  }
  return { _tag: "Valid", value: permissionArgs };
};

interface ValidatedOptions {
  readonly bundle?: boolean;
  readonly minify?: boolean;
  readonly permissionArgs: readonly string[];
}

const validateOptions = (input: unknown): OptionsValidation<ValidatedOptions> => {
  const value: unknown = input ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("options must be an object");
  }
  if (Object.keys(value).some((key) => !allowedOptions.has(key))) {
    return invalid("unknown Deno option");
  }
  const options = value as Readonly<Record<string, unknown>>;
  const bundle = options.bundle;
  const minify = options.minify;
  const permissions = options.permissions;
  if (bundle !== undefined && typeof bundle !== "boolean") {
    return invalid("bundle must be boolean");
  }
  if (minify !== undefined && typeof minify !== "boolean") {
    return invalid("minify must be boolean");
  }
  if (minify !== undefined && bundle !== true) {
    return invalid("minify requires bundle");
  }
  const permissionArgs = validatePermissions(permissions as Permissions | undefined);
  return permissionArgs._tag === "Invalid"
    ? permissionArgs
    : {
      _tag: "Valid",
      value: {
        ...(bundle === undefined ? {} : { bundle }),
        ...(minify === undefined ? {} : { minify }),
        permissionArgs: permissionArgs.value,
      },
    };
};

export const denoAdapter: CompilerAdapter<Options, "deno", DenoTarget, ValidatedOptions> = {
  toolName: "deno",
  probeArgv: [
    "eval",
    'console.log(JSON.stringify({path:Deno.execPath(),version:Deno.version.deno,hostOs:Deno.build.os==="darwin"?"macos":Deno.build.os}))',
  ],
  targetTable: denoTargetTable,
  validateOptions,
  renderArgv: ({ input, stagedOutfile }) => {
    const { bundle, minify, permissionArgs } = input.options;
    return [
      "compile",
      ...(input.target === undefined ? [] : ["--target", denoTargetTable.nativeToken(input.target)]),
      ...(bundle === true ? ["--bundle"] : []),
      ...(minify === true ? ["--minify"] : []),
      ...permissionArgs,
      "--output",
      stagedOutfile,
      input.entrypoint,
    ];
  },
  interpretFailure: (completion) =>
    new ToolFailed({
      tool: "deno",
      exitCode: completion.exitCode,
      diagnostics: [
        { channel: "stdout", ...completion.stdout },
        { channel: "stderr", ...completion.stderr },
      ],
    }),
};
