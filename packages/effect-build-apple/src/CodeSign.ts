import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import * as Tree from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleOperationInvalid,
  AppleToolChanged,
  AppleToolFailed,
  AppleToolUnavailable,
  capturePlatformServices,
  combineToolObservations,
  copyTreeSnapshot,
  isSafeRelative,
  selectAppleTool,
} from "./internal.js";
import {
  CertificateSha1,
  DeveloperIdApplicationSignature,
  DeveloperIdDiskImageSignature,
  DeveloperIdInstallerSignature,
} from "./Model.js";
import type {
  AppleToolOptions,
  ApplicationBundle,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
  UdzoDiskImage,
  UnsignedInstallerPackage,
} from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";
export { CertificateSha1 } from "./Model.js";
export type { DeveloperIdApplicationBundle, DeveloperIdDiskImage, DeveloperIdInstallerPackage } from "./Model.js";

interface IdentityMaterial {
  readonly certificateSha1: CertificateSha1;
}

interface IdentityService {
  readonly material: Effect.Effect<IdentityMaterial>;
}

export class DeveloperIdApplicationIdentity extends Context.Service<DeveloperIdApplicationIdentity, IdentityService>()(
  "effect-build-apple/CodeSign/DeveloperIdApplicationIdentity",
) {}

export class DeveloperIdInstallerIdentity extends Context.Service<DeveloperIdInstallerIdentity, IdentityService>()(
  "effect-build-apple/CodeSign/DeveloperIdInstallerIdentity",
) {}

export const developerIdApplicationIdentityLayer = (
  certificateSha1: CertificateSha1,
): Layer.Layer<DeveloperIdApplicationIdentity> =>
  Layer.succeed(DeveloperIdApplicationIdentity, { material: Effect.succeed({ certificateSha1 }) });

export const developerIdInstallerIdentityLayer = (
  certificateSha1: CertificateSha1,
): Layer.Layer<DeveloperIdInstallerIdentity> =>
  Layer.succeed(DeveloperIdInstallerIdentity, { material: Effect.succeed({ certificateSha1 }) });

export interface NestedCode {
  readonly path: string;
  readonly entitlements?: Artifact.HashedFile;
}

export interface SignAppInput {
  readonly sourceApp: ApplicationBundle;
  readonly outdir: string;
  readonly entitlements?: Artifact.HashedFile;
  readonly nestedCode?: readonly NestedCode[];
}

export interface SignDiskImageInput {
  readonly sourceDiskImage: UdzoDiskImage;
  readonly outfile: string;
}

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
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | File.PublicationFailure
  | Tree.TreeVerificationFailed
  | Tree.PublicationFailure;

interface AppService {
  readonly signApp: (input: SignAppInput) => Effect.Effect<DeveloperIdApplicationBundle, SignError>;
  readonly signDiskImage: (input: SignDiskImageInput) => Effect.Effect<DeveloperIdDiskImage, SignError>;
}

interface InstallerService {
  readonly signInstallerPackage: (
    input: SignInstallerPackageInput,
  ) => Effect.Effect<DeveloperIdInstallerPackage, SignError>;
}

export class AppSigner extends Context.Service<AppSigner, AppService>()("effect-build-apple/CodeSign/AppSigner") {}
export class InstallerSigner extends Context.Service<InstallerSigner, InstallerService>()(
  "effect-build-apple/CodeSign/InstallerSigner",
) {}

const signArgs = (identity: CertificateSha1, target: string, entitlements?: string): readonly string[] => [
  "--force",
  "--sign",
  identity,
  "--timestamp",
  "--options",
  "runtime",
  ...(entitlements === undefined ? [] : ["--entitlements", entitlements]),
  target,
];

const verifyAppArgs = (target: string): readonly string[] => ["--verify", "--deep", "--strict", "--verbose=2", target];

const invalid = (operation: string, path: string, reason: string): AppleOperationInvalid =>
  new AppleOperationInvalid({ operation, path, reason });

