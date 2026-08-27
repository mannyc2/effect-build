import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { PublishFailed, ToolFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  capturePlatformServices,
  ensureNewDestination,
  isSafeRelative,
  publishFailure,
  resolveAppleTool,
} from "./internal.js";
import {
  captureBundle,
  captureBundlePath,
  identityEquals,
  makeBundleRemovable,
  materializeBundle,
} from "./internal/BundleIdentity.js";
import type { BundleSnapshot } from "./internal/BundleIdentity.js";
import { BundleInspectionFailed, hasDeveloperIdApplicationSignature, ProductStateInvalid } from "./Model.js";
import type { AppleToolOptions, Architecture, DeveloperIdApplicationBundle, UdzoDiskImage } from "./Model.js";

/** One finalized additional file in the root of a disk image. */
export interface LayoutItem {
  readonly artifact: Artifact.FileArtifact;
  readonly destination: string;
}

/** One architecture-specific UDZO disk image. */
export interface DiskImageVariantInput<A extends Architecture = Architecture> {
  readonly sourceApp: DeveloperIdApplicationBundle & { readonly architecture: A };
  readonly outfile: string;
  readonly volumeName: string;
  readonly layout?: readonly LayoutItem[];
  readonly applicationsLink?: boolean;
}

/** Exact two-architecture UDZO output request. */
export interface CreateDiskImagesInput {
  readonly arm64: DiskImageVariantInput<"arm64">;
  readonly x64: DiskImageVariantInput<"x64">;
}

export interface DiskImages {
  readonly arm64: UdzoDiskImage & { readonly architecture: "arm64" };
  readonly x64: UdzoDiskImage & { readonly architecture: "x64" };
}

export interface LayerOptions {
  readonly hdiutil: AppleToolOptions;
  readonly codesign: AppleToolOptions;
}

export type CreateDiskImagesError =
  | ToolFailed
  | PublishFailed
  | ArtifactVerificationFailed
  | BundleInspectionFailed
  | ProductStateInvalid;

interface Service {
  readonly createDiskImages: (input: CreateDiskImagesInput) => Effect.Effect<DiskImages, CreateDiskImagesError>;
}

export class Creator extends Context.Service<Creator, Service>()(
  "effect-build-apple/DiskImage/Creator",
) {}

type LayerError = ToolNotFound | ToolFailed;

