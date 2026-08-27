import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { PublishFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  capturePlatformServices,
  isSafeRelative,
  publishFailure,
  resolveAppleTool,
  scrubToolFailure,
  verifyFileArtifact,
} from "./internal.js";
import { captureBundle, materializeBundle } from "./internal/BundleIdentity.js";
import {
  AppleToolFact,
  CertificateSha1,
  DeveloperIdApplicationSignature,
  DeveloperIdDiskImageSignature,
  DeveloperIdInstallerSignature,
} from "./Model.js";
import type {
  AppleToolOptions,
  ApplicationBundle,
  BundleInspectionFailed,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
  FileArtifactIdentityMismatch,
  UdzoDiskImage,
  UnsignedInstallerPackage,
} from "./Model.js";

export { CertificateSha1 } from "./Model.js";
export type { DeveloperIdApplicationBundle, DeveloperIdDiskImage, DeveloperIdInstallerPackage } from "./Model.js";

interface IdentityMaterial {
  readonly certificateSha1: CertificateSha1;
  readonly redact: (failure: ToolFailed) => ToolFailed;
}

interface IdentityService {
  readonly material: Effect.Effect<IdentityMaterial>;
}

/** Process-local Developer ID Application identity. */
export class DeveloperIdApplicationIdentity extends Context.Service<
  DeveloperIdApplicationIdentity,
  IdentityService
>()("effect-build-apple/CodeSign/DeveloperIdApplicationIdentity") {}

/** Process-local Developer ID Installer identity; never interchangeable with the app identity. */
export class DeveloperIdInstallerIdentity extends Context.Service<
  DeveloperIdInstallerIdentity,
  IdentityService
>()("effect-build-apple/CodeSign/DeveloperIdInstallerIdentity") {}

const identityMaterial = (certificateSha1: CertificateSha1): IdentityMaterial => ({
  certificateSha1,
  redact: (failure) => scrubToolFailure(failure, [certificateSha1]),
});

export const developerIdApplicationIdentityLayer = (
  certificateSha1: CertificateSha1,
): Layer.Layer<DeveloperIdApplicationIdentity> =>
  Layer.succeed(DeveloperIdApplicationIdentity, { material: Effect.succeed(identityMaterial(certificateSha1)) });

export const developerIdInstallerIdentityLayer = (
  certificateSha1: CertificateSha1,
): Layer.Layer<DeveloperIdInstallerIdentity> =>
  Layer.succeed(DeveloperIdInstallerIdentity, { material: Effect.succeed(identityMaterial(certificateSha1)) });

/** One nested code item. Paths are relative to the copied `.app` and are signed deepest-first. */
export interface NestedCode {
  readonly path: string;
  readonly entitlements?: Artifact.FileArtifact;
}

/** Developer ID Application signing input. */
export interface SignAppInput {
  readonly sourceApp: ApplicationBundle;
  readonly outdir: string;
  readonly entitlements?: Artifact.FileArtifact;
  readonly nestedCode?: readonly NestedCode[];
}

/** Developer ID Application signing input for a core-finalized UDIF disk image. */
export interface SignDiskImageInput {
  readonly sourceDiskImage: UdzoDiskImage;
  readonly outfile: string;
}

/** Developer ID Installer signing input. */
export interface SignInstallerPackageInput {
  readonly sourcePackage: UnsignedInstallerPackage;
  readonly outfile: string;
}

export interface AppLayerOptions {
  readonly codesign: AppleToolOptions;
}

