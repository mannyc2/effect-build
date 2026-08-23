import type { Effect } from "effect";
import * as AppBundle from "../packages/effect-build-apple/src/AppBundle.js";
import * as Artifact from "../packages/effect-build-apple/src/Artifact.js";
import * as Assess from "../packages/effect-build-apple/src/Assess.js";
import * as CodeSign from "../packages/effect-build-apple/src/CodeSign.js";
import * as DiskImage from "../packages/effect-build-apple/src/DiskImage.js";
import * as InstallerPackage from "../packages/effect-build-apple/src/InstallerPackage.js";
import * as Notary from "../packages/effect-build-apple/src/Notary.js";
import * as Staple from "../packages/effect-build-apple/src/Staple.js";
import * as Zip from "../packages/effect-build-apple/src/Zip.js";
import type * as CoreArtifact from "../packages/effect-build/src/Artifact.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const executable: CoreArtifact.Executable;
declare const machO: Artifact.FileArtifact<"mach-o">;
declare const applicationIdentity: CodeSign.DeveloperIdApplication;
declare const app: Artifact.TreeArtifact<"app-bundle">;
declare const accepted: Notary.AcceptedSubmissionObservation;

const observed = Artifact.observeExecutable(executable);
const signedMachO = CodeSign.sign({
  input: machO,
  destination: "dist/tool",
  identity: applicationIdentity,
  plan: [{ path: ".", identifier: "dev.effect.tool", hardenedRuntime: true }],
});
const stapled = Staple.staple({ input: app, destination: "dist/App.app", notarization: accepted });

export type _ObserveExecutable = Assert<
  Same<
    typeof observed,
    Effect.Effect<
      Artifact.FileArtifact<"mach-o">,
      Artifact.ArtifactError | Artifact.AppleInputInvalid,
      Artifact.ArtifactServices
    >
  >
>;

export type _CodeSignPreservesExactInput = Assert<
  Same<
    typeof signedMachO,
    Effect.Effect<CodeSign.SignResult<typeof machO>, CodeSign.CodeSignError, CodeSign.Signer>
  >
>;

export type _StaplePreservesKind = Assert<
  Same<typeof stapled, Effect.Effect<Staple.StapleResult<typeof app>, Staple.StapleError, Staple.Stapler>>
>;

export type _NotarizableKinds = Assert<
  Same<
    Notary.NotarizableArtifact,
    | Artifact.FileArtifact<"mach-o" | "zip" | "disk-image" | "installer-package">
    | Artifact.TreeArtifact<"app-bundle">
  >
>;

export type _OperationInventory = readonly [
  typeof CodeSign.sign,
  typeof AppBundle.create,
  typeof Zip.create,
  typeof DiskImage.create,
  typeof InstallerPackage.create,
  typeof Notary.submit,
  typeof Notary.reconcile,
  typeof Staple.staple,
  typeof Assess.assess,
];
