import { Effect } from "effect";
import { type ResolveOptions, type ResolveResult, ResolverFactory } from "rolldown/experimental";
import { RolldownFailed } from "../internal/error.js";

export type { ResolveOptions, ResolveResult } from "rolldown/experimental";
export { RolldownFailed } from "../internal/error.js";

/**
 * A caller-owned native resolver. Upstream exposes no release protocol, so the
 * wrapper does not mislabel it as a scoped handle.
 */
export interface Resolver {
  readonly resolve: (directory: string, request: string) => Effect.Effect<ResolveResult, RolldownFailed>;
  readonly resolveFile: (file: string, request: string) => Effect.Effect<ResolveResult, RolldownFailed>;
  readonly resolveDeclaration: (file: string, request: string) => Effect.Effect<ResolveResult, RolldownFailed>;
  readonly clearCache: Effect.Effect<void, RolldownFailed>;
}

const wrap = (native: ResolverFactory): Resolver => ({
  resolve: (directory, request) =>
    Effect.tryPromise({
      try: () => native.async(directory, request),
      catch: (cause) => new RolldownFailed({ operation: "resolve", cause }),
    }),
  resolveFile: (file, request) =>
    Effect.tryPromise({
      try: () => native.resolveFileAsync(file, request),
      catch: (cause) => new RolldownFailed({ operation: "resolve", cause }),
    }),
  resolveDeclaration: (file, request) =>
    Effect.tryPromise({
      try: () => native.resolveDtsAsync(file, request),
      catch: (cause) => new RolldownFailed({ operation: "resolve", cause }),
    }),
  clearCache: Effect.try({
    try: () => native.clearCache(),
    catch: (cause) => new RolldownFailed({ operation: "resolve", cause }),
  }),
});

export const make = (options?: ResolveOptions | null): Effect.Effect<Resolver, RolldownFailed> =>
  Effect.try({
    try: () => wrap(new ResolverFactory(options)),
    catch: (cause) => new RolldownFailed({ operation: "resolve", cause }),
  });
