import type { Effect } from "effect";
import * as AssembleExecutable from "../packages/effect-build-node-sea/src/AssembleExecutable.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _Error = Assert<
  Same<
    AssembleExecutable.AssembleExecutableError,
    | BuildError.ToolFailed
    | BuildError.UnsupportedTarget
    | BuildError.PublishFailed
    | BuildError.ArtifactInvalid
    | BuildError.SelectedToolChanged
  >
>;

export type _Main = Assert<
  Same<
    AssembleExecutable.Main,
    | { readonly _tag: "File"; readonly path: string; readonly format: "commonjs" | "module" }
    | { readonly _tag: "Bytes"; readonly contents: Uint8Array; readonly format: "commonjs" | "module" }
  >
>;

declare const input: AssembleExecutable.AssembleExecutableInput;
const assembled = AssembleExecutable.assembleExecutable(input);

export type _Assemble = Assert<
  Same<
    typeof assembled,
    Effect.Effect<
      Artifact.Executable,
      AssembleExecutable.AssembleExecutableError,
      AssembleExecutable.Assembler
    >
  >
>;

// Assets are keyed records, so duplicate keys are unrepresentable.
AssembleExecutable.assembleExecutable({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  target: "linux-x64-gnu",
  assets: { message: "assets/message.txt" },
});
