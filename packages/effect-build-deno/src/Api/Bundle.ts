import { Context, Effect, Layer } from "effect";
import { DenoBundleFailed, DenoBundleModeInvalid, DenoBundleUnavailable } from "../internal/ApiError.js";

export { DenoBundleFailed, DenoBundleModeInvalid, DenoBundleUnavailable } from "../internal/ApiError.js";

/** Isolated copy of the exact experimental Deno 2.9.5 declaration. */
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
    /** Defaults to true with a destination and false otherwise. */
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

  export interface MessageNote {
    readonly text: string;
    readonly location?: MessageLocation;
  }

  export interface Message {
    readonly text: string;
    readonly location?: MessageLocation;
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
    readonly outputFiles?: OutputFile[];
  }
}

/** Explicitly selects caller-owned in-memory output, even when output paths name artifacts. */
export type MemoryOptions = Native.Options & { readonly write: false };

/** Explicitly selects provider-direct durable output. */
export type DirectOptions =
  & Native.Options
  & { readonly write: true }
  & (
    | { readonly outputPath: string; readonly outputDir?: never }
    | { readonly outputPath?: never; readonly outputDir: string }
  );

interface DenoHost {
  readonly version: { readonly deno: string };
  readonly bundle: (options: Native.Options) => Promise<Native.Result>;
}

interface Service {
  readonly memory: (
    options: MemoryOptions,
  ) => Effect.Effect<Native.Result, DenoBundleFailed | DenoBundleModeInvalid>;
  readonly direct: (
    options: DirectOptions,
  ) => Effect.Effect<Native.Result, DenoBundleFailed | DenoBundleModeInvalid>;
}

export class Bundle extends Context.Service<Bundle, Service>()("effect-build-deno/Api/Bundle/Bundle") {}

const exactVersion = "2.9.5";

const globalHost = (): Effect.Effect<DenoHost, DenoBundleUnavailable> =>
  Effect.gen(function*() {
    const value = Reflect.get(globalThis, "Deno") as unknown;
    if (typeof value !== "object" || value === null) {
      return yield* new DenoBundleUnavailable({
        expectedVersion: exactVersion,
        requiredFlag: "--unstable-bundle",
        reason: "globalThis.Deno is absent",
      });
    }
    const versionValue = Reflect.get(value, "version");
    const version = typeof versionValue === "object" && versionValue !== null
      ? Reflect.get(versionValue, "deno")
      : undefined;
    const bundle = Reflect.get(value, "bundle");
    if (version !== exactVersion || typeof bundle !== "function") {
      return yield* new DenoBundleUnavailable({
        expectedVersion: exactVersion,
        ...(typeof version === "string" ? { observedVersion: version } : {}),
        requiredFlag: "--unstable-bundle",
        reason: typeof bundle !== "function"
          ? "Deno.bundle is absent; the pinned host requires --unstable-bundle at process start"
          : "host version is not the pinned contract",
      });
    }
    return {
      version: { deno: version },
      bundle: bundle.bind(value) as DenoHost["bundle"],
    };
  });

const layerFromHost = (host: DenoHost): Layer.Layer<Bundle> => {
  const invoke = (mode: "memory" | "direct", options: Native.Options) =>
    Effect.tryPromise({
      // Deno.bundle exposes no cancellation handle. Do not pass Effect's AbortSignal.
      try: () => host.bundle(options),
      catch: (cause) => new DenoBundleFailed({ mode, cause }),
    });
  return Layer.succeed(Bundle, {
    memory: (options) =>
      options.write === false
        ? invoke("memory", options)
        : Effect.fail(
          new DenoBundleModeInvalid({
            mode: "memory",
            reason: "write must be exactly false for caller-owned in-memory output",
          }),
        ),
    direct: (options) =>
      options.write === true && (
          (typeof options.outputPath === "string" && options.outputPath.length > 0 && options.outputDir === undefined)
          || (typeof options.outputDir === "string" && options.outputDir.length > 0 && options.outputPath === undefined)
        )
        ? invoke("direct", options)
        : Effect.fail(
          new DenoBundleModeInvalid({
            mode: "direct",
            reason: "outputPath or outputDir must name provider-direct durable output",
          }),
        ),
  });
};

export const memory = (
  options: MemoryOptions,
): Effect.Effect<Native.Result, DenoBundleFailed | DenoBundleModeInvalid, Bundle> =>
  Bundle.use((service) => service.memory(options));

/**
 * Experimental provider-direct publication. Failure/interruption may leave a
 * partial tree; this operation makes no atomicity or rollback claim.
 */
export const direct = (
  options: DirectOptions,
): Effect.Effect<Native.Result, DenoBundleFailed | DenoBundleModeInvalid, Bundle> =>
  Bundle.use((service) => service.direct(options));

export const layer: Layer.Layer<Bundle, DenoBundleUnavailable> = Layer.unwrap(
  Effect.map(globalHost(), layerFromHost),
);
