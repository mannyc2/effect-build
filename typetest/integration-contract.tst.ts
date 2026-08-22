import { Context, type Crypto, Effect, type FileSystem, type Layer, type Path, type Scope } from "effect";
import * as Core from "effect-build";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";
import type { ChildProcessSpawner } from "effect/unstable/process";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type ContextOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;
type LayerSuccess<T> = T extends Layer.Layer<infer A, any, any> ? A : never;
type LayerError<T> = T extends Layer.Layer<any, infer E, any> ? E : never;
type LayerContext<T> = T extends Layer.Layer<any, any, infer R> ? R : never;

class CallbackDependency extends Context.Service<CallbackDependency, { readonly value: string }>()(
  "typetest/integration/CallbackDependency",
) {}

const bundled = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (bundle) =>
    CallbackDependency.use(() =>
      Effect.succeed(bundle) as Effect.Effect<typeof bundle, "caller-error", CallbackDependency | Scope.Scope>
    ),
);
type Bundled = typeof bundled;
type Bundle = SuccessOf<Bundled>;
export type _EsbuildStageCount = Assert<Same<Bundle["stages"]["length"], 1>>;
export type _EsbuildStageOperation = Assert<Same<Bundle["stages"][0]["operation"], "bundle">>;
export type _EsbuildStageTool = Assert<Same<Bundle["stages"][0]["tool"]["name"], "esbuild">>;
export type _EsbuildStageVersion = Assert<Same<Bundle["stages"][0]["tool"]["version"], "0.28.2">>;
export type _EsbuildContext = Assert<Same<ContextOf<Bundled>, Esbuild.Esbuild | CallbackDependency>>;
export type _EsbuildErrors = Assert<
  Same<ErrorOf<Bundled>, Esbuild.EsbuildBundleError | "caller-error">
>;

declare const esbuildService: Esbuild.Service;
const directBundle = esbuildService.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "cjs" },
  () => Effect.succeed("used"),
);
export type _EsbuildServiceCapturesPlatform = Assert<Same<ContextOf<typeof directBundle>, never>>;
export type _EsbuildLayerSuccess = Assert<Same<LayerSuccess<typeof Esbuild.layer>, Esbuild.Esbuild>>;
export type _EsbuildLayerError = Assert<Same<LayerError<typeof Esbuild.layer>, Esbuild.EsbuildLayerError>>;
export type _EsbuildLayerContext = Assert<
  Same<LayerContext<typeof Esbuild.layer>, FileSystem.FileSystem | Path.Path | Crypto.Crypto>
>;

declare const borrowed: Core.JavaScriptBundle.Artifact<readonly []>;
const node = NodeSea.createExecutable({ main: borrowed, outfile: "dist/app" });
export type _NodeSuccess = Assert<Same<SuccessOf<typeof node>, NodeSea.Artifact<readonly []>>>;
export type _NodeError = Assert<Same<ErrorOf<typeof node>, NodeSea.NodeSeaCreateError>>;
export type _NodeContext = Assert<Same<ContextOf<typeof node>, NodeSea.NodeSea>>;
export type _BorrowedNodeStageCount = Assert<Same<SuccessOf<typeof node>["stages"]["length"], 1>>;
export type _BorrowedNodeStage = Assert<
  Same<SuccessOf<typeof node>["stages"][0]["operation"], "assemble-node-sea">
>;

declare const nodeService: NodeSea.Service;
const directNode = nodeService.createExecutable({ main: borrowed, outfile: "dist/app" });
export type _NodeServiceCapturesPlatform = Assert<Same<ContextOf<typeof directNode>, never>>;

const composed = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app" }),
);
type Composed = SuccessOf<typeof composed>;
export type _CompositionContext = Assert<Same<ContextOf<typeof composed>, Esbuild.Esbuild | NodeSea.NodeSea>>;
export type _CompositionStages = Assert<Same<Composed["stages"]["length"], 2>>;
export type _CompositionFirst = Assert<Same<Composed["stages"][0]["tool"]["name"], "esbuild">>;
export type _CompositionSecond = Assert<Same<Composed["stages"][1]["tool"]["name"], "node">>;
export type _CompositionTarget = Assert<Same<Composed["target"], "linux-x64-gnu">>;

const nodeLayer = NodeSea.layer();
export type _NodeLayerSuccess = Assert<Same<LayerSuccess<typeof nodeLayer>, NodeSea.NodeSea>>;
export type _NodeLayerError = Assert<Same<LayerError<typeof nodeLayer>, NodeSea.NodeSeaLayerError>>;
export type _NodeLayerContext = Assert<
  Same<
    LayerContext<typeof nodeLayer>,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
  >
>;

type SameTagCallerError = {
  readonly _tag: "InvalidJavaScriptBundle";
  readonly reason: "artifact-not-live";
  readonly callerOwned: true;
};
const sameTagCaller = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (): Effect.Effect<never, SameTagCallerError> =>
    Effect.fail({ _tag: "InvalidJavaScriptBundle", reason: "artifact-not-live", callerOwned: true }),
);
export type _SameTagCallerPassesThrough = Assert<
  Same<Extract<ErrorOf<typeof sameTagCaller>, SameTagCallerError>, SameTagCallerError>
>;

export type _NodeReason = ConstructorParameters<typeof NodeSea.InvalidNodeSeaInput>[0]["reason"];
const _builtinReason: _NodeReason = "external-import-not-builtin:node:test";
void _builtinReason;
// @ts-expect-error!
const _arbitraryReason: _NodeReason = "arbitrary";
void _arbitraryReason;

// @ts-expect-error!
NodeSea.createExecutable({ main: borrowed, outfile: "app", entrypoint: "src/main.ts" });
// @ts-expect-error!
NodeSea.createExecutable({ main: borrowed, outfile: "app", target: "linux-x64-gnu" });
// @ts-expect-error!
Esbuild.withJavaScriptBundle({ entrypoint: "src/main.ts", format: "esm", plugins: [] }, () => Effect.void);
// @ts-expect-error!
Esbuild.makeEsbuildService;
// @ts-expect-error!
NodeSea.makeNodeSeaService;
// @ts-expect-error!
NodeSea.Compiler;
