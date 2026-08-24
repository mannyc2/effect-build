import type { Digest } from "../Artifact.js";

export const protocol = "effect-build/sealed-node-main@1" as const;

export type Format = "commonjs" | "module";

export interface SealedNodeMain {
  readonly protocol: typeof protocol;
  readonly format: Format;
  readonly path: string;
  readonly bytes: number;
  readonly digest: Digest;
}
