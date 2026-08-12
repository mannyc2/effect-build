import type { Options, Permissions, PermissionValue } from "../../Deno.js";
import { InvalidDriverOptions, ToolFailed } from "../BuildError.js";
import type { CompileExecutableInput } from "../Driver.js";
import type { Target } from "../Target.js";
import type { CompilerAdapter } from "./CompilerAdapter.js";

const targets = {
  "macos-x64": "x86_64-apple-darwin",
  "macos-aarch64": "aarch64-apple-darwin",
  "linux-x64-gnu": "x86_64-unknown-linux-gnu",
  "linux-aarch64-gnu": "aarch64-unknown-linux-gnu",
  "windows-x64": "x86_64-pc-windows-msvc",
  "windows-aarch64": "aarch64-pc-windows-msvc",
} as const satisfies Partial<Record<Target, string>>;

const invalid = (reason: string): never => {
  throw new InvalidDriverOptions({ tool: "deno", reason });
};

const allowedOptions: ReadonlySet<string> = new Set(["bundle", "minify", "permissions"]);

const permissionNames = ["read", "write", "net", "env", "run", "ffi", "sys", "import"] as const;
const allowedPermissions: ReadonlySet<string> = new Set(["all", ...permissionNames]);

const isPermissionValue = (value: unknown): value is PermissionValue =>
  value === true
  || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string"));

const renderPermission = (name: string, value: PermissionValue): string =>
  value === true ? `--allow-${name}` : `--allow-${name}=${value.join(",")}`;

/** Validates and renders permission flags in one pass; throws `InvalidDriverOptions` on bad input. */
const renderPermissions = (permissions: Permissions | undefined): readonly string[] => {
  if (permissions === undefined) return [];
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return invalid("permissions must be an object");
  }
  if (Object.keys(permissions).some((key) => !allowedPermissions.has(key))) {
    return invalid("unknown permission");
  }
  if (permissions.all === true) {
    return Object.keys(permissions).length === 1
      ? ["--allow-all"]
      : invalid("allow-all cannot be mixed with scoped permissions");
  }
  return permissionNames.flatMap((name) => {
    const value = permissions[name];
    if (value === undefined) return [];
    if (!isPermissionValue(value)) {
      return invalid(`${name} permission must be true or non-empty strings`);
    }
    return [renderPermission(name, value)];
  });
};

interface ValidatedOptions {
  readonly options: Options;
  readonly permissionArgs: readonly string[];
}

const optionsOf = (input: CompileExecutableInput<Options>): ValidatedOptions => {
  const value: unknown = input.options ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("options must be an object");
  }
  if (Object.keys(value).some((key) => !allowedOptions.has(key))) {
    return invalid("unknown Deno option");
  }
  const options = value as Options;
  if (options.bundle !== undefined && typeof options.bundle !== "boolean") {
    return invalid("bundle must be boolean");
  }
  if (options.minify !== undefined && typeof options.minify !== "boolean") {
    return invalid("minify must be boolean");
  }
  if (options.minify !== undefined && options.bundle !== true) {
    return invalid("minify requires bundle");
  }
  return { options, permissionArgs: renderPermissions(options.permissions) };
};

export const denoAdapter: CompilerAdapter<Options> = {
  toolName: "deno",
  probeArgv: ["eval", "console.log(JSON.stringify({path:Deno.execPath(),version:Deno.version.deno}))"],
  supportedTargets: Object.keys(targets) as Target[],
  renderArgv: ({ input, stagedOutfile }) => {
    const { options, permissionArgs } = optionsOf(input);
    const target = input.target === undefined ? undefined : targets[input.target as keyof typeof targets];
    return [
      "compile",
      ...(target === undefined ? [] : ["--target", target]),
      ...(options.bundle === true ? ["--bundle"] : []),
      ...(options.minify === true ? ["--minify"] : []),
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
