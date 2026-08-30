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

const assembled = AssembleExecutable.assembleDirect({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
  assets: [{ key: "message", path: "assets/message.txt" }],
});

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
