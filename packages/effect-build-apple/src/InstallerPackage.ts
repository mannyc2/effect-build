import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { PublishFailed, ToolFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { capturePlatformServices, ensureNewDestination, resolveAppleTool } from "./internal.js";
import { captureBundle, makeBundleRemovable, materializeBundle } from "./internal/BundleIdentity.js";
import type { BundleSnapshot } from "./internal/BundleIdentity.js";
import { hasDeveloperIdApplicationSignature, ProductStateInvalid } from "./Model.js";
import type {
  AppleToolOptions,
  Architecture,
  BundleInspectionFailed,
  DeveloperIdApplicationBundle,
  UnsignedInstallerPackage,
} from "./Model.js";

/** One unsigned architecture-specific installer package. */
export interface InstallerVariantInput<A extends Architecture = Architecture> {
  readonly sourceApp: DeveloperIdApplicationBundle & { readonly architecture: A };
  readonly outfile: string;
  readonly identifier: string;
  readonly version: string;
  readonly installLocation?: string;
}

/** Exact two-architecture unsigned installer request. */
export interface BuildInstallerPackagesInput {
  readonly arm64: InstallerVariantInput<"arm64">;
  readonly x64: InstallerVariantInput<"x64">;
}

export interface InstallerPackages {
  readonly arm64: UnsignedInstallerPackage & { readonly architecture: "arm64" };
  readonly x64: UnsignedInstallerPackage & { readonly architecture: "x64" };
}

export interface LayerOptions {
  readonly pkgbuild: AppleToolOptions;
  readonly productbuild: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
  readonly codesign: AppleToolOptions;
}

export type BuildInstallerPackagesError =
  | ToolFailed
  | PublishFailed
  | ArtifactVerificationFailed
  | BundleInspectionFailed
  | ProductStateInvalid;

interface Service {
  readonly buildInstallerPackages: (
    input: BuildInstallerPackagesInput,
  ) => Effect.Effect<InstallerPackages, BuildInstallerPackagesError>;
}

export class Builder extends Context.Service<Builder, Service>()(
  "effect-build-apple/InstallerPackage/Builder",
) {}

type LayerError = ToolNotFound | ToolFailed;

interface PreparedInstallerPackage {
  readonly input: InstallerVariantInput;
  readonly captured: BundleSnapshot;
}

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const pkgbuild = yield* resolveAppleTool("pkgbuild", options.pkgbuild, ["--version"]);
    const productbuild = yield* resolveAppleTool("productbuild", options.productbuild, ["--version"]);
    const pkgutil = yield* resolveAppleTool("pkgutil", options.pkgutil, ["--help"]);
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);
    const tool: Artifact.Tool = {
      name: "pkgbuild+productbuild+pkgutil",
      version: `${pkgbuild.tool.version};${productbuild.tool.version};${pkgutil.tool.version}`,
    };

    const prepareOne = Effect.fn("effect-build-apple.prepareInstallerPackage")(function*(
      input: InstallerVariantInput,
      expectedArchitecture: Architecture,
    ) {
      const sourceAppPath = path.resolve(input.sourceApp.outdir);
      if (!path.basename(path.resolve(input.outfile)).endsWith(".pkg")) {
        return yield* new PublishFailed({
          destination: path.resolve(input.outfile),
          reason: "flat installer outputs must end in .pkg",
        });
      }
      if (!hasDeveloperIdApplicationSignature(input.sourceApp)) {
        return yield* new ProductStateInvalid({
          operation: "build installer package",
          path: sourceAppPath,
          expected: "a strictly verified Developer ID Application bundle",
        });
      }
      if (!path.basename(sourceAppPath).endsWith(".app")) {
        return yield* new ProductStateInvalid({
          operation: "build installer package",
          path: sourceAppPath,
          expected: "a Developer ID Application .app bundle",
        });
      }
      if (input.sourceApp.architecture !== expectedArchitecture) {
        return yield* new ProductStateInvalid({
          operation: "build installer package",
          path: sourceAppPath,
          expected: `a ${expectedArchitecture} Developer ID Application bundle`,
        });
      }
      return {
        input,
        captured: yield* captureBundle(input.sourceApp),
      } satisfies PreparedInstallerPackage;
    });

    const buildOne = Effect.fn("effect-build-apple.buildInstallerPackage")(function*(
      prepared: PreparedInstallerPackage,
    ) {
      const { captured, input } = prepared;
      return yield* Toolchain.publishFile({
        tool,
        outfile: input.outfile,
        produce: (stagedPath) =>
          Effect.scoped(Effect.gen(function*() {
            const appParent = yield* fileSystem.makeTempDirectoryScoped({
              directory: path.dirname(stagedPath),
              prefix: ".effect-build-installer-app-",
            }).pipe(Effect.mapError((error) =>
              new PublishFailed({
                destination: path.resolve(input.outfile),
                reason: `create private app directory: ${String(error)}`,
              })
            ));
            const component = path.join(appParent, "component.pkg");
            const sourceApp = path.join(appParent, captured.identity.bundleName);
            yield* Effect.addFinalizer(() => makeBundleRemovable(captured, sourceApp));
            yield* materializeBundle(captured, sourceApp);
            yield* Toolchain.runOrFail({
              tool: "codesign",
              executable: codesign.executable,
              args: ["--verify", "--deep", "--strict", "--verbose=2", sourceApp],
            });
            yield* Toolchain.runOrFail({
              tool: "pkgbuild",
              executable: pkgbuild.executable,
              args: [
                "--component",
                sourceApp,
                "--identifier",
                input.identifier,
                "--version",
                input.version,
                "--install-location",
                input.installLocation ?? "/Applications",
                component,
              ],
            });
            yield* Toolchain.runOrFail({
              tool: "productbuild",
              executable: productbuild.executable,
              args: ["--package", component, stagedPath],
            });
            const payload = yield* Toolchain.runBytesOrFail({
              tool: "pkgutil",
              executable: pkgutil.executable,
              args: ["--payload-files", stagedPath],
            });
            const payloadText = yield* Effect.try({
              try: () => new TextDecoder("utf-8", { fatal: true }).decode(payload.stdout),
              catch: (error) =>
                new ToolFailed({
                  tool: "pkgutil",
                  exitCode: payload.exitCode,
                  stdout: "",
                  stderr: `payload listing was not valid UTF-8: ${String(error)}`,
                }),
            });
            const payloadRoots = payloadText
              .split(/\r?\n/)
              .map((line) => line.trim().replace(/^\.\//, "").split("/")[0])
              .filter((root): root is string => root !== undefined && root.length > 0);
            if (!payloadRoots.includes(captured.identity.bundleName)) {
              return yield* new ToolFailed({
                tool: "pkgutil",
                exitCode: payload.exitCode,
                stdout: payloadText,
                stderr: `installer payload did not contain ${captured.identity.bundleName} at its exact root`,
              });
            }
          })),
      });
    });

    const buildInstallerPackages = Effect.fn("effect-build-apple.buildInstallerPackages")(
      function*(input: BuildInstallerPackagesInput) {
        if (path.resolve(input.arm64.outfile) === path.resolve(input.x64.outfile)) {
          return yield* new PublishFailed({
            destination: path.resolve(input.arm64.outfile),
            reason: "arm64 and x64 installers require distinct output files",
          });
        }
        yield* ensureNewDestination(input.arm64.outfile);
        yield* ensureNewDestination(input.x64.outfile);
        for (const variant of [input.arm64, input.x64]) {
          if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/.test(variant.identifier)) {
            return yield* new PublishFailed({
              destination: path.resolve(variant.outfile),
              reason: `invalid installer identifier: ${variant.identifier}`,
            });
          }
        }
        const preparedArm64 = yield* prepareOne(input.arm64, "arm64");
        const preparedX64 = yield* prepareOne(input.x64, "x64");
        if (
          input.arm64.sourceApp.signature.certificateSha1
            !== input.x64.sourceApp.signature.certificateSha1
        ) {
          return yield* new ProductStateInvalid({
            operation: "build installer packages",
            path: path.resolve(input.x64.sourceApp.outdir),
            expected: "the same Developer ID Application identity as the arm64 app",
          });
        }
        let attemptedArm64 = false;
        let attemptedX64 = false;
        const pair = Effect.gen(function*() {
          attemptedArm64 = true;
          const arm64 = yield* buildOne(preparedArm64);
          attemptedX64 = true;
          const x64 = yield* buildOne(preparedX64);
          return {
            arm64: { ...arm64, architecture: "arm64" as const },
            x64: { ...x64, architecture: "x64" as const },
          };
        });
        return yield* pair.pipe(
          Effect.onExit((exit) =>
            Exit.isSuccess(exit)
              ? Effect.void
              : Effect.gen(function*() {
                if (attemptedArm64) {
                  yield* fileSystem.remove(path.resolve(input.arm64.outfile), { force: true }).pipe(Effect.ignore);
                }
                if (attemptedX64) {
                  yield* fileSystem.remove(path.resolve(input.x64.outfile), { force: true }).pipe(Effect.ignore);
                }
              })
          ),
        );
      },
    );

    return {
      buildInstallerPackages: (input) => buildInstallerPackages(input).pipe(Effect.provide(services)),
    };
  });

export const buildInstallerPackages = (
  input: BuildInstallerPackagesInput,
): Effect.Effect<InstallerPackages, BuildInstallerPackagesError, Builder> =>
  Builder.use((service) => service.buildInstallerPackages(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Builder,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Builder, makeService(options));
