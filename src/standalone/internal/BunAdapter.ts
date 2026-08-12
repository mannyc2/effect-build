import type { Options } from "../../Bun.js";
import { InvalidDriverOptions, ToolFailed } from "../BuildError.js";
import type { CompileExecutableInput } from "../Driver.js";
import type { Target } from "../Target.js";
import type { CompilerAdapter } from "./CompilerAdapter.js";

const targets: Readonly<Record<Target, string>> = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  "linux-aarch64-musl": "bun-linux-arm64-musl",
  "windows-x64": "bun-windows-x64",
  "windows-aarch64": "bun-windows-arm64",
};

const optionsOf = (input: CompileExecutableInput<Options>): Options => {
  const value: unknown = input.options ?? {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidDriverOptions({ tool: "bun", reason: "options must be an object" });
  }
  const allowed = new Set(["minify", "sourcemap", "bytecode"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new InvalidDriverOptions({ tool: "bun", reason: "unknown Bun option" });
  }
  const options = value as Options;
  if (options.minify !== undefined && typeof options.minify !== "boolean") {
    throw new InvalidDriverOptions({ tool: "bun", reason: "minify must be boolean" });
  }
  if (options.bytecode !== undefined && typeof options.bytecode !== "boolean") {
    throw new InvalidDriverOptions({ tool: "bun", reason: "bytecode must be boolean" });
  }
  if (options.sourcemap !== undefined && options.sourcemap !== "linked" && options.sourcemap !== "inline") {
    throw new InvalidDriverOptions({ tool: "bun", reason: "sourcemap must be linked or inline" });
  }
  return options;
};

export const bunAdapter: CompilerAdapter<Options> = {
  toolName: "bun",
  probeArgv: ["-e", "process.stdout.write(JSON.stringify({path:process.execPath,version:Bun.version}))"],
  supportedTargets: Object.keys(targets) as Target[],
  renderArgv: ({ input, stagedOutfile }) => {
    const options = optionsOf(input);
    return [
      "build",
      "--compile",
      ...(input.target === undefined ? [] : [`--target=${targets[input.target]}`]),
      ...(options.minify === true ? ["--minify"] : []),
      ...(options.sourcemap === undefined ? [] : [`--sourcemap=${options.sourcemap}`]),
      ...(options.bytecode === true ? ["--bytecode"] : []),
      `--outfile=${stagedOutfile}`,
      input.entrypoint,
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
