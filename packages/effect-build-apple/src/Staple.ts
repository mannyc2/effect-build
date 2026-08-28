import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as File from "effect-build/Author/File";
import * as Tree from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleOperationInvalid,
  AppleToolChanged,
  AppleToolFailed,
  AppleToolUnavailable,
  capturePlatformServices,
  copyTreeSnapshot,
  selectAppleTool,
} from "./internal.js";
import {
  hasDeveloperIdApplicationSignature,
  hasDeveloperIdDiskImageSignature,
  hasDeveloperIdInstallerSignature,
  NotarizationTicket,
  ProductStateInvalid,
} from "./Model.js";
import type {
  AppleToolOptions,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
  StapledApplicationBundle,
  StapledDiskImage,
  StapledInstallerPackage,
} from "./Model.js";
import type { AcceptedReference } from "./Notary.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export interface StapleAppInput {
  readonly source: DeveloperIdApplicationBundle;
  readonly acceptance: AcceptedReference;
  readonly outdir: string;
}

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

export class AcceptanceMismatch extends Schema.TaggedError<AcceptanceMismatch>()(
  "NotaryAcceptanceMismatch",
  {
    submissionId: Schema.NonEmptyString,
    expectedKind: Schema.Literals(["app", "dmg", "pkg"] as const),
    acceptedKind: Schema.NonEmptyString,
    expectedBytes: Schema.String,
    acceptedBytes: Schema.String,
    expectedDigest: Schema.String,
    acceptedDigest: Schema.String,
  },
) {}

export interface LayerOptions {
  readonly stapler: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type StapleError =
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | File.PublicationFailure
  | Tree.TreeVerificationFailed
  | Tree.PublicationFailure
  | AcceptanceMismatch
  | ProductStateInvalid;
export type StapleAppError = StapleError;

interface Service {
  readonly stapleApp: (input: StapleAppInput) => Effect.Effect<StapledApplicationBundle, StapleAppError>;
  readonly stapleFile: (
    input: StapleFileInput,
  ) => Effect.Effect<StapledDiskImage | StapledInstallerPackage, StapleError>;
}

export class Stapler extends Context.Service<Stapler, Service>()("effect-build-apple/Staple/Stapler") {}

const invalid = (operation: string, path: string, reason: string): AppleOperationInvalid =>
  new AppleOperationInvalid({ operation, path, reason });

type LayerError = AppleToolUnavailable | AppleToolFailed;

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const stapler = yield* selectAppleTool("stapler", options.stapler, ["-h"], "ticket-stapling");
    const codesign = yield* selectAppleTool("codesign", options.codesign, ["--version"], "signature-verification");
    const pkgutil = yield* selectAppleTool("pkgutil", options.pkgutil, ["--help"], "package-signature-verification");

    const mismatch = (
      acceptance: AcceptedReference,
      expectedKind: "app" | "dmg" | "pkg",
      expectedBytes: string,
      expectedDigest: string,
    ) =>
      new AcceptanceMismatch({
        submissionId: acceptance.submissionId,
        expectedKind,
        acceptedKind: acceptance.stapleTarget.kind,
        expectedBytes,
        acceptedBytes: acceptance.stapleTarget.artifactBytes,
        expectedDigest,
        acceptedDigest: acceptance.stapleTarget.artifactDigest.value,
      });

    const ticket = (input: StapleAppInput | StapleFileInput) =>
      new NotarizationTicket({
        submissionId: input.acceptance.submissionId,
        submittedKind: input.acceptance.kind,
        submittedBytes: input.acceptance.artifactBytes,
        submittedDigest: input.acceptance.artifactDigest,
        targetKind: input.acceptance.stapleTarget.kind,
        targetIdentityKind: input.acceptance.stapleTarget.identityKind,
        targetBytes: input.acceptance.stapleTarget.artifactBytes,
        targetDigest: input.acceptance.stapleTarget.artifactDigest,
        targetArchitecture: input.source.architecture,
        ...(input.acceptance.stapleTarget.bundleName === undefined
          ? {}
          : { targetBundleName: input.acceptance.stapleTarget.bundleName }),
        submissionTool: input.acceptance.submissionTool,
        acceptanceTool: input.acceptance.tool,
      });

