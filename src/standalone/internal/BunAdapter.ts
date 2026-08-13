import type { Options } from "../../Bun.js";
import { InvalidDriverOptions, ToolFailed } from "../BuildError.js";
import { type BunTarget, bunTargetTable } from "./BunTarget.js";
import type { CompilerAdapter, OptionsValidation } from "./CompilerAdapter.js";

interface ValidatedOptions {
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

const invalid = (reason: string): OptionsValidation<ValidatedOptions> => ({
  _tag: "Invalid",
  error: new InvalidDriverOptions({ tool: "bun", reason }),
});

const validateOptions = (input: unknown): OptionsValidation<ValidatedOptions> => {
  const value: unknown = input ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("options must be an object");
  }
  const allowed = new Set(["minify", "sourcemap", "bytecode"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return invalid("unknown Bun option");
  }
  const options = value as Readonly<Record<string, unknown>>;
  const minify = options.minify;
  const sourcemap = options.sourcemap;
  const bytecode = options.bytecode;
  if (minify !== undefined && typeof minify !== "boolean") {
    return invalid("minify must be boolean");
  }
  if (bytecode !== undefined && typeof bytecode !== "boolean") {
    return invalid("bytecode must be boolean");
  }
  if (sourcemap !== undefined && sourcemap !== "linked" && sourcemap !== "inline") {
    return invalid("sourcemap must be linked or inline");
  }
  return {
    _tag: "Valid",
    value: {
      ...(minify === undefined ? {} : { minify }),
      ...(sourcemap === undefined ? {} : { sourcemap }),
      ...(bytecode === undefined ? {} : { bytecode }),
    },
  };
};

export const bunAdapter: CompilerAdapter<Options, "bun", BunTarget, ValidatedOptions> = {
  toolName: "bun",
  probeArgv: [
    "-e",
    'process.stdout.write(JSON.stringify({path:process.execPath,version:Bun.version,hostOs:process.platform==="darwin"?"macos":process.platform==="win32"?"windows":process.platform==="linux"?"linux":process.platform}))',
  ],
  targetTable: bunTargetTable,
  validateOptions,
  renderArgv: (request) => {
    const options = request.options;
    return [
      "build",
      "--compile",
      ...(request.target === undefined ? [] : [`--target=${bunTargetTable.nativeToken(request.target)}`]),
      ...(options.minify === true ? ["--minify"] : []),
      ...(options.sourcemap === undefined ? [] : [`--sourcemap=${options.sourcemap}`]),
      ...(options.bytecode === true ? ["--bytecode"] : []),
      `--outfile=${request.stagedOutfile}`,
      request.entrypoint,
    ];
  },
  interpretFailure: (completion) =>
    new ToolFailed({
      tool: "bun",
      exitCode: completion.exitCode,
      diagnostics: [
        { channel: "stdout", ...completion.stdout },
        { channel: "stderr", ...completion.stderr },
      ],
    }),
};
