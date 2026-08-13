import { Context } from "effect";
import * as Provider from "effect-build/Provider";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

interface Options {
  readonly minify?: boolean;
}

class BunCompiler extends Context.Service<
  BunCompiler,
  Provider.CompilerService<"bun", Options>
>()("typetest/provider-definition/BunCompiler") {}

class DenoCompiler extends Context.Service<
  DenoCompiler,
  Provider.CompilerService<"deno", Options>
>()("typetest/provider-definition/DenoCompiler") {}

const bunTargetTokens = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  "windows-x64": "bun-windows-x64",
} as const satisfies Readonly<Record<Provider.TargetFor<"bun">, string>>;

const implementation = Provider.define({
  name: "bun",
  service: BunCompiler,
  probeArgv: ["--version"],
  targetTokens: bunTargetTokens,
  validateOptions: (_input: unknown): Provider.Validation<Options> => ({ _tag: "Valid", value: {} }),
  renderArgv: ({ input, nativeTarget, stagedOutfile }) => [
    ...(input.options.minify === true ? ["--minify"] : []),
    ...(nativeTarget === undefined ? [] : [nativeTarget]),
    stagedOutfile,
  ],
  interpretFailure: (completion) => [{ channel: "stderr", ...completion.stderr }],
});

export type _ClosedName = Assert<Same<Provider.ProviderName, "bun" | "deno">>;
export type _BunTarget = Assert<Same<typeof implementation.Target.Type, Provider.TargetFor<"bun">>>;
export type _Surface = Assert<
  Same<keyof typeof implementation, "Target" | "compileExecutable" | "compileExecutableMatrix" | "layer">
>;
export type _ImmutableCompletion = Assert<
  Same<Readonly<Provider.CommandCompletion>, Provider.CommandCompletion>
>;

// @ts-expect-error Type '"esbuild"' is not assignable to type '"bun" | "deno"'.
const invalidProviderName: Provider.ProviderName = "esbuild";
void invalidProviderName;

const missingBunTarget = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  // @ts-expect-error Property '"windows-x64"' is missing
} satisfies Readonly<Record<Provider.TargetFor<"bun">, string>>;
void missingBunTarget;

const extraBunTarget = {
  "macos-x64": "bun-darwin-x64",
  "macos-aarch64": "bun-darwin-arm64",
  "linux-x64-gnu": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-aarch64-gnu": "bun-linux-arm64",
  "windows-x64": "bun-windows-x64",
  // @ts-expect-error Object literal may only specify known properties
  "windows-aarch64": "bun-windows-arm64",
} satisfies Readonly<Record<Provider.TargetFor<"bun">, string>>;
void extraBunTarget;

Provider.define<BunCompiler, "bun", Options, Options>({
  name: "bun",
  // @ts-expect-error Type 'typeof DenoCompiler' is not assignable to type 'Service<BunCompiler
  service: DenoCompiler,
  probeArgv: ["--version"],
  targetTokens: bunTargetTokens,
  validateOptions: (_input: unknown) => ({ _tag: "Valid", value: {} }),
  renderArgv: () => [],
  interpretFailure: () => [],
});

// @ts-expect-error Property 'adapter' does not exist
implementation.adapter;
// @ts-expect-error Property 'process' does not exist
implementation.process;
// @ts-expect-error Property 'discoverTool' does not exist
implementation.discoverTool;
