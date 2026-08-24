import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as Tool from "../packages/effect-build/src/Author/Tool.js";
import type * as Target from "../packages/effect-build/src/Target.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _Executable = Assert<
  Same<
    Artifact.Executable,
    {
      readonly _tag: "Executable";
      readonly path: string;
      readonly bytes: number;
      readonly target: Target.Target;
      readonly tool: Tool.SelectedTool;
      readonly digest: Artifact.Digest;
      readonly sha256: string;
    }
  >
>;

export type _Tool = Assert<
  Same<
    Tool.SelectedTool,
    {
      readonly protocol: "effect-build/selected-tool@1";
      readonly name: string;
      readonly version: string;
      readonly executablePath: string;
      readonly digest: Artifact.Digest;
    }
  >
>;
