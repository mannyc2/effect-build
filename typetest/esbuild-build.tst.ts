import type { Effect } from "effect";
import type * as esbuild from "esbuild";
import * as AnalyzeMetafile from "../packages/effect-build-esbuild/src/Api/AnalyzeMetafile.js";
import * as Build from "../packages/effect-build-esbuild/src/Api/Build.js";
import * as BuildToDirectory from "../packages/effect-build-esbuild/src/Api/BuildToDirectory.js";
import * as FormatMessages from "../packages/effect-build-esbuild/src/Api/FormatMessages.js";
import * as Api from "../packages/effect-build-esbuild/src/Api/index.js";
import * as Transform from "../packages/effect-build-esbuild/src/Api/Transform.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const memoryOptions: esbuild.BuildOptions & { readonly write: false };
const built = Build.build(memoryOptions);
export type _Build = Assert<
  Same<typeof built, Effect.Effect<esbuild.BuildResult<typeof memoryOptions>, Build.EsbuildFailed>>
>;

// Memory and provider-direct publication are distinct operations.
// @ts-expect-error!
Build.build({ bundle: true, write: true });
// @ts-expect-error!
Build.build({ bundle: true });

declare const directOptions: esbuild.BuildOptions & { readonly write: true };
const written = BuildToDirectory.buildToDirectory(directOptions);
export type _BuildToDirectory = Assert<
  Same<
    typeof written,
    Effect.Effect<esbuild.BuildResult<typeof directOptions>, BuildToDirectory.EsbuildFailed>
  >
>;
// @ts-expect-error!
BuildToDirectory.buildToDirectory({ bundle: true, write: false });

const transformed = Transform.transform("let a = 1", { loader: "ts" });
export type _Transform = Assert<
  Same<
    typeof transformed,
    Effect.Effect<esbuild.TransformResult<{ readonly loader: "ts" }>, Transform.EsbuildFailed>
  >
>;

declare const metafile: esbuild.Metafile;
const analyzed = AnalyzeMetafile.analyzeMetafile(metafile, { verbose: true });
export type _Analyze = Assert<
  Same<typeof analyzed, Effect.Effect<string, AnalyzeMetafile.EsbuildFailed>>
>;

const formatted = FormatMessages.formatMessages([], { kind: "error" });
export type _Format = Assert<
  Same<typeof formatted, Effect.Effect<readonly string[], FormatMessages.EsbuildFailed>>
>;

declare const failure: Build.EsbuildFailed;
export type _Diagnostics = Assert<
  Same<typeof failure.errors, readonly esbuild.Message[]> extends true
    ? Same<typeof failure.warnings, readonly esbuild.Message[]>
    : false
>;

// Rejected synchronous and shared-service controls are absent from the public API lane.
export type _NoBuildSync = Assert<Same<"buildSync" extends keyof typeof Api ? true : false, false>>;
export type _NoTransformSync = Assert<Same<"transformSync" extends keyof typeof Api ? true : false, false>>;
export type _NoInitialize = Assert<Same<"initialize" extends keyof typeof Api ? true : false, false>>;
export type _NoStop = Assert<Same<"stop" extends keyof typeof Api ? true : false, false>>;
