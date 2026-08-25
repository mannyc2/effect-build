import type { Digest } from "effect-build/Artifact";
import * as NodeMain from "effect-build/Author/NodeMain";
import type { Target } from "effect-build/Target";

/** The one closed portable input profile consumed by repository finalization. */
export const profile = NodeMain.profile;

/** The only Node assembler version admitted by the v0.5 evidence matrix. */
export const nodeVersion = "26.7.0" as const;

export type NativeFormat = "mach-o" | "elf" | "pe";
export type Architecture = "x64" | "aarch64";
export type FinalizedMode = "0755" | "not-applicable";

export interface AuthenticatedBase {
  readonly version: typeof nodeVersion;
  readonly target: Target;
  readonly archiveName: string;
  readonly archiveDigest: Digest;
  readonly manifestDigest: Digest;
  readonly signatureDigest: Digest;
  readonly signerFingerprint: "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356";
}

/**
 * Exact post-finalization bytes minted only by the private target-runner
 * capability. Ordinary library code has no constructor for this value.
 */
export interface AssembledExecutable {
  readonly _tag: "AssembledExecutable";
  readonly profile: typeof profile;
  readonly nodeVersion: typeof nodeVersion;
  readonly target: Target;
  readonly format: NodeMain.Format;
  readonly path: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly finalizedMode: FinalizedMode;
  readonly mainDigest: Digest;
  readonly producer: NodeMain.ProviderIdentity;
  readonly base: AuthenticatedBase;
}

export interface TargetSupportEvidence {
  readonly target: Target;
  readonly runner: string;
  readonly nativeFormat: NativeFormat;
  readonly architecture: Architecture;
  readonly inspected: true;
  readonly executionExitCode: 0;
  readonly stdoutDigest: Digest;
  readonly stderrDigest: Digest;
}

/** Execution evidence wraps the exact assembled digest; it is not a rebuild. */
export interface ExecutedExecutable {
  readonly _tag: "ExecutedExecutable";
  readonly assembled: AssembledExecutable;
  readonly evidence: TargetSupportEvidence;
  readonly receiptDigest: Digest;
}
