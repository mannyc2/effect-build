/// <reference types="bun-types" preserve="true" />

import type * as bun from "bun";
import { Context, Effect, Layer } from "effect";
import { BunApiFailed, globalApi } from "../internal/ApiError.js";

export { BunApiFailed, BunApiUnavailable } from "../internal/ApiError.js";
export type Options = bun.TranspilerOptions;
export type Loader = bun.JavaScriptLoader;
export type Source = bun.StringOrBuffer;
export type Import = bun.Import;
export type ScanResult = ReturnType<bun.Transpiler["scan"]>;

export interface Transpiler {
  /** Bun owns the GC/native-backing lifetime; its Transpiler has no disposal API. */
  readonly native: bun.Transpiler;
  readonly transform: (source: Source, loader?: Loader) => Effect.Effect<string, BunApiFailed>;
  readonly transformSync: {
    (source: Source, loader?: Loader): Effect.Effect<string, BunApiFailed>;
    (source: Source, context: object): Effect.Effect<string, BunApiFailed>;
    (source: Source, loader: Loader, context: object): Effect.Effect<string, BunApiFailed>;
  };
  readonly scan: (source: Source) => Effect.Effect<ScanResult, BunApiFailed>;
  readonly scanImports: (source: Source) => Effect.Effect<Import[], BunApiFailed>;
}

interface FactoryService {
  readonly make: (options?: Options) => Effect.Effect<Transpiler, BunApiFailed>;
}
export class Factory extends Context.Service<Factory, FactoryService>()("effect-build-bun/Api/Transpiler") {}

const invoke = <A>(operation: string, run: () => A): Effect.Effect<A, BunApiFailed> =>
  Effect.try({ try: run, catch: (cause) => new BunApiFailed({ operation, cause }) });

export const layer = Layer.effect(Factory, Effect.gen(function*() {
  const Native = yield* globalApi("Transpiler");
  return {
    make: (options) => invoke("makeTranspiler", () => {
      const native = new Native(options);
      const transformSync: Transpiler["transformSync"] = (
        source: Source,
        loaderOrContext?: Loader | object,
        context?: object,
      ) => invoke("transformSync", () => {
        if (context !== undefined) return native.transformSync(source, loaderOrContext as Loader, context);
        return typeof loaderOrContext === "object"
          ? native.transformSync(source, loaderOrContext)
          : native.transformSync(source, loaderOrContext);
      });
      return {
        native,
        transform: (source, loader) => Effect.tryPromise({
          // Bun's worker pool has no cancellation handle; interruption stops awaiting.
          try: () => native.transform(source, loader),
          catch: (cause) => new BunApiFailed({ operation: "transform", cause }),
        }),
        transformSync,
        scan: (source) => invoke("scan", () => native.scan(source)),
        scanImports: (source) => invoke("scanImports", () => native.scanImports(source)),
      } satisfies Transpiler;
    }),
  } satisfies FactoryService;
}));

export const make = (options?: Options): Effect.Effect<Transpiler, BunApiFailed, Factory> =>
  Factory.use((factory) => factory.make(options));
export const transform = (transpiler: Transpiler, source: Source, loader?: Loader): Effect.Effect<string, BunApiFailed> =>
  transpiler.transform(source, loader);

export interface TransformSync {
  (transpiler: Transpiler, source: Source, loader?: Loader): Effect.Effect<string, BunApiFailed>;
  (transpiler: Transpiler, source: Source, context: object): Effect.Effect<string, BunApiFailed>;
  (transpiler: Transpiler, source: Source, loader: Loader, context: object): Effect.Effect<string, BunApiFailed>;
}
export const transformSync: TransformSync = (
  transpiler: Transpiler,
  source: Source,
  loaderOrContext?: Loader | object,
  context?: object,
) => {
  if (context !== undefined) return transpiler.transformSync(source, loaderOrContext as Loader, context);
  return typeof loaderOrContext === "object"
    ? transpiler.transformSync(source, loaderOrContext)
    : transpiler.transformSync(source, loaderOrContext);
};
export const scan = (transpiler: Transpiler, source: Source): Effect.Effect<ScanResult, BunApiFailed> =>
  transpiler.scan(source);
export const scanImports = (transpiler: Transpiler, source: Source): Effect.Effect<Import[], BunApiFailed> =>
  transpiler.scanImports(source);