    const stapleApp = Effect.fn("effect-build-apple.stapleApp")(function*(input: StapleAppInput) {
      const destination = path.resolve(input.outdir);
      if (
        !hasDeveloperIdApplicationSignature(input.source)
        || !path.basename(input.source.root).endsWith(".app")
        || !path.basename(destination).endsWith(".app")
      ) {
        return yield* new ProductStateInvalid({
          operation: "staple app",
          path: input.source.root,
          expected: "a Developer ID Application .app source and .app output",
        });
      }
      const target = input.acceptance.stapleTarget;
      if (
        input.acceptance.providerStatus !== "Accepted"
        || input.acceptance.architecture !== input.source.architecture
        || target.kind !== "app"
        || target.identityKind !== "tree-manifest"
        || target.bundleName !== path.basename(input.source.root)
        || target.artifactBytes !== input.source.totalBytes
        || target.artifactDigest.value !== input.source.manifestDigest.value
      ) {
        return yield* mismatch(input.acceptance, "app", input.source.totalBytes, input.source.manifestDigest.value);
      }
      const stapled = yield* Tree.withVerifiedSnapshot(input.source, (snapshot) =>
        Tree.publish(
          { outdir: input.outdir, observation: "hashed", provenance: stapler.observation },
          (staging) =>
            Effect.gen(function*() {
              yield* copyTreeSnapshot(snapshot, staging);
              yield* codesign.run(["--verify", "--deep", "--strict", "--verbose=2", staging]);
              yield* stapler.run(["staple", staging]);
              yield* stapler.run(["validate", staging]);
              yield* codesign.run(["--verify", "--deep", "--strict", "--verbose=2", staging]);
            }),
        ));
      return Object.freeze({
        ...stapled,
        architecture: input.source.architecture,
        signature: input.source.signature,
        notarizationTicket: ticket(input),
      });
    });

    const stapleFile = Effect.fn("effect-build-apple.stapleFile")(function*(input: StapleFileInput) {
      const destination = path.resolve(input.outfile);
      if (
        !path.basename(input.source.path).endsWith(`.${input.kind}`)
        || !path.basename(destination).endsWith(`.${input.kind}`)
      ) {
        return yield* new ProductStateInvalid({
          operation: `staple ${input.kind}`,
          path: input.source.path,
          expected: `.${input.kind} source and output paths`,
        });
      }
      const valid = input.kind === "dmg"
        ? hasDeveloperIdDiskImageSignature(input.source)
        : hasDeveloperIdInstallerSignature(input.source);
      if (!valid) {
        return yield* new ProductStateInvalid({
          operation: `staple ${input.kind}`,
          path: input.source.path,
          expected: "a Developer ID-signed product",
        });
      }
      const target = input.acceptance.stapleTarget;
      if (
        input.acceptance.providerStatus !== "Accepted"
        || input.acceptance.architecture !== input.source.architecture
        || target.kind !== input.kind
        || target.identityKind !== "file-bytes"
        || target.artifactBytes !== input.source.bytes
        || target.artifactDigest.value !== input.source.digest.value
      ) {
        return yield* mismatch(input.acceptance, input.kind, input.source.bytes, input.source.digest.value);
      }
      const stapled = yield* File.withVerifiedBytes(input.source, (contents) =>
        File.publish(
          { destination: input.outfile, observation: "hashed", provenance: stapler.observation },
          (stagedPath) =>
            Effect.gen(function*() {
              yield* fileSystem.writeFile(stagedPath, contents).pipe(
                Effect.mapError((error) => invalid(`stage ${input.kind} for stapling`, stagedPath, String(error))),
              );
              const verifier = input.kind === "pkg" ? pkgutil : codesign;
              yield* verifier.run(
                input.kind === "pkg"
                  ? ["--check-signature", stagedPath]
                  : ["--verify", "--strict", "--verbose=2", stagedPath],
              );
              yield* stapler.run(["staple", stagedPath]);
              yield* stapler.run(["validate", stagedPath]);
              yield* verifier.run(
                input.kind === "pkg"
                  ? ["--check-signature", stagedPath]
                  : ["--verify", "--strict", "--verbose=2", stagedPath],
              );
            }),
        ));
      const notarizationTicket = ticket(input);
      return input.kind === "dmg"
        ? Object.freeze({
          ...stapled,
          architecture: input.source.architecture,
          signature: input.source.signature,
          notarizationTicket,
        })
        : Object.freeze({
          ...stapled,
          architecture: input.source.architecture,
          signature: input.source.signature,
          notarizationTicket,
        });
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
