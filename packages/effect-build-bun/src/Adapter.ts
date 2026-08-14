import type * as Provider from "effect-build/Provider";

export interface Options {
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

export interface ValidatedOptions {
  readonly minify?: boolean;
  readonly sourcemap?: "linked" | "inline";
  readonly bytecode?: boolean;
}

const invalid = (reason: string): Provider.Validation<ValidatedOptions> => ({
  _tag: "Invalid",
  reason,
});

const validateOptions = (
  input: unknown,
): Provider.Validation<ValidatedOptions> => {
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
  if (
    sourcemap !== undefined && sourcemap !== "linked"
    && sourcemap !== "inline"
  ) {
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

export const targetTokens = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  "windows-x64": "bun-windows-x64",
} as const satisfies Readonly<
  Record<Provider.TargetFor<"bun">, string>
>;

export const definition = {
  kind: "command",
  probeArgv: [
    "-e",
    'process.stdout.write(JSON.stringify({path:process.execPath,version:Bun.version,hostOs:process.platform==="darwin"?"macos":process.platform==="win32"?"windows":process.platform==="linux"?"linux":process.platform}))',
  ],
  targetTokens,
  validateOptions,
  renderArgv: ({
    input,
    nativeTarget,
    stagedOutfile,
  }: {
    readonly input: Provider.PreparedCommandInput<
      ValidatedOptions,
      Provider.TargetFor<"bun">
    >;
    readonly nativeTarget?: string;
    readonly stagedOutfile: string;
  }): readonly string[] => {
    const options = input.options;
    return [
      "build",
      "--compile",
      ...(nativeTarget === undefined ? [] : ["--target=" + nativeTarget]),
      ...(options.minify === true ? ["--minify"] : []),
      ...(options.sourcemap === undefined
        ? []
        : ["--sourcemap=" + options.sourcemap]),
      ...(options.bytecode === true ? ["--bytecode"] : []),
      "--outfile=" + stagedOutfile,
      input.entrypoint,
    ];
  },
  interpretFailure: (
    completion: Provider.CommandCompletion,
  ): readonly Provider.Diagnostic[] => [
    { channel: "stdout", ...completion.stdout },
    { channel: "stderr", ...completion.stderr },
  ],
} as const;
