/// <reference types="bun-types" preserve="true" />

import type * as bun from "bun";
import { Context, Effect, Layer } from "effect";
import { BunApiFailed, BunApiUnavailable } from "../internal/ApiError.js";

export { BunApiFailed, BunApiUnavailable } from "../internal/ApiError.js";

export type Options = bun.TranspilerOptions;
export type Loader = bun.JavaScriptLoader;
export type Source = bun.StringOrBuffer;
export type Import = bun.Import;
export type ScanResult = ReturnType<bun.Transpiler["scan"]>;

export interface Transpiler {
  /** The exact Bun object; its GC/native-backing lifetime remains Bun-owned. */
  readonly native: bun.Transpiler;
  /** Runs on Bun's worker pool. Effect interruption only stops awaiting it. */
  readonly transform: (source: Source, loader?: Loader) => Effect.Effect<string, BunApiFailed>;
  /** Runs synchronously on the calling thread and is not cooperatively interruptible. */
  readonly transformSync: {
    (source: Source, loader?: Loader): Effect.Effect<string, BunApiFailed>;
    (source: Source, context: object): Effect.Effect<string, BunApiFailed>;
    (source: Source, loader: Loader, context: object): Effect.Effect<string, BunApiFailed>;
  };
  readonly scan: (source: Source) => Effect.Effect<ScanResult, BunApiFailed>;
  /** Bun's faster, explicitly less-accurate import-only scan. */
  readonly scanImports: (source: Source) => Effect.Effect<Import[], BunApiFailed>;
}

interface BunHost {
  readonly version: string;
  readonly Transpiler: new(options?: Options) => bun.Transpiler;
}

interface FactoryService {
  readonly make: (options?: Options) => Effect.Effect<Transpiler, BunApiFailed>;
}

export class Factory extends Context.Service<Factory, FactoryService>()(
  "effect-build-bun/Api/Transpiler/Factory",
) {}

const exactVersion = "1.3.14";

const globalHost = (): Effect.Effect<BunHost, BunApiUnavailable> =>
  Effect.gen(function*() {
    const value = Reflect.get(globalThis, "Bun") as unknown;
    if (typeof value !== "object" || value === null) {
      return yield* new BunApiUnavailable({
        capability: "Bun.Transpiler",
        expectedVersion: exactVersion,
        reason: "globalThis.Bun is absent",
      });
    }
    const version = Reflect.get(value, "version");
    const Transpiler = Reflect.get(value, "Transpiler");
    if (typeof version !== "string" || version !== exactVersion || typeof Transpiler !== "function") {
      return yield* new BunApiUnavailable({
        capability: "Bun.Transpiler",
        expectedVersion: exactVersion,
        ...(typeof version === "string" ? { observedVersion: version } : {}),
        reason: typeof Transpiler !== "function"
          ? "Bun.Transpiler is absent"
          : "host version is not the pinned contract",
      });
    }
    return { version, Transpiler: Transpiler as BunHost["Transpiler"] };
  });

const layerFromHost = (host: BunHost): Layer.Layer<Factory> =>
  Layer.succeed(Factory, {
    make: (options) =>
      Effect.try({
        try: () => {
          const native = new host.Transpiler(options);
          const transform: Transpiler["transform"] = (source, loader) =>
            Effect.tryPromise({
              // Bun exposes no cancellation handle. Do not pass Effect's AbortSignal.
              try: () => native.transform(source, loader),
              catch: (cause) => new BunApiFailed({ operation: "transform", cause }),
            });
          const transformSync = ((...args: [Source, Loader?, object?]) =>
            Effect.try({
              try: () => Reflect.apply(native.transformSync, native, args) as string,
              catch: (cause) => new BunApiFailed({ operation: "transformSync", cause }),
            })) as Transpiler["transformSync"];
          const scan: Transpiler["scan"] = (source) =>
            Effect.try({
              try: () => native.scan(source),
              catch: (cause) => new BunApiFailed({ operation: "scan", cause }),
            });
          const scanImports: Transpiler["scanImports"] = (source) =>
            Effect.try({
              try: () => native.scanImports(source),
              catch: (cause) => new BunApiFailed({ operation: "scanImports", cause }),
            });
          return { native, transform, transformSync, scan, scanImports };
        },
        catch: (cause) => new BunApiFailed({ operation: "makeTranspiler", cause }),
      }),
  });

export const make = (options?: Options): Effect.Effect<Transpiler, BunApiFailed, Factory> =>
  Factory.use((factory) => factory.make(options));

/** Runs the async operation on one caller-owned configured Transpiler. */
export const transform = (
  transpiler: Transpiler,
  source: Source,
  loader?: Loader,
): Effect.Effect<string, BunApiFailed> => transpiler.transform(source, loader);

export interface TransformSync {
  (transpiler: Transpiler, source: Source, loader?: Loader): Effect.Effect<string, BunApiFailed>;
  (transpiler: Transpiler, source: Source, context: object): Effect.Effect<string, BunApiFailed>;
  (
    transpiler: Transpiler,
    source: Source,
    loader: Loader,
    context: object,
  ): Effect.Effect<string, BunApiFailed>;
}

/** Runs the non-interruptible calling-thread operation on one caller-owned configured Transpiler. */
export const transformSync: TransformSync = ((
  transpiler: Transpiler,
  source: Source,
  loaderOrContext?: Loader | object,
  context?: object,
) => {
  if (context !== undefined) {
    return transpiler.transformSync(source, loaderOrContext as Loader, context);
  }
  return typeof loaderOrContext === "object"
    ? transpiler.transformSync(source, loaderOrContext)
    : transpiler.transformSync(source, loaderOrContext);
}) as TransformSync;

/** Runs the structured scan on one caller-owned configured Transpiler. */
export const scan = (
  transpiler: Transpiler,
  source: Source,
): Effect.Effect<ScanResult, BunApiFailed> => transpiler.scan(source);

/** Runs Bun's faster, explicitly less-accurate scan on one caller-owned configured Transpiler. */
export const scanImports = (
  transpiler: Transpiler,
  source: Source,
): Effect.Effect<Import[], BunApiFailed> => transpiler.scanImports(source);

export const layer: Layer.Layer<Factory, BunApiUnavailable> = Layer.unwrap(
  Effect.map(globalHost(), layerFromHost),
);
