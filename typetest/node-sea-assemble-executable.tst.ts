import type { Crypto, Effect, FileSystem, Path } from "effect";
import * as AssembleExecutable from "../packages/effect-build-node-sea/src/Command/AssembleExecutable.js";
import * as Command from "../packages/effect-build-node-sea/src/Command/index.js";
import * as AssembleModes from "../packages/effect-build-node-sea/src/internal/AssembleModes.js";
import * as Runtime from "../packages/effect-build-node-sea/src/internal/Runtime.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _Main = Assert<
  Same<
    AssembleExecutable.Main,
    | { readonly _tag: "File"; readonly path: string; readonly format: "commonjs" | "module" }
    | {
      readonly _tag: "Bytes";
      readonly contents: Uint8Array;
      readonly format: "commonjs" | "module";
      readonly sourceName?: string;
    }
  >
>;

export type _Asset = Assert<
  Same<
    AssembleExecutable.Asset,
    | { readonly _tag: "File"; readonly key: string; readonly path: string; readonly contents?: never }
    | { readonly _tag: "Bytes"; readonly key: string; readonly contents: Uint8Array; readonly path?: never }
  >
>;

const assembled = AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
  assets: [
    { _tag: "File", key: "message", path: "assets/message.txt" },
    { _tag: "Bytes", key: "binary", contents: new Uint8Array([0, 128, 255]) },
  ],
});

const untaggedAsset = { key: "legacy", path: "assets/message.txt" };
// @ts-expect-error! asset acquisition must explicitly select File or Bytes.
const rejectedUntagged: AssembleExecutable.Asset = untaggedAsset;
void rejectedUntagged;

const mixedAsset = { _tag: "File" as const, key: "mixed", path: "assets/message.txt", contents: new Uint8Array() };
// @ts-expect-error! File assets cannot also supply byte contents, including through a variable.
const rejectedMixed: AssembleExecutable.Asset = mixedAsset;
void rejectedMixed;

const mixedBytesAsset = {
  _tag: "Bytes" as const,
  key: "mixed",
  path: "assets/message.txt",
  contents: new Uint8Array(),
};
// @ts-expect-error! Bytes assets cannot also supply a source path.
const rejectedMixedBytes: AssembleExecutable.Asset = mixedBytesAsset;
void rejectedMixedBytes;

export type _Assemble = Assert<
  Same<
    typeof assembled,
    Effect.Effect<
      Artifact.HashedExecutable,
      AssembleExecutable.Error,
      Runtime.Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

export type _OnlyDirectOperation = Assert<
  Same<"AssembleExecutable" extends keyof typeof Command ? true : false, true>
>;
export type _NoRawLane = Assert<Same<"Raw" extends keyof typeof Command ? true : false, false>>;
export type _NoLegacyAssembly = Assert<
  Same<"assembleLegacy" extends keyof typeof AssembleExecutable ? true : false, false>
>;

const privateModeCandidate = AssembleModes.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/cached-app",
  observation: "hashed",
  useCodeCache: true,
  execArgv: ["--no-warnings"],
  execArgvExtension: "none",
});
export type _PrivateModeCandidate = Assert<
  Same<
    typeof privateModeCandidate,
    Effect.Effect<
      Artifact.HashedExecutable,
      AssembleExecutable.Error,
      Runtime.Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

// @ts-expect-error! exact public input requires a truthful observation mode.
AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
});

AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "unhashed",
  // @ts-expect-error! target selection is not part of the admitted host-native operation.
  target: "linux-x64-gnu",
});

AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
  // @ts-expect-error! code cache remains a package-private evidence candidate.
  useCodeCache: true,
});