export interface InstallerLayerOptions {
  readonly productsign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type SignError =
  | ToolFailed
  | PublishFailed
  | ArtifactVerificationFailed
  | FileArtifactIdentityMismatch
  | BundleInspectionFailed;

interface AppService {
  readonly signApp: (input: SignAppInput) => Effect.Effect<DeveloperIdApplicationBundle, SignError>;
  readonly signDiskImage: (input: SignDiskImageInput) => Effect.Effect<DeveloperIdDiskImage, SignError>;
}

interface InstallerService {
  readonly signInstallerPackage: (
    input: SignInstallerPackageInput,
  ) => Effect.Effect<DeveloperIdInstallerPackage, SignError>;
}

export class AppSigner extends Context.Service<AppSigner, AppService>()(
  "effect-build-apple/CodeSign/AppSigner",
) {}

export class InstallerSigner extends Context.Service<InstallerSigner, InstallerService>()(
  "effect-build-apple/CodeSign/InstallerSigner",
) {}

const signArgs = (
  identity: CertificateSha1,
  target: string,
  entitlements: string | undefined,
): readonly string[] => [
  "--force",
  "--sign",
  identity,
  "--timestamp",
  "--options",
  "runtime",
  ...(entitlements === undefined ? [] : ["--entitlements", entitlements]),
  target,
];

const verifyAppArgs = (target: string): readonly string[] => [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  target,
];

type LayerError = ToolNotFound | ToolFailed;

const makeAppService = (
  options: AppLayerOptions,
): Effect.Effect<
  AppService,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | DeveloperIdApplicationIdentity
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const identityService = yield* DeveloperIdApplicationIdentity;
    const identity = yield* identityService.material;
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);

    const run = (args: readonly string[]) =>
      Toolchain.runOrFail({ tool: "codesign", executable: codesign.executable, args }).pipe(
        Effect.mapError(identity.redact),
      );

    const signApp = Effect.fn("effect-build-apple.signApp")(function*(input: SignAppInput) {
      const destination = path.resolve(input.outdir);
      if (
        !path.basename(path.resolve(input.sourceApp.outdir)).endsWith(".app")
        || !path.basename(destination).endsWith(".app")
      ) {
        return yield* new PublishFailed({
          destination,
          reason: "Developer ID Application signing requires .app source and output directories",
        });
      }
      for (const nested of input.nestedCode ?? []) {
        if (!isSafeRelative(nested.path)) {
          return yield* new PublishFailed({
            destination,
            reason: `nested code path is not a safe relative path: ${nested.path}`,
          });
        }
      }
      const appEntitlements = input.entitlements === undefined
        ? undefined
        : yield* verifyFileArtifact("Developer ID app entitlements", input.entitlements);
      const sourceApp = yield* captureBundle(input.sourceApp);
      const nestedWithEntitlements = yield* Effect.forEach(
        input.nestedCode ?? [],
        (nested) =>
          Effect.gen(function*() {
            const entitlements = nested.entitlements === undefined
              ? undefined
              : yield* verifyFileArtifact(`Developer ID nested entitlements ${nested.path}`, nested.entitlements);
            return { nested, entitlements };
          }),
        { concurrency: "unbounded" },
      );
      const signed = yield* Toolchain.publishBundle({
        tool: codesign.tool,
        outdir: input.outdir,
        produce: (staging) =>
          Effect.scoped(Effect.gen(function*() {
            yield* materializeBundle(sourceApp, staging);
            const entitlementDirectory = yield* fileSystem.makeTempDirectoryScoped({
              directory: path.dirname(staging),
              prefix: ".effect-build-entitlements-",
            }).pipe(Effect.mapError(publishFailure(destination, "create private entitlements directory")));
            const appEntitlementsPath = appEntitlements === undefined
              ? undefined
              : path.join(entitlementDirectory, "app.plist");
            if (appEntitlements !== undefined && appEntitlementsPath !== undefined) {
              yield* fileSystem.writeFile(appEntitlementsPath, appEntitlements.contents).pipe(
                Effect.mapError(publishFailure(destination, "write verified app entitlements")),
              );
            }
            const nested = [...nestedWithEntitlements].sort((left, right) =>
              right.nested.path.split(/[\\/]/).length - left.nested.path.split(/[\\/]/).length
              || left.nested.path.localeCompare(right.nested.path)
            );
            for (const [index, item] of nested.entries()) {
              const entitlementsPath = item.entitlements === undefined
                ? undefined
                : path.join(entitlementDirectory, `nested-${index}.plist`);
              if (item.entitlements !== undefined && entitlementsPath !== undefined) {
                yield* fileSystem.writeFile(entitlementsPath, item.entitlements.contents).pipe(
                  Effect.mapError(
                    publishFailure(destination, `write verified nested entitlements ${item.nested.path}`),
                  ),
                );
              }
              yield* run(signArgs(
                identity.certificateSha1,
                path.join(staging, item.nested.path),
                entitlementsPath,
              ));
            }
            yield* run(signArgs(
              identity.certificateSha1,
              staging,
              appEntitlementsPath,
            ));
            yield* run(verifyAppArgs(staging));
          })),
      });
      return {
        ...signed,
        architecture: input.sourceApp.architecture,
        signature: new DeveloperIdApplicationSignature({
          architecture: input.sourceApp.architecture,
          certificateSha1: identity.certificateSha1,
          tool: new AppleToolFact(codesign.tool),
          hardenedRuntime: true,
          secureTimestamp: true,
        }),
      };
    });

    const signDiskImage = Effect.fn("effect-build-apple.signDiskImage")(function*(input: SignDiskImageInput) {
      const destination = path.resolve(input.outfile);
      if (
        !path.basename(path.resolve(input.sourceDiskImage.path)).endsWith(".dmg")
        || !path.basename(destination).endsWith(".dmg")
      ) {
        return yield* new PublishFailed({ destination, reason: "disk-image signing requires .dmg input and output" });
      }
      const verified = yield* verifyFileArtifact("Developer ID disk-image signing", input.sourceDiskImage);
      const signed = yield* Toolchain.publishFile({
        tool: codesign.tool,
        outfile: input.outfile,
        produce: (stagedPath) =>
          Effect.gen(function*() {
            yield* fileSystem.writeFile(stagedPath, verified.contents).pipe(
              Effect.mapError(publishFailure(destination, "stage verified unsigned disk image")),
            );
            yield* run(["--force", "--sign", identity.certificateSha1, "--timestamp", stagedPath]);
            yield* run(["--verify", "--strict", "--verbose=2", stagedPath]);
          }),
      });
      return {
        ...signed,
        architecture: input.sourceDiskImage.architecture,
        signature: new DeveloperIdDiskImageSignature({
          architecture: input.sourceDiskImage.architecture,
          certificateSha1: identity.certificateSha1,
          tool: new AppleToolFact(codesign.tool),
          secureTimestamp: true,
        }),
      };
    });

    return {
      signApp: (input) => signApp(input).pipe(Effect.provide(services)),
      signDiskImage: (input) => signDiskImage(input).pipe(Effect.provide(services)),
    };
  });