interface PreparedDiskImage {
  readonly input: DiskImageVariantInput;
  readonly destination: string;
  readonly appFileName: string;
  readonly layoutContents: readonly Uint8Array[];
  readonly capturedApp: BundleSnapshot;
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
    const hdiutil = yield* resolveAppleTool("hdiutil", options.hdiutil, ["help"]);
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);

    const prepareOne = Effect.fn("effect-build-apple.prepareDiskImage")(function*(
      input: DiskImageVariantInput,
      expectedArchitecture: Architecture,
    ) {
      const destination = path.resolve(input.outfile);
      const sourceAppPath = path.resolve(input.sourceApp.outdir);
      if (!path.basename(destination).endsWith(".dmg")) {
        return yield* new PublishFailed({ destination, reason: "UDZO disk image outputs must end in .dmg" });
      }
      if (!hasDeveloperIdApplicationSignature(input.sourceApp)) {
        return yield* new ProductStateInvalid({
          operation: "create disk image",
          path: sourceAppPath,
          expected: "a strictly verified Developer ID Application bundle",
        });
      }
      if (input.sourceApp.architecture !== expectedArchitecture) {
        return yield* new ProductStateInvalid({
          operation: "create disk image",
          path: sourceAppPath,
          expected: `a ${expectedArchitecture} Developer ID Application bundle`,
        });
      }
      for (const item of input.layout ?? []) {
        if (!isSafeRelative(item.destination)) {
          return yield* new PublishFailed({
            destination,
            reason: `layout destination is not a safe relative path: ${item.destination}`,
          });
        }
      }
      const appFileName = path.basename(input.sourceApp.outdir);
      if (
        !isSafeRelative(appFileName)
        || appFileName.includes("/")
        || appFileName.includes("\\")
        || !appFileName.endsWith(".app")
      ) {
        return yield* new PublishFailed({ destination, reason: `invalid app file name: ${appFileName}` });
      }
      const reserved = [appFileName, ...((input.applicationsLink ?? true) ? ["Applications"] : [])]
        .map((entry) => entry.normalize("NFC").toLowerCase());
      const layoutDestinations = (input.layout ?? [])
        .map((item) => item.destination.normalize("NFC").toLowerCase());
      for (const [index, foldedDestination] of layoutDestinations.entries()) {
        if (
          reserved.some((entry) =>
            foldedDestination === entry
            || foldedDestination.startsWith(`${entry}/`)
            || entry.startsWith(`${foldedDestination}/`)
          )
          || layoutDestinations.some((entry, candidate) =>
            candidate !== index
            && (
              foldedDestination === entry
              || foldedDestination.startsWith(`${entry}/`)
              || entry.startsWith(`${foldedDestination}/`)
            )
          )
        ) {
          return yield* new PublishFailed({
            destination,
            reason: `disk image layout destination collides with another entry: ${input.layout?.[index]?.destination}`,
          });
        }
      }
      const layoutContents = yield* Effect.forEach(input.layout ?? [], (item) =>
        Toolchain.readVerifiedFile(item.artifact), { concurrency: "unbounded" });
      const capturedApp = yield* captureBundle(input.sourceApp);
      return { input, destination, appFileName, layoutContents, capturedApp } satisfies PreparedDiskImage;
    });

    const createOne = Effect.fn("effect-build-apple.createDiskImage")(function*(prepared: PreparedDiskImage) {
      const { appFileName, capturedApp, destination, input, layoutContents } = prepared;
      return yield* Toolchain.publishFile({
        tool: hdiutil.tool,
        outfile: input.outfile,
        produce: (stagedPath) =>
          Effect.scoped(Effect.gen(function*() {
            const layout = yield* fileSystem.makeTempDirectoryScoped({
              directory: path.dirname(stagedPath),
              prefix: ".effect-build-dmg-layout-",
            }).pipe(Effect.mapError(publishFailure(destination, "create disk image layout")));
            const stagedApp = path.join(layout, appFileName);
            yield* Effect.addFinalizer(() =>
              makeBundleRemovable(capturedApp, stagedApp)
            );
            yield* materializeBundle(capturedApp, stagedApp);
            yield* Toolchain.runOrFail({
              tool: "codesign",
              executable: codesign.executable,
              args: ["--verify", "--deep", "--strict", "--verbose=2", stagedApp],
            });
            for (const [index, item] of (input.layout ?? []).entries()) {
              const target = path.join(layout, item.destination);
              yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
                Effect.mapError(publishFailure(destination, "create disk image layout directory")),
              );
              yield* fileSystem.writeFile(target, layoutContents[index]!).pipe(
                Effect.mapError(publishFailure(destination, `write verified disk image item ${item.destination}`)),
              );
            }
            if (input.applicationsLink ?? true) {
              yield* fileSystem.symlink("/Applications", path.join(layout, "Applications")).pipe(
                Effect.mapError(publishFailure(destination, "create Applications link")),
              );
            }
            yield* Toolchain.runOrFail({
              tool: "hdiutil",
              executable: hdiutil.executable,
              args: [
                "create",
                "-fs",
                "HFS+",
                "-format",
                "UDZO",
                "-volname",
                input.volumeName,
                "-srcfolder",
                layout,
                stagedPath,
              ],
            });
            yield* Toolchain.runOrFail({
              tool: "hdiutil",
              executable: hdiutil.executable,
              args: ["verify", stagedPath],
            });
            yield* Effect.scoped(
              Effect.gen(function*() {
                const mounted = yield* Effect.acquireRelease(
                  Toolchain.runOrFail({
                    tool: "hdiutil",
                    executable: hdiutil.executable,
                    args: ["attach", "-readonly", "-nobrowse", "-noautoopen", stagedPath],
                  }).pipe(
                    Effect.flatMap((completion) => {
                      const line = completion.stdout.text
                        .split(/\r?\n/)
                        .find((candidate) => /(?:^|\s)\/dev\/disk\S*/.test(candidate));
                      const device = line === undefined ? undefined : /(?:^|\s)(\/dev\/disk\S*)/.exec(line)?.[1];
                      const mountPoint = line?.trim().split(/\t+/).at(-1);
                      return device === undefined
                          || mountPoint === undefined
                          || !path.isAbsolute(mountPoint)
                          || mountPoint === device
                        ? Effect.fail(
                          new ToolFailed({
                            tool: "hdiutil",
                            exitCode: completion.exitCode,
                            stdout: completion.stdout.text,
                            stderr: "attach output did not identify one mounted device and mount point",
                          }),
                        )
                        : Effect.succeed({ device, mountPoint } as const);
                    }),
                  ),
                  ({ device }) =>
                    Toolchain.runOrFail({
                      tool: "hdiutil",
                      executable: hdiutil.executable,
                      args: ["detach", device],
                    }).pipe(Effect.orDie),
                );
                const information = yield* Toolchain.runOrFail({
                  tool: "hdiutil",
                  executable: hdiutil.executable,
                  args: ["info"],
                });
                if (!information.stdout.text.includes(mounted.device)) {
                  return yield* new ToolFailed({
                    tool: "hdiutil",
                    exitCode: information.exitCode,
                    stdout: information.stdout.text,
                    stderr: `mounted device ${mounted.device} was absent from hdiutil info`,
                  });
                }
                const mountedApp = path.join(mounted.mountPoint, appFileName);
                const observedApp = yield* captureBundlePath(mountedApp);
                if (!identityEquals(capturedApp.identity, observedApp.identity)) {
                  return yield* new BundleInspectionFailed({
                    path: mountedApp,
                    reason:
                      `mounted app differs from ${capturedApp.identity.artifactSha256}: ${observedApp.identity.artifactSha256}`,
                  });
                }
                yield* Toolchain.runOrFail({
                  tool: "codesign",
                  executable: codesign.executable,
                  args: ["--verify", "--deep", "--strict", "--verbose=2", mountedApp],
                });
                for (const item of input.layout ?? []) {
                  yield* Toolchain.readVerifiedFile({
                    ...item.artifact,
                    path: path.join(mounted.mountPoint, item.destination),
                  });
                }
                if (input.applicationsLink ?? true) {
                  const applications = path.join(mounted.mountPoint, "Applications");
                  const target = yield* fileSystem.readLink(applications).pipe(
                    Effect.mapError((error) =>
                      new BundleInspectionFailed({
                        path: applications,
                        reason: `mounted Applications link could not be read: ${String(error)}`,
                      })
                    ),
                  );
                  if (target !== "/Applications") {
                    return yield* new BundleInspectionFailed({
                      path: applications,
                      reason: `mounted Applications link targeted ${target}`,
                    });
                  }
                }
              }),
            );
          })),
      });
    });

    const createDiskImages = Effect.fn("effect-build-apple.createDiskImages")(function*(input: CreateDiskImagesInput) {
      if (path.resolve(input.arm64.outfile) === path.resolve(input.x64.outfile)) {
        return yield* new PublishFailed({
          destination: path.resolve(input.arm64.outfile),
          reason: "arm64 and x64 disk images require distinct output files",
        });
      }
      yield* ensureNewDestination(input.arm64.outfile);
      yield* ensureNewDestination(input.x64.outfile);
      const preparedArm64 = yield* prepareOne(input.arm64, "arm64");
      const preparedX64 = yield* prepareOne(input.x64, "x64");
      if (
        input.arm64.sourceApp.signature.certificateSha1
          !== input.x64.sourceApp.signature.certificateSha1
      ) {
        return yield* new ProductStateInvalid({
          operation: "create disk images",
          path: path.resolve(input.x64.sourceApp.outdir),
          expected: "the same Developer ID Application identity as the arm64 app",
        });
      }
      let attemptedArm64 = false;
      let attemptedX64 = false;
      const pair = Effect.gen(function*() {
        attemptedArm64 = true;
        const arm64 = yield* createOne(preparedArm64);
        attemptedX64 = true;
        const x64 = yield* createOne(preparedX64);
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
    });

    return { createDiskImages: (input) => createDiskImages(input).pipe(Effect.provide(services)) };
  });

export const createDiskImages = (
  input: CreateDiskImagesInput,
): Effect.Effect<DiskImages, CreateDiskImagesError, Creator> =>
  Creator.use((service) => service.createDiskImages(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Creator,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Creator, makeService(options));
