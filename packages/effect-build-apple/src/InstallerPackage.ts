import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path } from "effect";
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
  ensureNewDestination,
  selectAppleTool,
} from "./internal.js";
import { hasDeveloperIdApplicationSignature, ProductStateInvalid } from "./Model.js";
import type {
  AppleToolOptions,
  Architecture,
  DeveloperIdApplicationBundle,
  UnsignedInstallerPackage,
} from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export interface InstallerVariantInput<A extends Architecture = Architecture> {
  readonly sourceApp: DeveloperIdApplicationBundle & { readonly architecture: A };
  readonly outfile: string;
  readonly identifier: string;
  readonly version: string;
  readonly installLocation?: string;
}

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
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.PublicationFailure
  | Tree.TreeVerificationFailed
  | ProductStateInvalid;

interface Service {
  readonly buildInstallerPackages: (
    input: BuildInstallerPackagesInput,
  ) => Effect.Effect<InstallerPackages, BuildInstallerPackagesError>;
}

export class Builder extends Context.Service<Builder, Service>()(
  "effect-build-apple/InstallerPackage/Builder",
) {}

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
    const pkgbuild = yield* selectAppleTool("pkgbuild", options.pkgbuild, ["--version"], "component-package");
    const productbuild = yield* selectAppleTool("productbuild", options.productbuild, ["--version"], "flat-package");
    const pkgutil = yield* selectAppleTool("pkgutil", options.pkgutil, ["--help"], "payload-verification");
    const codesign = yield* selectAppleTool("codesign", options.codesign, ["--version"], "app-signature-verification");
    const packageProvenance = combineToolObservations(
      productbuild.observation,
      pkgbuild.observation,
      pkgutil.observation,
    );

    const validate = (input: InstallerVariantInput, architecture: Architecture) => {
      const source = input.sourceApp.root;
      if (!path.basename(path.resolve(input.outfile)).endsWith(".pkg")) {
        return Effect.fail(invalid("build installer package", input.outfile, "output must end in .pkg"));
      }
      if (!hasDeveloperIdApplicationSignature(input.sourceApp) || !path.basename(source).endsWith(".app")) {
        return Effect.fail(
          new ProductStateInvalid({
            operation: "build installer package",
            path: source,
            expected: "a verified Developer ID Application .app bundle",
          }),
        );
      }
      if (input.sourceApp.architecture !== architecture) {
        return Effect.fail(
          new ProductStateInvalid({
            operation: "build installer package",
            path: source,
            expected: `a ${architecture} Developer ID Application bundle`,
          }),
        );
      }
      return Effect.void;
    };

    const buildOne = (input: InstallerVariantInput) =>
      Tree.withVerifiedSnapshot(input.sourceApp, (snapshot) =>
        File.publish(
          { destination: input.outfile, observation: "hashed", provenance: packageProvenance },
          (stagedPath) =>
            Effect.scoped(
              Effect.gen(function*() {
                const workspace = yield* fileSystem.makeTempDirectoryScoped({
                  directory: path.dirname(stagedPath),
                  prefix: ".effect-build-installer-",
                }).pipe(Effect.mapError((error) => invalid("create installer workspace", stagedPath, String(error))));
                const bundleName = path.basename(input.sourceApp.root);
                const sourceApp = path.join(workspace, bundleName);
                const component = path.join(workspace, "component.pkg");
                yield* copyTreeSnapshot(snapshot, sourceApp);
                yield* codesign.run(["--verify", "--deep", "--strict", "--verbose=2", sourceApp]);
                yield* pkgbuild.run([
                  "--component",
                  sourceApp,
                  "--identifier",
                  input.identifier,
                  "--version",
                  input.version,
                  "--install-location",
                  input.installLocation ?? "/Applications",
                  component,
                ]);
                yield* productbuild.run(["--package", component, stagedPath]);
                const payload = yield* pkgutil.run(["--payload-files", stagedPath]);
                const payloadText = yield* Effect.try({
                  try: () => new TextDecoder("utf-8", { fatal: true }).decode(payload.stdout),
                  catch: (error) =>
                    new AppleToolFailed({
                      tool: "pkgutil",
                      exitCode: payload.exitCode,
                      stdout: "",
                      stderr: `payload listing was not UTF-8: ${String(error)}`,
                    }),
                });
                const payloadRoots = payloadText
                  .split(/\r?\n/u)
                  .map((line) => line.trim().replace(/^\.\//u, "").split("/")[0])
                  .filter((root): root is string => root !== undefined && root.length > 0);
                if (!payloadRoots.includes(bundleName)) {
                  return yield* new AppleToolFailed({
                    tool: "pkgutil",
                    exitCode: payload.exitCode,
                    stdout: payloadText,
                    stderr: `installer payload did not contain ${bundleName} at its root`,
                  });
                }
              }),
            ),
        ));

    const buildInstallerPackages = Effect.fn("effect-build-apple.buildInstallerPackages")(
      function*(input: BuildInstallerPackagesInput) {
        const armDestination = path.resolve(input.arm64.outfile);
        const x64Destination = path.resolve(input.x64.outfile);
        if (armDestination === x64Destination) {
          return yield* invalid("build installer packages", armDestination, "arm64 and x64 outputs must differ");
        }
        yield* ensureNewDestination(armDestination);
        yield* ensureNewDestination(x64Destination);
        for (const variant of [input.arm64, input.x64]) {
          if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/u.test(variant.identifier)) {
            return yield* invalid("build installer package", variant.outfile, "invalid package identifier");
          }
        }
        yield* validate(input.arm64, "arm64");
        yield* validate(input.x64, "x64");
        if (input.arm64.sourceApp.signature.certificateSha1 !== input.x64.sourceApp.signature.certificateSha1) {
          return yield* new ProductStateInvalid({
            operation: "build installer packages",
            path: input.x64.sourceApp.root,
            expected: "the same Developer ID Application identity as the arm64 app",
          });
        }
        let armCommitted = false;
        let x64Committed = false;
        return yield* Effect.gen(function*() {
          const arm64 = yield* buildOne(input.arm64);
          armCommitted = true;
          const x64 = yield* buildOne(input.x64);
          x64Committed = true;
          return {
            arm64: Object.freeze({ ...arm64, architecture: "arm64" as const }),
            x64: Object.freeze({ ...x64, architecture: "x64" as const }),
          };
        }).pipe(
          Effect.onExit((exit) =>
            Exit.isSuccess(exit)
              ? Effect.void
              : Effect.gen(function*() {
                if (armCommitted) yield* fileSystem.remove(armDestination, { force: true }).pipe(Effect.ignore);
                if (x64Committed) yield* fileSystem.remove(x64Destination, { force: true }).pipe(Effect.ignore);
              })
          ),
        );
      },
    );

    return { buildInstallerPackages: (input) => buildInstallerPackages(input).pipe(Effect.provide(services)) };
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
