import type { SelectedTool } from "./Author/Tool.js";
import type { Target } from "./Target.js";

export interface Digest {
  readonly algorithm: "sha256";
  readonly value: string;
}

export interface Executable {
  readonly _tag: "Executable";
  /** Absolute path of the committed executable. */
  readonly path: string;
  readonly bytes: number;
  readonly target: Target;
  readonly tool: SelectedTool;
  /** Authenticates the exact committed contents. */
  readonly digest: Digest;
  /** Lowercase SHA-256 projection retained for the Apple bridge. */
  readonly sha256: string;
}
