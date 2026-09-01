import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import type * as Tool from "effect-build/Author/Tool";
import * as Tree from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleToolChanged,
  AppleToolFailed,
  AppleToolUnavailable,
  capturePlatformServices,
  copyTreeSnapshot,
  describe,
  selectAppleTool,
} from "../internal.js";
import type { AppleToolOptions, ApplicationBundle } from "../Model.js";
import { ProductStateInvalid } from "../Model.js";
import * as Notary from "../Notary.js";
import { makeSubmissionEngine, type SubmissionModel } from "./NotarySubmission.js";

export interface SubmitInput {
  readonly bundle: ApplicationBundle;
}

export interface LayerOptions {
  readonly notarytool: AppleToolOptions;
  readonly ditto: AppleToolOptions;
  readonly codesign: AppleToolOptions;
}

export type SubmitError =
  | AppleToolChanged
  | AppleToolFailed
  | Notary.SubmissionOutcomeUnknown
  | Notary.SubmissionPreparationFailed
  | ProductStateInvalid
  | Tree.TreeVerificationFailed;

interface Service {
  readonly submitOnce: (input: SubmitInput) => Effect.Effect<Notary.Submission, SubmitError>;
}

export class Submitter extends Context.Service<Submitter, Service>()(
  "effect-build-apple/internal/NotaryRejectionFixture/Submitter",
) {}

interface AdHocRejectionSignatureFields {
  readonly architecture: ApplicationBundle["architecture"];
  readonly tool: Tool.Observation<"codesign">;
}

class AdHocRejectionSignature {
  readonly _tag = "AdHocRejectionSignature" as const;
  readonly architecture: ApplicationBundle["architecture"];
  readonly identity = "-" as const;
  readonly tool: Tool.Observation<"codesign">;
  readonly hardenedRuntime = true as const;
  readonly secureTimestamp = false as const;

  constructor(fields: AdHocRejectionSignatureFields) {
    this.architecture = fields.architecture;
    this.tool = fields.tool;
    Object.freeze(this);
  }
}

interface AdHocRejectionFixtureFields {
  readonly root: ApplicationBundle["root"];
  readonly architecture: ApplicationBundle["architecture"];
  readonly rootMode: ApplicationBundle["rootMode"];
  readonly entries: ApplicationBundle["entries"];
  readonly totalBytes: ApplicationBundle["totalBytes"];
  readonly manifestDigest: ApplicationBundle["manifestDigest"];
  readonly signature: AdHocRejectionSignature;
}

class AdHocRejectionFixture {
  readonly root: ApplicationBundle["root"];
  readonly architecture: ApplicationBundle["architecture"];
  readonly rootMode: ApplicationBundle["rootMode"];
  readonly entries: ApplicationBundle["entries"];
  readonly totalBytes: ApplicationBundle["totalBytes"];
  readonly manifestDigest: ApplicationBundle["manifestDigest"];
  readonly signature: AdHocRejectionSignature;

  constructor(fields: AdHocRejectionFixtureFields) {
    this.root = fields.root;
    this.architecture = fields.architecture;
    this.rootMode = fields.rootMode;
    this.entries = fields.entries;
    this.totalBytes = fields.totalBytes;
    this.manifestDigest = fields.manifestDigest;
    this.signature = fields.signature;
    Object.freeze(this);
  }
}

const submissionModel: SubmissionModel<
  Notary.Submission,
  Notary.Status,
  Notary.StapleTarget,
  Notary.ResponseInvalid,
  Notary.SubmissionPreparationFailed,
  Notary.SubmissionOutcomeUnknown
> = {
  responseInvalid: (fields) => new Notary.ResponseInvalid(fields),
  preparationFailed: (fields) => new Notary.SubmissionPreparationFailed(fields),
  isPreparationFailed: (value): value is Notary.SubmissionPreparationFailed =>
    value instanceof Notary.SubmissionPreparationFailed,
  outcomeUnknown: (fields) => new Notary.SubmissionOutcomeUnknown(fields),
  accepted: () => new Notary.Accepted({ providerStatus: "Accepted" }),
  pending: (providerStatus) => new Notary.Pending({ providerStatus }),
  rejected: (providerStatus, summary) =>
    new Notary.Rejected({ providerStatus, ...(summary === undefined ? {} : { summary }) }),
  submission: (fields) => new Notary.Submission(fields),
};

