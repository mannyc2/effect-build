import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ToolFailed } from "effect-build/BuildError";
import type { ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { capturePlatformServices, describe, resolveAppleTool, verifyFileArtifact } from "./internal.js";
import { captureBundle, captureBundlePath, makeBundleRemovable, materializeBundle } from "./internal/BundleIdentity.js";
import { AppleToolFact, Architecture, ProductKind, ProductStateInvalid, Sha256 } from "./Model.js";
import type {
  AppleToolOptions,
  FileArtifactIdentityMismatch,
  StapledApplicationBundle,
  StapledDiskImage,
  StapledInstallerPackage,
} from "./Model.js";

/** Final core bundle assessed from its exact symlink-aware manifest. */
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

/** Digest-bound host-local Gatekeeper and signature observation. */
export class GatekeeperAccepted extends Schema.Class<GatekeeperAccepted>(
  "effect-build-apple/GatekeeperAccepted",
)({
  kind: ProductKind,
  architecture: Architecture,
  identityKind: Schema.Literals(["file-bytes", "bundle-manifest"] as const),
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  accepted: Schema.Literal(true),
  gatekeeper: AppleToolFact,
  structuralVerifier: AppleToolFact,
}) {}

/** The selected assessment path could not be represented as one stable product identity. */
export class ArtifactInspectionFailed extends Schema.TaggedError<ArtifactInspectionFailed>()(
  "AppleArtifactInspectionFailed",
  {
    path: Schema.NonEmptyString,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `could not inspect Apple artifact ${this.path}: ${this.reason}`;
  }
}

/** Product bytes changed between the pre-verification and post-verification observations. */
export class ArtifactChangedDuringAssessment extends Schema.TaggedError<ArtifactChangedDuringAssessment>()(
  "AppleArtifactChangedDuringAssessment",
  {
    path: Schema.NonEmptyString,
    beforeSha256: Sha256,
    afterSha256: Sha256,
  },
) {
  override get message(): string {
    return `Apple artifact changed while it was being assessed: ${this.path}`;
  }
}

export interface LayerOptions {
  readonly spctl: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type AssessError =
  | ToolFailed
  | ArtifactInspectionFailed
  | ArtifactChangedDuringAssessment
  | FileArtifactIdentityMismatch
  | ProductStateInvalid;

interface Service {
  readonly assess: (input: AssessInput) => Effect.Effect<GatekeeperAccepted, AssessError>;
}

export class Assessor extends Context.Service<Assessor, Service>()(
  "effect-build-apple/Assess/Assessor",
) {}

type LayerError = ToolNotFound | ToolFailed;

const gatekeeperArgs = (kind: "app" | "dmg" | "pkg", artifactPath: string): readonly string[] => {
  switch (kind) {
    case "app":
      return ["--assess", "--type", "execute", "--verbose=4", artifactPath];
    case "dmg":
      return [
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        "--verbose=4",
        artifactPath,
      ];
    case "pkg":
      return ["--assess", "--type", "install", "--verbose=4", artifactPath];
  }
};

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const spctl = yield* resolveAppleTool("spctl", options.spctl, ["--version"]);
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);
    const pkgutil = yield* resolveAppleTool("pkgutil", options.pkgutil, ["--help"]);

    const assess = Effect.fn("effect-build-apple.assess")(function*(input: AssessInput) {
      return yield* Effect.scoped(Effect.gen(function*() {
        const originalPath = path.resolve(input.kind === "app" ? input.artifact.outdir : input.artifact.path);
        const ticket = input.artifact.notarizationTicket;
        if (
          input.artifact.tool.name !== "stapler"
          || ticket.targetKind !== input.kind
          || ticket.targetArchitecture !== input.artifact.architecture
          || ticket.targetIdentityKind !== (input.kind === "app" ? "bundle-manifest" : "file-bytes")
          || (input.kind === "app" ? ticket.submittedKind !== "zip" : ticket.submittedKind !== input.kind)
        ) {
          return yield* new ProductStateInvalid({
            operation: `Gatekeeper assess ${input.kind}`,
            path: originalPath,
            expected: "correlated notarization acceptance and validated stapling evidence",
          });
        }
        const staging = yield* fileSystem.makeTempDirectoryScoped({ prefix: ".effect-build-assess-" }).pipe(
          Effect.mapError((error) =>
            new ArtifactInspectionFailed({ path: originalPath, reason: `create private snapshot: ${describe(error)}` })
          ),
        );
        let artifactPath: string;
        let before: {
          readonly identityKind: "file-bytes" | "bundle-manifest";
          readonly bytes: number;
          readonly sha256: Sha256;
        };
        if (input.kind === "app") {
          const captured = yield* captureBundle(input.artifact).pipe(
            Effect.mapError((error) => new ArtifactInspectionFailed({ path: error.path, reason: error.reason })),
          );
          artifactPath = path.join(staging, captured.identity.bundleName);
          yield* Effect.addFinalizer(() => makeBundleRemovable(captured, artifactPath));
          yield* materializeBundle(captured, artifactPath).pipe(
            Effect.mapError((error) => new ArtifactInspectionFailed({ path: error.path, reason: error.reason })),
          );
          before = {
            identityKind: "bundle-manifest",
            bytes: captured.identity.artifactBytes,
            sha256: captured.identity.artifactSha256,
          };
        } else {
          const verified = yield* verifyFileArtifact(`assess ${input.kind}`, input.artifact);
          artifactPath = path.join(staging, path.basename(verified.source));
          yield* fileSystem.writeFile(artifactPath, verified.contents).pipe(
            Effect.mapError((error) =>
              new ArtifactInspectionFailed({ path: originalPath, reason: `write private snapshot: ${describe(error)}` })
            ),
          );
          before = { identityKind: "file-bytes", bytes: verified.bytes, sha256: verified.sha256 };
        }
        yield* Toolchain.runOrFail({
          tool: "spctl",
          executable: spctl.executable,
          args: gatekeeperArgs(input.kind, artifactPath),
        });
        const structural = input.kind === "pkg" ? pkgutil : codesign;
        yield* Toolchain.runOrFail({
          tool: input.kind === "pkg" ? "pkgutil" : "codesign",
          executable: structural.executable,
          args: input.kind === "pkg"
            ? ["--check-signature", artifactPath]
            : input.kind === "app"
            ? ["--verify", "--deep", "--strict", "--verbose=2", artifactPath]
            : ["--verify", "--strict", "--verbose=2", artifactPath],
        });
        const after = input.kind === "app"
          ? yield* captureBundlePath(artifactPath).pipe(
            Effect.mapError((error) => new ArtifactInspectionFailed({ path: error.path, reason: error.reason })),
            Effect.map((captured) => ({
              identityKind: "bundle-manifest" as const,
              bytes: captured.identity.artifactBytes,
              sha256: captured.identity.artifactSha256,
            })),
          )
          : yield* verifyFileArtifact(`assess ${input.kind}`, {
            ...input.artifact,
            path: artifactPath,
          }).pipe(
            Effect.map((verified) => ({
              identityKind: "file-bytes" as const,
              bytes: verified.bytes,
              sha256: verified.sha256,
            })),
          );
        if (before.sha256 !== after.sha256 || before.bytes !== after.bytes) {
          return yield* new ArtifactChangedDuringAssessment({
            path: originalPath,
            beforeSha256: before.sha256,
            afterSha256: after.sha256,
          });
        }
        return new GatekeeperAccepted({
          kind: input.kind,
          architecture: input.artifact.architecture,
          identityKind: after.identityKind,
          artifactBytes: after.bytes,
          artifactSha256: after.sha256,
          accepted: true,
          gatekeeper: new AppleToolFact({ name: "spctl", version: spctl.tool.version }),
          structuralVerifier: new AppleToolFact({
            name: input.kind === "pkg" ? "pkgutil" : "codesign",
            version: structural.tool.version,
          }),
        });
      }));
    });

    return { assess: (input) => assess(input).pipe(Effect.provide(services)) };
  });

export const assess = (
  input: AssessInput,
): Effect.Effect<GatekeeperAccepted, AssessError, Assessor> => Assessor.use((service) => service.assess(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Assessor,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Assessor, makeService(options));