type LayerError = AppleToolUnavailable | AppleToolFailed;

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
    const codesign = yield* selectAppleTool("codesign", options.codesign, ["--version"], "developer-id-signing");

    const signApp = Effect.fn("effect-build-apple.signApp")(function*(input: SignAppInput) {
      const destination = path.resolve(input.outdir);
      if (!path.basename(input.sourceApp.root).endsWith(".app") || !path.basename(destination).endsWith(".app")) {
        return yield* invalid("Developer ID app signing", destination, "source and output must end in .app");
      }
      for (const nested of input.nestedCode ?? []) {
        if (!isSafeRelative(nested.path)) {
          return yield* invalid("Developer ID app signing", destination, `unsafe nested code path ${nested.path}`);
        }
      }
      let rootSigningIdentity: IdentityMaterial | undefined;
      const signed = yield* Tree.withVerifiedSnapshot(input.sourceApp, (snapshot) =>
        Tree.publish(
          { outdir: input.outdir, observation: "hashed", provenance: codesign.observation },
          (staging) =>
            Effect.scoped(
              Effect.gen(function*() {
                yield* copyTreeSnapshot(snapshot, staging);
                const entitlementDirectory = yield* fileSystem.makeTempDirectoryScoped({
                  directory: path.dirname(staging),
                  prefix: ".effect-build-entitlements-",
                }).pipe(Effect.mapError((error) => invalid("create entitlements directory", staging, String(error))));
                const appEntitlementsPath = input.entitlements === undefined
                  ? undefined
                  : path.join(entitlementDirectory, "app.plist");
                if (input.entitlements !== undefined && appEntitlementsPath !== undefined) {
                  yield* File.withVerifiedBytes(input.entitlements, (contents) =>
                    fileSystem.writeFile(appEntitlementsPath, contents).pipe(
                      Effect.mapError((error) => invalid("write app entitlements", appEntitlementsPath, String(error))),
                    ));
                }
                const nested = [...(input.nestedCode ?? [])].sort((left, right) =>
                  right.path.split(/[\\/]/u).length - left.path.split(/[\\/]/u).length
                  || left.path.localeCompare(right.path)
                );
                for (const [index, item] of nested.entries()) {
                  const entitlementsPath = item.entitlements === undefined
                    ? undefined
                    : path.join(entitlementDirectory, `nested-${index}.plist`);
                  if (item.entitlements !== undefined && entitlementsPath !== undefined) {
                    yield* File.withVerifiedBytes(item.entitlements, (contents) =>
                      fileSystem.writeFile(entitlementsPath, contents).pipe(
                        Effect.mapError((error) =>
                          invalid("write nested entitlements", entitlementsPath, String(error))
                        ),
                      ));
                  }
                  const identity = yield* identityService.material;
                  yield* codesign.run(
                    signArgs(identity.certificateSha1, path.join(staging, item.path), entitlementsPath),
                    { redact: [identity.certificateSha1] },
                  );
                }
                const rootIdentity = yield* identityService.material;
                rootSigningIdentity = rootIdentity;
                yield* codesign.run(signArgs(rootIdentity.certificateSha1, staging, appEntitlementsPath), {
                  redact: [rootIdentity.certificateSha1],
                });
                yield* codesign.run(verifyAppArgs(staging));
              }),
            ),
        ));
      if (rootSigningIdentity === undefined) {
        return yield* invalid("Developer ID app signing", destination, "identity unavailable");
      }
      return Object.freeze({
        ...signed,
        architecture: input.sourceApp.architecture,
        signature: new DeveloperIdApplicationSignature({
          architecture: input.sourceApp.architecture,
          certificateSha1: rootSigningIdentity.certificateSha1,
          tool: codesign.observation,
          hardenedRuntime: true,
          secureTimestamp: true,
        }),
      });
    });

    const signDiskImage = Effect.fn("effect-build-apple.signDiskImage")(function*(input: SignDiskImageInput) {
      const destination = path.resolve(input.outfile);
      if (!path.basename(input.sourceDiskImage.path).endsWith(".dmg") || !path.basename(destination).endsWith(".dmg")) {
        return yield* invalid("Developer ID disk-image signing", destination, "source and output must end in .dmg");
      }
      let signingIdentity: IdentityMaterial | undefined;
      const signed = yield* File.withVerifiedBytes(input.sourceDiskImage, (contents) =>
        File.publish(
          { destination: input.outfile, observation: "hashed", provenance: codesign.observation },
          (stagedPath) =>
            Effect.gen(function*() {
              yield* fileSystem.writeFile(stagedPath, contents).pipe(
                Effect.mapError((error) => invalid("stage unsigned disk image", stagedPath, String(error))),
              );
              const identity = yield* identityService.material;
              signingIdentity = identity;
              yield* codesign.run(["--force", "--sign", identity.certificateSha1, "--timestamp", stagedPath], {
                redact: [identity.certificateSha1],
              });
              yield* codesign.run(["--verify", "--strict", "--verbose=2", stagedPath]);
            }),
        ));
      if (signingIdentity === undefined) {
        return yield* invalid("Developer ID disk-image signing", destination, "identity unavailable");
      }
      return Object.freeze({
        ...signed,
        architecture: input.sourceDiskImage.architecture,
        signature: new DeveloperIdDiskImageSignature({
          architecture: input.sourceDiskImage.architecture,
          certificateSha1: signingIdentity.certificateSha1,
          tool: codesign.observation,
          secureTimestamp: true,
        }),
      });
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
    const productsign = yield* selectAppleTool("productsign", options.productsign, ["--version"], "installer-signing");
    const pkgutil = yield* selectAppleTool("pkgutil", options.pkgutil, ["--help"], "package-signature-verification");
    const installerSigningProvenance = combineToolObservations(productsign.observation, pkgutil.observation);

    const signInstallerPackage = Effect.fn("effect-build-apple.signInstallerPackage")(
      function*(input: SignInstallerPackageInput) {
        const destination = path.resolve(input.outfile);
        if (!path.basename(input.sourcePackage.path).endsWith(".pkg") || !path.basename(destination).endsWith(".pkg")) {
          return yield* invalid("Developer ID installer signing", destination, "source and output must end in .pkg");
        }
        let signingIdentity: IdentityMaterial | undefined;
        const signed = yield* File.withVerifiedBytes(input.sourcePackage, (contents) =>
          File.publish(
            { destination: input.outfile, observation: "hashed", provenance: installerSigningProvenance },
            (stagedPath) =>
              Effect.scoped(
                Effect.gen(function*() {
                  const unsigned = yield* fileSystem.makeTempFileScoped({
                    directory: path.dirname(stagedPath),
                    prefix: ".effect-build-unsigned-installer-",
                    suffix: ".pkg",
                  }).pipe(Effect.mapError((error) => invalid("stage unsigned installer", stagedPath, String(error))));
                  yield* fileSystem.writeFile(unsigned, contents).pipe(
                    Effect.mapError((error) => invalid("stage unsigned installer", unsigned, String(error))),
                  );
                  const identity = yield* identityService.material;
                  signingIdentity = identity;
                  yield* productsign.run([
                    "--sign",
                    identity.certificateSha1,
                    "--timestamp",
                    unsigned,
                    stagedPath,
                  ], { redact: [identity.certificateSha1] });
                  yield* pkgutil.run(["--check-signature", stagedPath]);
                }),
              ),
          ));
        if (signingIdentity === undefined) {
          return yield* invalid("Developer ID installer signing", destination, "identity unavailable");
        }
        return Object.freeze({
          ...signed,
          architecture: input.sourcePackage.architecture,
          signature: new DeveloperIdInstallerSignature({
            architecture: input.sourcePackage.architecture,
            certificateSha1: signingIdentity.certificateSha1,
            signer: productsign.observation,
            verifier: pkgutil.observation,
          }),
        });
      },
    );
    return {
      signInstallerPackage: (input) => signInstallerPackage(input).pipe(Effect.provide(services)),
    };
  });

export const signApp = (input: SignAppInput): Effect.Effect<DeveloperIdApplicationBundle, SignError, AppSigner> =>
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
