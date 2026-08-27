import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { PublishFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  capturePlatformServices,
  ensureNewDestination,
  isSafeRelative,
  publishFailure,
  resolveAppleTool,
  xmlEscape,
} from "./internal.js";
import type { AppleToolOptions, ApplicationBundle } from "./Model.js";

/** One finalized regular file written below `Contents/Resources`. */
export interface AppResource {
  readonly artifact: Artifact.FileArtifact;
  readonly destination: string;
}

/** Architecture-specific executable and final `.app` directory. */
export interface AppVariantInput {
  readonly executable: Artifact.Executable;
  readonly outdir: string;
  readonly minimumSystemVersion?: string;
}

/** Exact two-architecture app bundle construction input. */
export interface BuildAppBundlesInput {
  readonly bundleIdentifier: string;
  readonly bundleName: string;
  readonly displayName: string;
  readonly executableName: string;
  readonly version: string;
  readonly shortVersion: string;
  readonly arm64: AppVariantInput;
  readonly x64: AppVariantInput;
  readonly resources?: readonly AppResource[];
}

export interface AppBundles {
  readonly arm64: ApplicationBundle;
  readonly x64: ApplicationBundle;
}

export interface LayerOptions {
  readonly plutil: AppleToolOptions;
}

/** An app executable was not one thin Mach-O of the architecture selected by its output slot. */
export class ExecutableArchitectureMismatch extends Schema.TaggedError<ExecutableArchitectureMismatch>()(
  "ExecutableArchitectureMismatch",
  {
    path: Schema.NonEmptyString,
    expected: Schema.Literals(["arm64", "x64"] as const),
    observed: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `${this.path} is ${this.observed}; expected one thin ${this.expected} Mach-O executable`;
  }
}

export type BuildAppBundlesError =
  | ToolFailed
  | PublishFailed
  | ArtifactVerificationFailed
  | ExecutableArchitectureMismatch;

interface Service {
  readonly buildAppBundles: (input: BuildAppBundlesInput) => Effect.Effect<AppBundles, BuildAppBundlesError>;
}

export class Builder extends Context.Service<Builder, Service>()(
  "effect-build-apple/AppBundle/Builder",
) {}

const plist = (input: BuildAppBundlesInput, variant: AppVariantInput): string => {
  const minimum = variant.minimumSystemVersion === undefined
    ? ""
    : `\n  <key>LSMinimumSystemVersion</key>\n  <string>${xmlEscape(variant.minimumSystemVersion)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${xmlEscape(input.displayName)}</string>
  <key>CFBundleExecutable</key>
  <string>${xmlEscape(input.executableName)}</string>
  <key>CFBundleIdentifier</key>
  <string>${xmlEscape(input.bundleIdentifier)}</string>
  <key>CFBundleName</key>
  <string>${xmlEscape(input.bundleName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${xmlEscape(input.shortVersion)}</string>
  <key>CFBundleVersion</key>
  <string>${xmlEscape(input.version)}</string>
  <key>NSHighResolutionCapable</key>
  <true/>${minimum}
</dict>
</plist>
`;
};

type LayerError = ToolNotFound | ToolFailed;

const bytesEqual = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((byte, index) => bytes[index] === byte);

