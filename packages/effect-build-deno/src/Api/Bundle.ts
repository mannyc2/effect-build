import { Context, Effect, Layer } from "effect";
import { Tool } from "effect-build";
import { tested } from "../Deno.js";
import { DenoBundleFailed, DenoBundleModeInvalid, DenoBundleUnavailable } from "../internal/ApiError.js";

export { DenoBundleFailed, DenoBundleModeInvalid, DenoBundleUnavailable } from "../internal/ApiError.js";

/** Deno 2.9.5's experimental bundle declaration, isolated from global Deno types. */
export namespace Native {
  export type Platform = "browser" | "deno";
  export type Format = "esm" | "cjs" | "iife";
  export type SourceMap = "linked" | "inline" | "external";
  export type Packages = "bundle" | "external";
  export interface Options {
    readonly entrypoints: string[];
    readonly outputPath?: string;
    readonly outputDir?: string;
    readonly external?: string[];
    readonly format?: Format;
    readonly minify?: boolean;
    readonly keepNames?: boolean;
    readonly codeSplitting?: boolean;
    readonly inlineImports?: boolean;
    readonly packages?: Packages;
    readonly sourcemap?: SourceMap;
    readonly platform?: Platform;
    readonly write?: boolean;
  }
  export interface MessageLocation {
    readonly file: string;
    readonly namespace?: string;
    readonly line: number;
    readonly column: number;
    readonly length: number;
    readonly suggestion?: string;
  }
  export interface MessageNote { readonly text: string; readonly location?: MessageLocation; }
  export interface Message {
    readonly text: string;
    readonly location?: MessageLocation | null;
    readonly notes?: MessageNote[];
  }
  export interface OutputFile {
    readonly path: string;
    readonly contents?: Uint8Array<ArrayBuffer>;
    readonly hash: string;
    text(): string;
  }
  export interface Result {
    readonly errors: Message[];
    readonly warnings: Message[];
    readonly success: boolean;
    readonly outputFiles?: OutputFile[] | null;
  }
}

export type MemoryOptions = Native.Options & { readonly write: false };
export type DirectOptions = Native.Options & { readonly write: true } & (
  | { readonly outputPath: string; readonly outputDir?: never }
  | { readonly outputPath?: never; readonly outputDir: string }
);
type Failure = DenoBundleFailed | DenoBundleModeInvalid;
interface Service {
  readonly memory: (options: MemoryOptions) => Effect.Effect<Native.Result, Failure>;
  readonly direct: (options: DirectOptions) => Effect.Effect<Native.Result, Failure>;
}
export class Bundle extends Context.Service<Bundle, Service>()("effect-build-deno/Api/Bundle") {}

const globalBundle = () => Effect.gen(function*() {
  const host: unknown = Reflect.get(globalThis, "Deno");
  const versionValue: unknown = typeof host === "object" && host !== null ? Reflect.get(host, "version") : undefined;
  const version: unknown = typeof versionValue === "object" && versionValue !== null ? Reflect.get(versionValue, "deno") : undefined;
  const native: unknown = typeof host === "object" && host !== null ? Reflect.get(host, "bundle") : undefined;
  if (typeof version !== "string" || !Tool.satisfies(tested)(version) || typeof native !== "function") {
    return yield* new DenoBundleUnavailable({
      expectedVersion: tested,
      ...(typeof version === "string" ? { observedVersion: version } : {}),
      requiredFlag: "--unstable-bundle",
      reason: typeof native !== "function" ? "Requires Deno with --unstable-bundle" : `Deno ${String(version)} is outside ${tested}`,
    });
  }
  return native.bind(host) as (options: Native.Options) => Promise<Native.Result>;
});

export const memory = (options: MemoryOptions): Effect.Effect<Native.Result, Failure, Bundle> =>
  Bundle.use((service) => service.memory(options));

/** For atomic output, use the CLI bundle operation instead of the native API. */
export const direct = (options: DirectOptions): Effect.Effect<Native.Result, Failure, Bundle> =>
  Bundle.use((service) => service.direct(options));

export const layer = Layer.effect(Bundle, Effect.gen(function*() {
  const native = yield* globalBundle();
  const invoke = (mode: "memory" | "direct", options: Native.Options) => Effect.tryPromise({
    // Deno.bundle has no cancellation handle; interruption only stops awaiting it.
    try: () => native(options),
    catch: (cause) => new DenoBundleFailed({ mode, cause }),
  });
  return {
    memory: (options) => options.write === false
      ? invoke("memory", options)
      : Effect.fail(new DenoBundleModeInvalid({ mode: "memory", reason: "write must be false for memory output" })),
    direct: (options) => options.write === true && (
        (typeof options.outputPath === "string" && options.outputPath.length > 0 && options.outputDir === undefined)
        || (typeof options.outputDir === "string" && options.outputDir.length > 0 && options.outputPath === undefined)
      )
      ? invoke("direct", options)
      : Effect.fail(new DenoBundleModeInvalid({ mode: "direct", reason: "write must be true with one outputPath or outputDir" })),
  } satisfies Service;
}));
