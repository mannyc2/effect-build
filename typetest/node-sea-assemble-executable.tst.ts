import type { Effect } from "effect";
import * as NodeMainExecutable from "../packages/effect-build-node-sea/src/NodeMainExecutable.js";
import * as Raw from "../packages/effect-build-node-sea/src/Raw.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _PortableProfile = Assert<Same<typeof NodeMainExecutable.profile, "effect-build/profile/node-main@1">>;
export type _PortableNodeVersion = Assert<Same<typeof NodeMainExecutable.nodeVersion, "26.7.0">>;
declare const executed: NodeMainExecutable.ExecutedExecutable;
export type _ReceiptWrapsExactAssembledDigest = Assert<
  Same<typeof executed.assembled.digest, Artifact.Digest>
>;

export type _Error = Assert<
  Same<
    Raw.AssembleExecutableError,
    | BuildError.ToolFailed
    | BuildError.UnsupportedTarget
    | BuildError.PublishFailed
    | BuildError.ArtifactInvalid
    | BuildError.SelectedToolChanged
  >
>;

export type _Main = Assert<
  Same<
    Raw.Main,
    | { readonly _tag: "File"; readonly path: string; readonly format: "commonjs" | "module" }
    | { readonly _tag: "Bytes"; readonly contents: Uint8Array; readonly format: "commonjs" | "module" }
  >
>;

declare const input: Raw.AssembleExecutableInput;
const assembled = Raw.assembleExecutable(input);

export type _Assemble = Assert<
  Same<
    typeof assembled,
    Effect.Effect<
      Artifact.Executable,
      Raw.AssembleExecutableError,
      Raw.Assembler
    >
  >
>;

// Assets are keyed records, so duplicate keys are unrepresentable.
Raw.assembleExecutable({
  main: { _tag: "File", path: "main.cjs", format: "commonjs" },
  outfile: "dist/app",
  target: "linux-x64-gnu",
  assets: { message: "assets/message.txt" },
});
