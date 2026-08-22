import { Context, Effect, type Scope } from "effect";
import type { JavaScriptBundle } from "effect-build";
import * as Bun from "effect-build-bun";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type ContextOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;

class CallbackService extends Context.Service<CallbackService, { readonly value: string }>()(
  "typetest/bun-bundle/CallbackService",
) {}

interface CallbackError {
  readonly _tag: "CallbackError";
}

const operation = Bun.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm", cwd: "." },
  (main) =>
    CallbackService.use(({ value }) =>
      value.length > 0
        ? Effect.succeed(main)
        : Effect.fail<CallbackError>({ _tag: "CallbackError" })
    ),
);

type Operation = typeof operation;
type Main = SuccessOf<Operation>;

export type _Input = Assert<Same<Parameters<typeof Bun.withJavaScriptBundle>[0], Bun.JavaScriptBundleInput>>;
export type _Success = Assert<Main extends JavaScriptBundle.Artifact<readonly [Bun.BunBundleStage]> ? true : false>;
export type _Error = Assert<Same<ErrorOf<Operation>, Bun.BunBundleError | CallbackError>>;
export type _Context = Assert<Same<ContextOf<Operation>, Bun.Compiler | CallbackService>>;
export type _NoScope = Assert<Same<Extract<ContextOf<Operation>, Scope.Scope>, never>>;
export type _Service = Assert<
  Bun.Service extends {
    readonly compileExecutable: unknown;
    readonly compileExecutableMatrix: unknown;
    readonly withJavaScriptBundle: unknown;
  } ? true
    : false
>;
export type _StageOperation = Assert<Same<Main["stages"][0]["operation"], "bundle-javascript">>;
export type _StageName = Assert<Same<Main["stages"][0]["tool"]["name"], "bun">>;
export type _StageVersion = Assert<Same<Main["stages"][0]["tool"]["version"], "1.3.9">>;
export type _StagePath = Assert<Same<Main["stages"][0]["tool"]["path"], string>>;
export type _BundleFormat = Assert<Same<Main["format"], "esm" | "cjs">>;
export type _Resolution = Assert<Same<Main["resolutionTarget"], "node">>;
export type _VersionSupported = Assert<Same<Bun.BunBundleVersionMismatch["supported"], readonly ["1.3.9"]>>;

Bun.withJavaScriptBundle(
  {
    entrypoint: "src/main.ts",
    // @ts-expect-error!
    format: "iife",
  },
  Effect.succeed,
);

Bun.withJavaScriptBundle(
  {
    entrypoint: "src/main.ts",
    format: "esm",
    // @ts-expect-error!
    nodeVersion: "26.7.0",
  },
  Effect.succeed,
);

// @ts-expect-error!
Bun.Bundler;
// @ts-expect-error!
Bun.bundle;