const makeInstallerService = (
  options: InstallerLayerOptions,
): Effect.Effect<
  InstallerService,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | DeveloperIdInstallerIdentity
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const identityService = yield* DeveloperIdInstallerIdentity;
    const identity = yield* identityService.material;
    const productsign = yield* resolveAppleTool("productsign", options.productsign, ["--version"]);
    const pkgutil = yield* resolveAppleTool("pkgutil", options.pkgutil, ["--help"]);
    const tool: Artifact.Tool = {
      name: "productsign+pkgutil",
      version: `${productsign.tool.version};${pkgutil.tool.version}`,
    };
    const run = (toolName: string, executable: string, args: readonly string[]) =>
      Toolchain.runOrFail({ tool: toolName, executable, args }).pipe(Effect.mapError(identity.redact));

    const signInstallerPackage = Effect.fn("effect-build-apple.signInstallerPackage")(
      function*(input: SignInstallerPackageInput) {
        if (
          !path.basename(path.resolve(input.sourcePackage.path)).endsWith(".pkg")
          || !path.basename(path.resolve(input.outfile)).endsWith(".pkg")
        ) {
          return yield* new PublishFailed({
            destination: path.resolve(input.outfile),
            reason: "installer signing requires .pkg input and output",
          });
        }
        const verified = yield* verifyFileArtifact("Developer ID installer signing", input.sourcePackage);
        const signed = yield* Toolchain.publishFile({
          tool,
          outfile: input.outfile,
          produce: (stagedPath) =>
            Effect.gen(function*() {
              const verifiedSource = `${stagedPath}.unsigned.pkg`;
              yield* fileSystem.writeFile(verifiedSource, verified.contents).pipe(
                Effect.mapError(publishFailure(path.resolve(input.outfile), "stage verified unsigned installer")),
              );
              yield* run("productsign", productsign.executable, [
                "--sign",
                identity.certificateSha1,
                "--timestamp",
                verifiedSource,
                stagedPath,
              ]);
              yield* run("pkgutil", pkgutil.executable, ["--check-signature", stagedPath]);
            }),
        });
        return {
          ...signed,
          architecture: input.sourcePackage.architecture,
          signature: new DeveloperIdInstallerSignature({
            architecture: input.sourcePackage.architecture,
            certificateSha1: identity.certificateSha1,
            signer: new AppleToolFact(productsign.tool),
            verifier: new AppleToolFact(pkgutil.tool),
          }),
        };
      },
    );

    return {
      signInstallerPackage: (input) => signInstallerPackage(input).pipe(Effect.provide(services)),
    };
  });

export const signApp = (
  input: SignAppInput,
): Effect.Effect<DeveloperIdApplicationBundle, SignError, AppSigner> =>
  AppSigner.use((service) => service.signApp(input));

export const signInstallerPackage = (
  input: SignInstallerPackageInput,
): Effect.Effect<DeveloperIdInstallerPackage, SignError, InstallerSigner> =>
  InstallerSigner.use((service) => service.signInstallerPackage(input));

export const signDiskImage = (
  input: SignDiskImageInput,
): Effect.Effect<DeveloperIdDiskImage, SignError, AppSigner> =>
  AppSigner.use((service) => service.signDiskImage(input));

export const appLayer = (
  options: AppLayerOptions,
): Layer.Layer<
  AppSigner,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | DeveloperIdApplicationIdentity
> => Layer.effect(AppSigner, makeAppService(options));

export const installerLayer = (
  options: InstallerLayerOptions,
): Layer.Layer<
  InstallerSigner,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | DeveloperIdInstallerIdentity
> => Layer.effect(InstallerSigner, makeInstallerService(options));
