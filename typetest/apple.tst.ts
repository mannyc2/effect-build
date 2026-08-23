import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
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
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

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

export type _SignableKinds = Assert<
  Same<
    CodeSign.SignableArtifact,
    Artifact.FileArtifact<"mach-o" | "disk-image"> | Artifact.TreeArtifact<"app-bundle">
  >
>;

export type _StapleKinds = Assert<
  Same<
    Staple.StapleArtifact,
    Artifact.TreeArtifact<"app-bundle"> | Artifact.FileArtifact<"disk-image" | "installer-package">
  >
>;

export type _AssessableKinds = Assert<
  Same<
    Assess.AssessableArtifact,
    | Artifact.FileArtifact<"mach-o" | "disk-image" | "installer-package">
    | Artifact.TreeArtifact<"app-bundle">
  >
>;

export type _InstallerInput = Assert<
  Same<
    InstallerPackage.CreateInput,
    {
      readonly app: Artifact.TreeArtifact<"app-bundle">;
      readonly outfile: string;
      readonly identity: InstallerPackage.DeveloperIdInstaller;
      readonly packageIdentifier: string;
      readonly version: string;
      readonly installLocation: string;
    }
  >
>;

export type _DistinctSigningAuthorities = Assert<
  Same<CodeSign.DeveloperIdApplication extends InstallerPackage.DeveloperIdInstaller ? true : false, false>
>;

type StoredSubmission = Extract<Notary.NotaryReceipt, { readonly state: "Submitted" }>;
export type _StoredReceiptIsDataNotAuthority = Assert<
  Same<StoredSubmission extends Notary.Submission ? true : false, false>
>;
export type _AuthorizedSubmissionIsSubmittedReceipt = Assert<
  Same<Notary.Submission extends Notary.SubmittedReceipt ? true : false, true>
>;

type AppleServices = FileSystem.FileSystem | Path.Path | ChildProcessSpawner;
declare const codeSignLayer: ReturnType<typeof CodeSign.layer>;
declare const appBundleLayer: ReturnType<typeof AppBundle.layer>;
declare const zipLayer: ReturnType<typeof Zip.layer>;
declare const diskImageLayer: ReturnType<typeof DiskImage.layer>;
declare const installerLayer: ReturnType<typeof InstallerPackage.layer>;
declare const notaryLayer: ReturnType<typeof Notary.layer>;
declare const stapleLayer: ReturnType<typeof Staple.layer>;
declare const assessLayer: ReturnType<typeof Assess.layer>;

export type _CodeSignLayer = Assert<Same<LayerError<typeof codeSignLayer>, Artifact.ToolError>>;
export type _AppBundleLayer = Assert<Same<LayerError<typeof appBundleLayer>, Artifact.ToolError>>;
export type _ZipLayer = Assert<Same<LayerError<typeof zipLayer>, Artifact.ToolError>>;
export type _DiskImageLayer = Assert<Same<LayerError<typeof diskImageLayer>, Artifact.ToolError>>;
export type _InstallerLayer = Assert<Same<LayerError<typeof installerLayer>, Artifact.ToolError>>;
export type _StapleLayer = Assert<Same<LayerError<typeof stapleLayer>, Artifact.ToolError>>;
export type _AssessLayer = Assert<Same<LayerError<typeof assessLayer>, Artifact.ToolError>>;
export type _AppleLayerServices = Assert<Same<LayerServices<typeof codeSignLayer>, AppleServices>>;
export type _NotaryLayerError = Assert<
  Same<LayerError<typeof notaryLayer>, Artifact.ToolError | Notary.NotaryConfigurationInvalid>
>;
export type _NotaryLayerServices = Assert<
  Same<LayerServices<typeof notaryLayer>, AppleServices | Crypto.Crypto>
>;

const selectedOperations = [
  Artifact.observeFile,
  Artifact.observeTree,
  Artifact.observeExecutable,
  Artifact.isFileArtifact,
  Artifact.isTreeArtifact,
  Artifact.isKind,
  Artifact.reference,
  Artifact.revalidate,
  Artifact.sameIdentity,
  CodeSign.developerIdApplication,
  CodeSign.sign,
  AppBundle.create,
  Zip.create,
  DiskImage.create,
  InstallerPackage.developerIdInstaller,
  InstallerPackage.create,
  Notary.submit,
  Notary.operatorReconciliationEvidence,
  Notary.reconcile,
  Notary.info,
  Notary.wait,
  Notary.log,
  Notary.history,
  Notary.readReceipt,
  Notary.submittedReceiptPath,
  Staple.staple,
  Assess.assess,
] as const;

export type _OperationInventory = Assert<
  Same<
    typeof selectedOperations,
    readonly [
      typeof Artifact.observeFile,
      typeof Artifact.observeTree,
      typeof Artifact.observeExecutable,
      typeof Artifact.isFileArtifact,
      typeof Artifact.isTreeArtifact,
      typeof Artifact.isKind,
      typeof Artifact.reference,
      typeof Artifact.revalidate,
      typeof Artifact.sameIdentity,
      typeof CodeSign.developerIdApplication,
      typeof CodeSign.sign,
      typeof AppBundle.create,
      typeof Zip.create,
      typeof DiskImage.create,
      typeof InstallerPackage.developerIdInstaller,
      typeof InstallerPackage.create,
      typeof Notary.submit,
      typeof Notary.operatorReconciliationEvidence,
      typeof Notary.reconcile,
      typeof Notary.info,
      typeof Notary.wait,
      typeof Notary.log,
      typeof Notary.history,
      typeof Notary.readReceipt,
      typeof Notary.submittedReceiptPath,
      typeof Staple.staple,
      typeof Assess.assess,
    ]
  >
>;

const selectedServicesAndLayers = [
  CodeSign.Signer,
  CodeSign.layer,
  AppBundle.Creator,
  AppBundle.layer,
  Zip.Creator,
  Zip.layer,
  DiskImage.Creator,
  DiskImage.layer,
  InstallerPackage.Creator,
  InstallerPackage.layer,
  Notary.Notarizer,
  Notary.layer,
  Staple.Stapler,
  Staple.layer,
  Assess.Assessor,
  Assess.layer,
] as const;

export type _ServiceAndLayerInventory = Assert<
  Same<
    typeof selectedServicesAndLayers,
    readonly [
      typeof CodeSign.Signer,
      typeof CodeSign.layer,
      typeof AppBundle.Creator,
      typeof AppBundle.layer,
      typeof Zip.Creator,
      typeof Zip.layer,
      typeof DiskImage.Creator,
      typeof DiskImage.layer,
      typeof InstallerPackage.Creator,
      typeof InstallerPackage.layer,
      typeof Notary.Notarizer,
      typeof Notary.layer,
      typeof Staple.Stapler,
      typeof Staple.layer,
      typeof Assess.Assessor,
      typeof Assess.layer,
    ]
  >
>;
