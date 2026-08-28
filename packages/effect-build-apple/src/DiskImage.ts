import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path } from "effect";
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
  copyTreeSnapshot,
  ensureNewDestination,
  isSafeRelative,
  selectAppleTool,
} from "./internal.js";
import { hasDeveloperIdApplicationSignature, ProductStateInvalid } from "./Model.js";
import type { AppleToolOptions, Architecture, DeveloperIdApplicationBundle, UdzoDiskImage } from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export interface LayoutItem {
  readonly artifact: Artifact.HashedFile;
  readonly destination: string;
}

export interface DiskImageVariantInput<A extends Architecture = Architecture> {
  readonly sourceApp: DeveloperIdApplicationBundle & { readonly architecture: A };
  readonly outfile: string;
  readonly volumeName: string;
  readonly layout?: readonly LayoutItem[];
  readonly applicationsLink?: boolean;
}

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
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | File.PublicationFailure
  | Tree.TreeVerificationFailed
  | ProductStateInvalid;

interface Service {
  readonly createDiskImages: (input: CreateDiskImagesInput) => Effect.Effect<DiskImages, CreateDiskImagesError>;
}

export class Creator extends Context.Service<Creator, Service>()("effect-build-apple/DiskImage/Creator") {}

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
    const hdiutil = yield* selectAppleTool("hdiutil", options.hdiutil, ["help"], "udzo-image");
    const codesign = yield* selectAppleTool("codesign", options.codesign, ["--version"], "app-signature-verification");

    const validate = (input: DiskImageVariantInput, architecture: Architecture) => {
      const destination = path.resolve(input.outfile);
      const sourceRoot = input.sourceApp.root;
      if (!path.basename(destination).endsWith(".dmg")) {
        return Effect.fail(invalid("create disk image", destination, "output must end in .dmg"));
      }
      if (!hasDeveloperIdApplicationSignature(input.sourceApp)) {
        return Effect.fail(
          new ProductStateInvalid({
            operation: "create disk image",
            path: sourceRoot,
            expected: "a verified Developer ID Application bundle",
          }),
        );
      }
      if (input.sourceApp.architecture !== architecture) {
        return Effect.fail(
          new ProductStateInvalid({
            operation: "create disk image",
            path: input.sourceApp.root,
            expected: `a ${architecture} Developer ID Application bundle`,
          }),
        );
      }
      const appName = path.basename(input.sourceApp.root);
      if (!isSafeRelative(appName) || !appName.endsWith(".app")) {
        return Effect.fail(invalid("create disk image", input.sourceApp.root, "source must be a single .app name"));
      }
      const reserved = [appName, ...((input.applicationsLink ?? true) ? ["Applications"] : [])]
        .map((entry) => entry.normalize("NFC").toLowerCase());
      const destinations = (input.layout ?? []).map(({ destination }) => destination.normalize("NFC").toLowerCase());
      for (const [index, item] of (input.layout ?? []).entries()) {
        const folded = destinations[index]!;
        if (!isSafeRelative(item.destination)) {
          return Effect.fail(
            invalid("create disk image", destination, `unsafe layout destination ${item.destination}`),
          );
        }
        if (
          reserved.some((entry) => folded === entry || folded.startsWith(`${entry}/`) || entry.startsWith(`${folded}/`))
          || destinations.some((entry, other) =>
            other !== index
            && (folded === entry || folded.startsWith(`${entry}/`) || entry.startsWith(`${folded}/`))
          )
        ) {
          return Effect.fail(
            invalid("create disk image", destination, `colliding layout destination ${item.destination}`),
          );
        }
      }
      return Effect.void;
    };

    const createOne = (input: DiskImageVariantInput) =>
      Tree.withVerifiedSnapshot(input.sourceApp, (snapshot) =>
        File.publish(
          { destination: input.outfile, observation: "hashed", provenance: hdiutil.observation },
          (stagedPath) =>
            Effect.scoped(
              Effect.gen(function*() {
                const layout = yield* fileSystem.makeTempDirectoryScoped({
                  directory: path.dirname(stagedPath),
                  prefix: ".effect-build-dmg-layout-",
                }).pipe(Effect.mapError((error) => invalid("create disk-image layout", stagedPath, String(error))));
                const appName = path.basename(input.sourceApp.root);
                const stagedApp = path.join(layout, appName);
                yield* copyTreeSnapshot(snapshot, stagedApp);
                yield* codesign.run(["--verify", "--deep", "--strict", "--verbose=2", stagedApp]);
                for (const item of input.layout ?? []) {
                  const target = path.join(layout, item.destination);
                  yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
                    Effect.mapError((error) => invalid("create disk-image layout", target, String(error))),
                  );
                  yield* File.withVerifiedBytes(
                    item.artifact,
                    (contents) =>
                      fileSystem.writeFile(target, contents).pipe(
                        Effect.mapError((error) => invalid("write disk-image layout item", target, String(error))),
                      ),
                  );
                }
                if (input.applicationsLink ?? true) {
                  yield* fileSystem.symlink("/Applications", path.join(layout, "Applications")).pipe(
                    Effect.mapError((error) => invalid("create Applications link", layout, String(error))),
                  );
                }
                yield* hdiutil.run([
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
                ]);
                yield* hdiutil.run(["verify", stagedPath]);
                yield* Effect.acquireUseRelease(
                  hdiutil.run(["attach", "-readonly", "-nobrowse", "-noautoopen", stagedPath]).pipe(
                    Effect.flatMap((completion) => {
                      const line = completion.stdoutText.split(/\r?\n/u)
                        .find((candidate) => /(?:^|\s)\/dev\/disk\S*/u.test(candidate));
                      const device = line === undefined ? undefined : /(?:^|\s)(\/dev\/disk\S*)/u.exec(line)?.[1];
                      const mountPoint = line?.trim().split(/\t+/u).at(-1);
                      return device !== undefined && mountPoint !== undefined && path.isAbsolute(mountPoint)
                          && mountPoint !== device
                        ? Effect.succeed({ device, mountPoint } as const)
                        : Effect.fail(
                          new AppleToolFailed({
                            tool: "hdiutil",
                            exitCode: completion.exitCode,
                            stdout: completion.stdoutText,
                            stderr: "attach output did not identify one mounted device and mount point",
                          }),
                        );
                    }),
                  ),
                  (mounted) =>
                    Effect.gen(function*() {
                      const information = yield* hdiutil.run(["info"]);
                      if (!information.stdoutText.includes(mounted.device)) {
                        return yield* new AppleToolFailed({
                          tool: "hdiutil",
                          exitCode: information.exitCode,
                          stdout: information.stdoutText,
                          stderr: `mounted device ${mounted.device} was absent from hdiutil info`,
                        });
                      }
                      const mountedApp = path.join(mounted.mountPoint, appName);
                      const canonicalMountedApp = yield* fileSystem.realPath(mountedApp).pipe(
                        Effect.mapError((error) => invalid("verify mounted app", mountedApp, String(error))),
                      );
                      yield* Tree.withVerifiedSnapshot(
                        { ...input.sourceApp, root: path.normalize(canonicalMountedApp) as Artifact.AbsolutePath },
                        () => Effect.void,
                      );
                      yield* codesign.run(["--verify", "--deep", "--strict", "--verbose=2", mountedApp]);
                      for (const item of input.layout ?? []) {
                        const mountedItem = path.join(mounted.mountPoint, item.destination);
                        const canonicalMountedItem = yield* fileSystem.realPath(mountedItem).pipe(
                          Effect.mapError((error) => invalid("verify mounted layout item", mountedItem, String(error))),
                        );
                        yield* File.withVerifiedBytes(
                          { ...item.artifact, path: path.normalize(canonicalMountedItem) as Artifact.AbsolutePath },
                          () => Effect.void,
                        );
                      }
                      if (input.applicationsLink ?? true) {
                        const applications = path.join(mounted.mountPoint, "Applications");
                        const target = yield* fileSystem.readLink(applications).pipe(
                          Effect.mapError((error) =>
                            invalid("verify mounted Applications link", applications, String(error))
                          ),
                        );
                        if (path.normalize(target) !== path.normalize(path.resolve("/Applications"))) {
                          return yield* invalid(
                            "verify mounted Applications link",
                            applications,
                            `unexpected target ${target}`,
                          );
                        }
                      }
                    }),
                  ({ device }) => hdiutil.run(["detach", device]).pipe(Effect.asVoid),
                );
              }),
            ),
        ));

    const createDiskImages = Effect.fn("effect-build-apple.createDiskImages")(function*(input: CreateDiskImagesInput) {
      const armDestination = path.resolve(input.arm64.outfile);
      const x64Destination = path.resolve(input.x64.outfile);
      if (armDestination === x64Destination) {
        return yield* invalid("create disk images", armDestination, "arm64 and x64 outputs must differ");
      }
      yield* ensureNewDestination(armDestination);
      yield* ensureNewDestination(x64Destination);
      yield* validate(input.arm64, "arm64");
      yield* validate(input.x64, "x64");
      if (input.arm64.sourceApp.signature.certificateSha1 !== input.x64.sourceApp.signature.certificateSha1) {
        return yield* new ProductStateInvalid({
          operation: "create disk images",
          path: input.x64.sourceApp.root,
          expected: "the same Developer ID Application identity as the arm64 app",
        });
      }
      let armCommitted = false;
      let x64Committed = false;
      return yield* Effect.gen(function*() {
        const arm64 = yield* createOne(input.arm64);
        armCommitted = true;
        const x64 = yield* createOne(input.x64);
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
