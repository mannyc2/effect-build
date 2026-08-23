import type { Target } from "./Target.js";

export interface Tool {
  readonly name: string;
  readonly version: string;
}

export interface Executable {
  readonly _tag: "Executable";
  /** Absolute path of the committed executable. */
  readonly path: string;
  readonly bytes: number;
  readonly target: Target;
  readonly tool: Tool;
  /** Lowercase hex SHA-256 of the committed contents; absent when hashing was disabled. */
  readonly sha256?: string;
}