const adHocSignArgs = (target: string): readonly string[] => [
  "--force",
  "--deep",
  "--sign",
  "-",
  "--options",
  "runtime",
  "--timestamp=none",
  target,
];

const strictVerifyArgs = (target: string): readonly string[] => [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  target,
];

type LayerError = AppleToolUnavailable | AppleToolFailed;

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Notary.Credential
> =>
  Effect.gen(function*() {
    const { path, services } = yield* capturePlatformServices;
    const credential = yield* Notary.Credential;
    const notarytool = yield* selectAppleTool("notarytool", options.notarytool, "rejection-fixture-notarization");
    const ditto = yield* selectAppleTool("ditto", options.ditto, "rejection-fixture-archive-transport");
    const codesign = yield* selectAppleTool("codesign", options.codesign, "rejection-fixture-ad-hoc-signing");
    const submissionEngine = yield* makeSubmissionEngine({
      notarytool,
      ditto,
      codesign,
      credentialArguments: credential.arguments,
      model: submissionModel,
    });

    const submitOnce = Effect.fn("effect-build-apple.notarySubmitRejectionFixtureOnce")(function*(
      input: SubmitInput,
    ) {
      const bundleName = path.basename(input.bundle.root);
      const provenance = input.bundle.provenance;
      if (
        !bundleName.endsWith(".app")
        || !("name" in provenance)
        || provenance.name !== "plutil"
        || "signature" in input.bundle
      ) {
        return yield* new ProductStateInvalid({
          operation: "construct isolated Notary rejection fixture",
          path: input.bundle.root,
          expected: "an exact unsigned effect-build AppBundle .app with plutil provenance",
        });
      }

      const prepared = yield* Tree.withVerifiedSnapshot(input.bundle, (snapshot) =>
        BorrowedOutput.withTree(
          {
            prefix: "effect-build-notary-rejection-",
            produce: (ownedRoot) =>
              Effect.gen(function*() {
                const stagedApp = path.join(ownedRoot, bundleName);
                yield* copyTreeSnapshot(snapshot, stagedApp).pipe(
                  Effect.mapError((error) =>
                    new Notary.SubmissionPreparationFailed({ path: input.bundle.root, reason: error.message })
                  ),
                );
                yield* codesign.run(adHocSignArgs(stagedApp));
                yield* codesign.run(strictVerifyArgs(stagedApp));
                return stagedApp;
              }),
          },
          "hashed",
          (tree) =>
            Effect.gen(function*() {
              const fixture = new AdHocRejectionFixture({
                root: tree.root,
                architecture: input.bundle.architecture,
                rootMode: tree.initial.rootMode,
                entries: tree.initial.entries,
                totalBytes: tree.initial.totalBytes,
                manifestDigest: tree.initial.manifestDigest,
                signature: new AdHocRejectionSignature({
                  architecture: input.bundle.architecture,
                  tool: codesign.observation,
                }),
              });
              yield* codesign.run(strictVerifyArgs(fixture.root));
              yield* tree.observe;
              return yield* submissionEngine.prepareAppSnapshot({
                sourcePath: input.bundle.root,
                snapshotRoot: tree.root,
                identity: {
                  architecture: fixture.architecture,
                  bundleName,
                  rootMode: fixture.rootMode,
                  entries: fixture.entries,
                  totalBytes: fixture.totalBytes,
                  manifestDigest: fixture.manifestDigest,
                },
                stapleTarget: new Notary.StapleTarget({
                  kind: "app",
                  identityKind: "tree-manifest",
                  artifactBytes: fixture.totalBytes,
                  artifactDigest: fixture.manifestDigest,
                  bundleName,
                }),
              });
            }),
        ).pipe(
          Effect.provide(BorrowedOutput.CleanupReporter.layer),
          Effect.mapError((error) => {
            if (
              error instanceof AppleToolChanged
              || error instanceof AppleToolFailed
              || error instanceof Notary.SubmissionPreparationFailed
            ) return error;
            return new Notary.SubmissionPreparationFailed({ path: input.bundle.root, reason: describe(error) });
          }),
        ));
      return yield* submissionEngine.submitPreparedApp(prepared);
    });

    return { submitOnce: (input) => submitOnce(input).pipe(Effect.provide(services)) };
  });

export const submitOnce = (input: SubmitInput): Effect.Effect<Notary.Submission, SubmitError, Submitter> =>
  Submitter.use((service) => service.submitOnce(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Submitter,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Notary.Credential
> => Layer.effect(Submitter, makeService(options));
