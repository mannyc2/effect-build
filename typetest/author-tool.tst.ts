import { type Crypto, Effect, type FileSystem, type Path } from "effect";
import type { ChildProcess } from "effect/unstable/process";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as Tool from "../packages/effect-build/src/Author/Tool.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const candidate: Tool.Candidate<"bun">;
const command = candidate.command(["--version"]);
export type _OfficialCommand = Assert<Same<typeof command, ChildProcess.Command>>;
export type _ExactContent = Assert<Same<typeof candidate.content.digest, Artifact.Digest>>;

declare const observation: Tool.Observation<"bun">;
const selected = Tool.select({
  name: "bun",
  observe: () => Effect.succeed(observation),
});
export type _Select = Assert<
  Same<
    typeof selected,
    Effect.Effect<
      Tool.SelectedTool<"bun">,
      | Tool.ToolNotFound
      | Tool.ToolSelectionAmbiguous
      | Tool.ToolSelectionInvalid
      | Artifact.ArtifactInvalid
      | Tool.SelectedToolChanged,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

declare const tool: Tool.SelectedTool<"bun">;
export type _Reauthenticate = Assert<
  Same<
    typeof tool.reauthenticate,
    Effect.Effect<
      void,
      Artifact.ArtifactInvalid | Tool.SelectedToolChanged,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

// @ts-expect-error! Core exposes official Command construction, not generic execution.
Tool.run({ tool: "bun", args: ["--version"] });
// @ts-expect-error! Core exposes no generic run-or-fail compatibility facade.
Tool.runOrFail({ tool: "bun", args: ["--version"] });
