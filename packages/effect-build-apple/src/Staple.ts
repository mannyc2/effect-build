import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type { PublishFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { capturePlatformServices, publishFailure, resolveAppleTool, verifyFileArtifact } from "./internal.js";
import { captureBundle, materializeBundle } from "./internal/BundleIdentity.js";
import {
  hasDeveloperIdApplicationSignature,
  hasDeveloperIdDiskImageSignature,
  hasDeveloperIdInstallerSignature,
  NotarizationTicket,
  ProductStateInvalid,
} from "./Model.js";
import type {
  AppleToolOptions,
  BundleInspectionFailed,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
  FileArtifactIdentityMismatch,
  StapledApplicationBundle,
  StapledDiskImage,
  StapledInstallerPackage,
} from "./Model.js";
import type { AcceptedReference } from "./Notary.js";

/** Accepted `.app` bundle and verified ZIP-to-bundle evidence used to authorize stapling. */
export interface StapleAppInput {
  readonly source: DeveloperIdApplicationBundle;
  readonly acceptance: AcceptedReference;
  readonly outdir: string;
}

/** Accepted DMG or pkg copied, stapled, validated, and published as new bytes. */
export interface StapleDiskImageInput {
  readonly kind: "dmg";
  readonly source: DeveloperIdDiskImage;
  readonly acceptance: AcceptedReference;
  readonly outfile: string;
}

export interface StapleInstallerPackageInput {
  readonly kind: "pkg";
  readonly source: DeveloperIdInstallerPackage;
  readonly acceptance: AcceptedReference;
  readonly outfile: string;
}

export type StapleFileInput = StapleDiskImageInput | StapleInstallerPackageInput;

/** Accepted evidence and the exact pre-staple artifact identity disagree. */
export class AcceptanceMismatch extends Schema.TaggedError<AcceptanceMismatch>()(
  "NotaryAcceptanceMismatch",
  {
    submissionId: Schema.NonEmptyString,
    expectedKind: Schema.Literals(["app", "dmg", "pkg"] as const),
    acceptedKind: Schema.NonEmptyString,
    expectedBytes: Schema.Natural,
    acceptedBytes: Schema.Natural,
    expectedSha256: Schema.NonEmptyString,
    acceptedSha256: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `Apple acceptance ${this.submissionId} does not identify the ${this.expectedKind} selected for stapling`;
  }
}

export interface LayerOptions {
  readonly xcrun: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type StapleError =
  | ToolFailed
  | PublishFailed
  | FileArtifactIdentityMismatch
  | AcceptanceMismatch
  | ProductStateInvalid;
export type StapleAppError = StapleError | BundleInspectionFailed;

interface Service {
  readonly stapleApp: (input: StapleAppInput) => Effect.Effect<StapledApplicationBundle, StapleAppError>;
  readonly stapleFile: (
    input: StapleFileInput,
  ) => Effect.Effect<StapledDiskImage | StapledInstallerPackage, StapleError>;
}

export class Stapler extends Context.Service<Stapler, Service>()(
  "effect-build-apple/Staple/Stapler",
) {}

type LayerError = ToolNotFound | ToolFailed;

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const xcrun = yield* resolveAppleTool("xcrun", options.xcrun, ["stapler", "-h"], "stapler");
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);
    const pkgutil = yield* resolveAppleTool("pkgutil", options.pkgutil, ["--help"]);
    const run = (operation: "staple" | "validate", target: string) =>
      Toolchain.runOrFail({
        tool: "stapler",
        executable: xcrun.executable,
        args: ["stapler", operation, target],
      });

    const mismatch = (
      input: { readonly acceptance: AcceptedReference },
      expectedKind: "app" | "dmg" | "pkg",
      expectedBytes: number,
      expectedSha256: string,
    ) =>
      new AcceptanceMismatch({
        submissionId: input.acceptance.submissionId,
        expectedKind,
        acceptedKind: input.acceptance.stapleTarget.kind,
        expectedBytes,
        acceptedBytes: input.acceptance.stapleTarget.artifactBytes,
        expectedSha256,
        acceptedSha256: input.acceptance.stapleTarget.artifactSha256,
      });

    const stapleApp = Effect.fn("effect-build-apple.stapleApp")(function*(input: StapleAppInput) {
      const sourceAppPath = path.resolve(input.source.outdir);
      if (!hasDeveloperIdApplicationSignature(input.source)) {
        return yield* new ProductStateInvalid({
          operation: "staple app",
          path: sourceAppPath,
          expected: "a Developer ID Application bundle",
        });
      }
      if (
        !path.basename(sourceAppPath).endsWith(".app") || !path.basename(path.resolve(input.outdir)).endsWith(".app")
      ) {
        return yield* new ProductStateInvalid({
          operation: "staple app",
          path: sourceAppPath,
          expected: ".app source and output directories",
        });
      }
      const captured = yield* captureBundle(input.source);
      const target = input.acceptance.stapleTarget;
      if (
        input.acceptance.providerStatus !== "Accepted"
        || input.acceptance.architecture !== input.source.architecture
        || target.kind !== "app"
        || target.identityKind !== "bundle-manifest"
        || target.bundleName !== captured.identity.bundleName
        || target.artifactBytes !== captured.identity.artifactBytes
        || target.artifactSha256 !== captured.identity.artifactSha256
      ) {
        return yield* mismatch(
          input,
          "app",
          captured.identity.artifactBytes,
          captured.identity.artifactSha256,
        );
      }
      const stapled = yield* Toolchain.publishBundle({
        tool: xcrun.tool,
        outdir: input.outdir,
        produce: (staging) =>
          Effect.gen(function*() {
            yield* materializeBundle(captured, staging);
            yield* Toolchain.runOrFail({
              tool: "codesign",
              executable: codesign.executable,
              args: ["--verify", "--deep", "--strict", "--verbose=2", staging],
            });
            yield* run("staple", staging);
            yield* run("validate", staging);
            yield* Toolchain.runOrFail({
              tool: "codesign",
              executable: codesign.executable,
              args: ["--verify", "--deep", "--strict", "--verbose=2", staging],
            });
          }),
      });
      const notarizationTicket = new NotarizationTicket({
        submissionId: input.acceptance.submissionId,
        submittedKind: input.acceptance.kind,
        submittedBytes: input.acceptance.artifactBytes,
        submittedSha256: input.acceptance.artifactSha256,
        targetKind: input.acceptance.stapleTarget.kind,
        targetIdentityKind: input.acceptance.stapleTarget.identityKind,
        targetBytes: input.acceptance.stapleTarget.artifactBytes,
        targetSha256: input.acceptance.stapleTarget.artifactSha256,
        targetArchitecture: input.source.architecture,
        ...(input.acceptance.stapleTarget.bundleName === undefined
          ? {}
          : { targetBundleName: input.acceptance.stapleTarget.bundleName }),
        submissionTool: input.acceptance.submissionTool,
        acceptanceTool: input.acceptance.tool,
      });
      return {
        ...stapled,
        architecture: input.source.architecture,
        signature: input.source.signature,
        notarizationTicket,
      } satisfies StapledApplicationBundle;
    });

    const stapleFile = Effect.fn("effect-build-apple.stapleFile")(function*(input: StapleFileInput) {
      const destination = path.resolve(input.outfile);
      if (
        !path.basename(path.resolve(input.source.path)).endsWith(`.${input.kind}`)
        || !path.basename(destination).endsWith(`.${input.kind}`)
      ) {
        return yield* new ProductStateInvalid({
          operation: `staple ${input.kind}`,
          path: path.resolve(input.source.path),
          expected: `.${input.kind} source and output paths`,
        });
      }
      const signatureValid = input.kind === "dmg"
        ? hasDeveloperIdDiskImageSignature(input.source)
        : hasDeveloperIdInstallerSignature(input.source);
      if (!signatureValid) {
        return yield* new ProductStateInvalid({
          operation: `staple ${input.kind}`,
          path: path.resolve(input.source.path),
          expected: input.kind === "dmg"
            ? "a Developer ID-signed disk image"
            : "a Developer ID Installer-signed package",
        });
      }
      const verified = yield* verifyFileArtifact(`staple ${input.kind}`, input.source);
      if (
        input.acceptance.providerStatus !== "Accepted"
        || input.acceptance.architecture !== input.source.architecture
        || input.acceptance.stapleTarget.kind !== input.kind
        || input.acceptance.stapleTarget.identityKind !== "file-bytes"
        || input.acceptance.stapleTarget.artifactBytes !== verified.bytes
        || input.acceptance.stapleTarget.artifactSha256 !== verified.sha256
      ) {
        return yield* mismatch(input, input.kind, verified.bytes, verified.sha256);
      }
      const stapled = yield* Toolchain.publishFile({
        tool: xcrun.tool,
        outfile: input.outfile,
        produce: (stagedPath) =>
          Effect.gen(function*() {
            yield* fileSystem.writeFile(stagedPath, verified.contents).pipe(
              Effect.mapError(publishFailure(destination, `stage verified accepted ${input.kind}`)),
            );
            yield* Toolchain.runOrFail({
              tool: input.kind === "pkg" ? "pkgutil" : "codesign",
              executable: input.kind === "pkg" ? pkgutil.executable : codesign.executable,
              args: input.kind === "pkg"
                ? ["--check-signature", stagedPath]
                : ["--verify", "--strict", "--verbose=2", stagedPath],
            });
            yield* run("staple", stagedPath);
            yield* run("validate", stagedPath);
            yield* Toolchain.runOrFail({
              tool: input.kind === "pkg" ? "pkgutil" : "codesign",
              executable: input.kind === "pkg" ? pkgutil.executable : codesign.executable,
              args: input.kind === "pkg"
                ? ["--check-signature", stagedPath]
                : ["--verify", "--strict", "--verbose=2", stagedPath],
            });
          }),
      });
      const notarizationTicket = new NotarizationTicket({
        submissionId: input.acceptance.submissionId,
        submittedKind: input.acceptance.kind,
        submittedBytes: input.acceptance.artifactBytes,
        submittedSha256: input.acceptance.artifactSha256,
        targetKind: input.acceptance.stapleTarget.kind,
        targetIdentityKind: input.acceptance.stapleTarget.identityKind,
        targetBytes: input.acceptance.stapleTarget.artifactBytes,
        targetSha256: input.acceptance.stapleTarget.artifactSha256,
        targetArchitecture: input.source.architecture,
        ...(input.acceptance.stapleTarget.bundleName === undefined
          ? {}
          : { targetBundleName: input.acceptance.stapleTarget.bundleName }),
        submissionTool: input.acceptance.submissionTool,
        acceptanceTool: input.acceptance.tool,
      });
      return input.kind === "dmg"
        ? {
          ...stapled,
          architecture: input.source.architecture,
          signature: input.source.signature,
          notarizationTicket,
        } satisfies StapledDiskImage
        : {
          ...stapled,
          architecture: input.source.architecture,
          signature: input.source.signature,
          notarizationTicket,
        } satisfies StapledInstallerPackage;
    });

    return {
      stapleApp: (input) => stapleApp(input).pipe(Effect.provide(services)),
      stapleFile: (input) => stapleFile(input).pipe(Effect.provide(services)),
    };
  });

export const stapleApp = (
  input: StapleAppInput,
): Effect.Effect<StapledApplicationBundle, StapleAppError, Stapler> =>
  Stapler.use((service) => service.stapleApp(input));

export const stapleFile = (
  input: StapleFileInput,
): Effect.Effect<StapledDiskImage | StapledInstallerPackage, StapleError, Stapler> =>
  Stapler.use((service) => service.stapleFile(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Stapler,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Stapler, makeService(options));