const describeMachO = (header: Uint8Array): { readonly architecture?: "arm64" | "x64"; readonly observed: string } => {
  if (header.byteLength < 4) return { observed: "a truncated file" };
  const magic = header.subarray(0, 4);
  if (
    bytesEqual(magic, [0xca, 0xfe, 0xba, 0xbe])
    || bytesEqual(magic, [0xbe, 0xba, 0xfe, 0xca])
    || bytesEqual(magic, [0xca, 0xfe, 0xba, 0xbf])
    || bytesEqual(magic, [0xbf, 0xba, 0xfe, 0xca])
  ) {
    return { observed: "a universal/fat Mach-O, which exact-architecture bundles do not admit" };
  }
  const littleEndian = bytesEqual(magic, [0xcf, 0xfa, 0xed, 0xfe]);
  const bigEndian = bytesEqual(magic, [0xfe, 0xed, 0xfa, 0xcf]);
  if (!littleEndian && !bigEndian) return { observed: "a non-Mach-O file" };
  if (header.byteLength < 32) return { observed: "a truncated 64-bit Mach-O header" };
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const cpu = view.getUint32(4, littleEndian);
  const fileType = view.getUint32(12, littleEndian);
  const loadCommandBytes = view.getUint32(20, littleEndian);
  if (fileType !== 2) return { observed: `a non-executable Mach-O with file type ${fileType}` };
  if (loadCommandBytes > header.byteLength - 32) {
    return { observed: "a Mach-O whose load-command table exceeds the finalized bytes" };
  }
  if (cpu === 0x0100000c) return { architecture: "arm64", observed: "a thin arm64 Mach-O" };
  if (cpu === 0x01000007) return { architecture: "x64", observed: "a thin x64 Mach-O" };
  return { observed: `a thin Mach-O with unsupported CPU type 0x${cpu.toString(16)}` };
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
    const plutil = yield* resolveAppleTool("plutil", options.plutil, ["-help"]);

    const validateExecutable = Effect.fn("effect-build-apple.validateAppExecutable")(function*(
      executable: Artifact.Executable,
      expected: "arm64" | "x64",
    ) {
      const expectedTarget = expected === "arm64" ? "macos-aarch64" : "macos-x64";
      if (executable.target !== expectedTarget) {
        return yield* new ExecutableArchitectureMismatch({
          path: path.resolve(executable.path),
          expected,
          observed: `a core ${executable.target} executable`,
        });
      }
      const contents = yield* Toolchain.readVerifiedFile(executable);
      const observed = describeMachO(contents);
      if (observed.architecture !== expected) {
        return yield* new ExecutableArchitectureMismatch({
          path: path.resolve(executable.path),
          expected,
          observed: observed.observed,
        });
      }
      return contents;
    });

    const buildOne = Effect.fn("effect-build-apple.buildAppBundle")(function*(
      input: BuildAppBundlesInput,
      variant: AppVariantInput,
      executableContents: Uint8Array,
      resourcesContents: readonly Uint8Array[],
    ) {
      const destination = path.resolve(variant.outdir);
      for (const resource of input.resources ?? []) {
        if (!isSafeRelative(resource.destination)) {
          return yield* new PublishFailed({
            destination,
            reason: `resource destination is not a safe relative path: ${resource.destination}`,
          });
        }
      }
      return yield* Toolchain.publishBundle({
        tool: plutil.tool,
        outdir: variant.outdir,
        produce: (staging) =>
          Effect.gen(function*() {
            const contents = path.join(staging, "Contents");
            const macos = path.join(contents, "MacOS");
            const resources = path.join(contents, "Resources");
            yield* fileSystem.makeDirectory(macos, { recursive: true }).pipe(
              Effect.mapError(publishFailure(destination, "create Contents/MacOS")),
            );
            yield* fileSystem.makeDirectory(resources, { recursive: true }).pipe(
              Effect.mapError(publishFailure(destination, "create Contents/Resources")),
            );
            const executable = path.join(macos, input.executableName);
            yield* fileSystem.writeFile(executable, executableContents).pipe(
              Effect.mapError(publishFailure(destination, "write verified executable")),
            );
            yield* fileSystem.chmod(executable, 0o755).pipe(
              Effect.mapError(publishFailure(destination, "make executable")),
            );
            for (const [index, resource] of (input.resources ?? []).entries()) {
              const target = path.join(resources, resource.destination);
              yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
                Effect.mapError(publishFailure(destination, "create resource directory")),
              );
              yield* fileSystem.writeFile(target, resourcesContents[index]!).pipe(
                Effect.mapError(publishFailure(destination, `write verified resource ${resource.destination}`)),
              );
            }
            const infoPlist = path.join(contents, "Info.plist");
            yield* fileSystem.writeFileString(infoPlist, plist(input, variant)).pipe(
              Effect.mapError(publishFailure(destination, "write Info.plist")),
            );
            yield* Toolchain.runOrFail({
              tool: "plutil",
              executable: plutil.executable,
              args: ["-lint", "--", infoPlist],
            });
          }),
      });
    });

    const buildAppBundles = Effect.fn("effect-build-apple.buildAppBundles")(function*(input: BuildAppBundlesInput) {
      if (path.resolve(input.arm64.outdir) === path.resolve(input.x64.outdir)) {
        return yield* new PublishFailed({
          destination: path.resolve(input.arm64.outdir),
          reason: "arm64 and x64 app bundles require distinct output directories",
        });
      }
      yield* ensureNewDestination(input.arm64.outdir);
      yield* ensureNewDestination(input.x64.outdir);
      for (const variant of [input.arm64, input.x64]) {
        if (!path.basename(path.resolve(variant.outdir)).endsWith(".app")) {
          return yield* new PublishFailed({
            destination: path.resolve(variant.outdir),
            reason: "Apple application bundle outputs must end in .app",
          });
        }
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/.test(input.bundleIdentifier)) {
        return yield* new PublishFailed({
          destination: path.resolve(input.arm64.outdir),
          reason: `invalid bundle identifier: ${input.bundleIdentifier}`,
        });
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.executableName)) {
        return yield* new PublishFailed({
          destination: path.resolve(input.arm64.outdir),
          reason: `invalid executable name: ${input.executableName}`,
        });
      }
      const destinations = (input.resources ?? []).map((resource) => resource.destination);
      const folded = destinations.map((destination) => destination.normalize("NFC").toLowerCase());
      for (const [index, destination] of destinations.entries()) {
        if (!isSafeRelative(destination)) {
          return yield* new PublishFailed({
            destination: path.resolve(input.arm64.outdir),
            reason: `resource destination is not a safe relative path: ${destination}`,
          });
        }
        if (folded.indexOf(folded[index]!) !== index) {
          return yield* new PublishFailed({
            destination: path.resolve(input.arm64.outdir),
            reason: `duplicate or case-colliding resource destination: ${destination}`,
          });
        }
        if (
          folded.some((candidate, candidateIndex) =>
            candidateIndex !== index
            && (candidate.startsWith(`${folded[index]!}/`) || folded[index]!.startsWith(`${candidate}/`))
          )
        ) {
          return yield* new PublishFailed({
            destination: path.resolve(input.arm64.outdir),
            reason: `resource file/directory prefix collision: ${destination}`,
          });
        }
      }
      const armExecutable = yield* validateExecutable(input.arm64.executable, "arm64");
      const x64Executable = yield* validateExecutable(input.x64.executable, "x64");
      const resources = yield* Effect.forEach(input.resources ?? [], (resource) =>
        Toolchain.readVerifiedFile(resource.artifact), { concurrency: "unbounded" });
      let attemptedArm64 = false;
      let attemptedX64 = false;
      const pair = Effect.gen(function*() {
        attemptedArm64 = true;
        const arm64 = yield* buildOne(input, input.arm64, armExecutable, resources);
        attemptedX64 = true;
        const x64 = yield* buildOne(input, input.x64, x64Executable, resources);
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
                yield* fileSystem.remove(path.resolve(input.arm64.outdir), { recursive: true, force: true }).pipe(
                  Effect.ignore,
                );
              }
              if (attemptedX64) {
                yield* fileSystem.remove(path.resolve(input.x64.outdir), { recursive: true, force: true }).pipe(
                  Effect.ignore,
                );
              }
            })
        ),
      );
    });

    return {
      buildAppBundles: (input) =>
        buildAppBundles(input).pipe(Effect.provide(services)),
    };
  });

export const buildAppBundles = (
  input: BuildAppBundlesInput,
): Effect.Effect<AppBundles, BuildAppBundlesError, Builder> => Builder.use((service) => service.buildAppBundles(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Builder,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Builder, makeService(options));
