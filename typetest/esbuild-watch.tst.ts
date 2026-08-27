import type { Stream } from "effect";
import type * as esbuild from "esbuild";
import type * as Context from "../packages/effect-build-esbuild/src/Context.js";
import * as Watch from "../packages/effect-build-esbuild/src/Watch.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const options: esbuild.BuildOptions & { readonly write: false };
const stream = Watch.changes(options);

// The stream carries native results, EsbuildFailed, and the Context service.
export type _Changes = Assert<
  Same<typeof stream, Stream.Stream<esbuild.BuildResult<typeof options>, Watch.EsbuildFailed, Context.Esbuild>>
>;

// Watching writes nothing to disk; `write: false` is required.
// @ts-expect-error!
Watch.changes({ bundle: true });
