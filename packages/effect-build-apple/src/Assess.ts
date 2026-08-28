import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import * as File from "effect-build/Author/File";
import type * as Tool from "effect-build/Author/Tool";
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
import { Architecture, ProductKind, ProductStateInvalid } from "./Model.js";
import type { AppleToolOptions, StapledApplicationBundle, StapledDiskImage, StapledInstallerPackage } from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export interface AssessAppInput {
  readonly kind: "app";
  readonly artifact: StapledApplicationBundle;
}

export interface AssessDiskImageInput {
  readonly kind: "dmg";
  readonly artifact: StapledDiskImage;
}

export interface AssessInstallerPackageInput {
  readonly kind: "pkg";
  readonly artifact: StapledInstallerPackage;
}

export type AssessInput = AssessAppInput | AssessDiskImageInput | AssessInstallerPackageInput;

const ToolObservation = Schema.declare<Tool.Observation<string>>(
  (value): value is Tool.Observation<string> => Artifact.isProvenance(value) && "name" in value,
  { title: "ToolObservation" },
);

export class GatekeeperAccepted extends Schema.Class<GatekeeperAccepted>(
  "effect-build-apple/GatekeeperAccepted",
)({
  kind: ProductKind,
  architecture: Architecture,
  identityKind: Schema.Literals(["file-bytes", "tree-manifest"] as const),
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  accepted: Schema.Literal(true),
  gatekeeper: ToolObservation,
  structuralVerifier: ToolObservation,
}) {}

export interface LayerOptions {
  readonly spctl: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type AssessError =
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | Tree.TreeVerificationFailed
  | BorrowedOutput.Failure
  | BorrowedOutput.CleanupFailedAfterSuccessfulUse
  | ProductStateInvalid;

interface Service {
  readonly assess: (input: AssessInput) => Effect.Effect<GatekeeperAccepted, AssessError>;
}

export class Assessor extends Context.Service<Assessor, Service>()("effect-build-apple/Assess/Assessor") {}

const gatekeeperArgs = (kind: "app" | "dmg" | "pkg", artifactPath: string): readonly string[] => {
  switch (kind) {
    case "app":
      return ["--assess", "--type", "execute", "--verbose=4", artifactPath];
    case "dmg":
      return ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", artifactPath];
    case "pkg":
      return ["--assess", "--type", "install", "--verbose=4", artifactPath];
  }
};

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
    const spctl = yield* selectAppleTool("spctl", options.spctl, ["--version"], "gatekeeper-assessment");
    const codesign = yield* selectAppleTool("codesign", options.codesign, ["--version"], "signature-verification");
    const pkgutil = yield* selectAppleTool("pkgutil", options.pkgutil, ["--help"], "package-signature-verification");

    const evaluate = (
      input: AssessInput,
      artifactPath: string,
      identityKind: "file-bytes" | "tree-manifest",
      artifactBytes: Artifact.DecimalBytes,
      artifactDigest: Artifact.Digest,
    ) =>
      Effect.gen(function*() {
        yield* spctl.run(gatekeeperArgs(input.kind, artifactPath));
        const structural = input.kind === "pkg" ? pkgutil : codesign;
        yield* structural.run(
          input.kind === "pkg"
            ? ["--check-signature", artifactPath]
            : input.kind === "app"
            ? ["--verify", "--deep", "--strict", "--verbose=2", artifactPath]
            : ["--verify", "--strict", "--verbose=2", artifactPath],
        );
        return new GatekeeperAccepted({
          kind: input.kind,
          architecture: input.artifact.architecture,
          identityKind,
          artifactBytes,
          artifactDigest,
          accepted: true,
          gatekeeper: spctl.observation,
          structuralVerifier: structural.observation,
        });
      });

    const assess = Effect.fn("effect-build-apple.assess")(function*(input: AssessInput) {
      const originalPath = input.kind === "app" ? input.artifact.root : input.artifact.path;
      const ticket = input.artifact.notarizationTicket;
      if (
        ticket.targetKind !== input.kind
        || ticket.targetArchitecture !== input.artifact.architecture
        || ticket.targetIdentityKind !== (input.kind === "app" ? "tree-manifest" : "file-bytes")
        || (input.kind === "app" ? ticket.submittedKind !== "zip" : ticket.submittedKind !== input.kind)
      ) {
        return yield* new ProductStateInvalid({
          operation: `Gatekeeper assess ${input.kind}`,
          path: originalPath,
          expected: "correlated notarization acceptance and validated stapling evidence",
        });
      }
      if (input.kind === "app") {
        return yield* Tree.withVerifiedSnapshot(input.artifact, (snapshot) =>
          BorrowedOutput.withTree(
            {
              prefix: "effect-build-assess-app-",
              produce: (ownedRoot) => {
                const staged = path.join(ownedRoot, path.basename(input.artifact.root));
                return copyTreeSnapshot(snapshot, staged).pipe(Effect.as(staged));
              },
            },
            "hashed",
            (tree) =>
              Effect.gen(function*() {
                const result = yield* evaluate(
                  input,
                  tree.root,
                  "tree-manifest",
                  input.artifact.totalBytes,
                  input.artifact.manifestDigest,
                );
                yield* tree.observe;
                return result;
              }),
          ).pipe(Effect.provide(BorrowedOutput.CleanupReporter.layer)));
      }
      return yield* File.withVerifiedBytes(input.artifact, (contents) =>
        BorrowedOutput.withFile(
          {
            prefix: "effect-build-assess-file-",
            produce: (ownedRoot) => {
              const staged = path.join(ownedRoot, path.basename(input.artifact.path));
              return fileSystem.writeFile(staged, contents).pipe(
                Effect.mapError((error) => invalid("prepare assessment", staged, String(error))),
                Effect.as(staged),
              );
            },
          },
          "hashed",
          (file) =>
            Effect.gen(function*() {
              const result = yield* evaluate(
                input,
                file.path,
                "file-bytes",
                input.artifact.bytes,
                input.artifact.digest,
              );
              yield* file.observe;
              return result;
            }),
        ).pipe(Effect.provide(BorrowedOutput.CleanupReporter.layer)));
    });

    return { assess: (input) => assess(input).pipe(Effect.provide(services)) };
  });

export const assess = (input: AssessInput): Effect.Effect<GatekeeperAccepted, AssessError, Assessor> =>
  Assessor.use((service) => service.assess(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Assessor,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Assessor, makeService(options));
