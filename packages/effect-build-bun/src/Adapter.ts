import { Result, Schema } from "effect";
import * as Core from "effect-build";
import type * as Integration from "effect-build/Integration";
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

const invalid = (reason: string): Result.Result<never, string> => Result.fail(reason);

const validateOptions = (
  input: unknown,
): Result.Result<ValidatedOptions, string> => {
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
  return Result.succeed({
    ...(minify === undefined ? {} : { minify }),
    ...(sourcemap === undefined ? {} : { sourcemap }),
    ...(bytecode === undefined ? {} : { bytecode }),
  });
};

export const targetEntries = [
  ["macos-x64", "bun-darwin-x64"],
  ["macos-aarch64", "bun-darwin-arm64"],
  ["linux-x64-gnu", "bun-linux-x64"],
  ["linux-x64-musl", "bun-linux-x64-musl"],
  ["linux-aarch64-gnu", "bun-linux-arm64"],
  ["windows-x64", "bun-windows-x64"],
] as const;

export const Stages = Schema.Tuple([
  Schema.Struct({
    operation: Schema.Literal("compile-executable"),
    tool: Schema.Struct({
      name: Schema.Literal("bun"),
      version: Schema.NonEmptyString,
      path: Core.Artifact.AbsolutePath,
    }),
  }),
]);

export const definition = {
  probeArgv: [
    "-e",
    "process.stdout.write(JSON.stringify({path:process.execPath,version:Bun.version}))",
  ],
  targetEntries,
  Stages,
  validateOptions,
  renderArgv: ({
    input,
    nativeTarget,
    stagedOutfile,
  }: {
    readonly input: Provider.PreparedCommandInput<
      ValidatedOptions,
      (typeof targetEntries)[number][0]
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
    completion: Integration.CommandCompletion,
  ): readonly Core.BuildError.Diagnostic[] => [
    { channel: "stdout", ...completion.stdout },
    { channel: "stderr", ...completion.stderr },
  ],
} as const;
