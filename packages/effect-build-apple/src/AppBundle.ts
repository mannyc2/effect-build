import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
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
  claimApplePairMember,
  ensureNewDestination,
  isSafeRelative,
  selectAppleTool,
  withApplePairRollback,
  xmlEscape,
} from "./internal.js";
import type { AppleToolOptions, ApplicationBundle } from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export interface AppResource {
  readonly artifact: Artifact.HashedFile;
  readonly destination: string;
}

export interface AppVariantInput {
  readonly executable: Artifact.HashedExecutable;
  readonly outdir: string;
  readonly minimumSystemVersion?: string;
}

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

export class ExecutableArchitectureMismatch extends Schema.TaggedError<ExecutableArchitectureMismatch>()(
  "ExecutableArchitectureMismatch",
  {
    path: Schema.String,
    expected: Schema.Literals(["arm64", "x64"] as const),
    observed: Schema.String,
  },
) {
  override get message(): string {
    return `${this.path} is ${this.observed}; expected one thin ${this.expected} Mach-O executable`;
  }
}

export type BuildAppBundlesError =
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | Tree.PublicationFailure
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
  ) return { observed: "a universal/fat Mach-O" };
  const littleEndian = bytesEqual(magic, [0xcf, 0xfa, 0xed, 0xfe]);
  const bigEndian = bytesEqual(magic, [0xfe, 0xed, 0xfa, 0xcf]);
  if (!littleEndian && !bigEndian) return { observed: "a non-Mach-O file" };
  if (header.byteLength < 32) return { observed: "a truncated 64-bit Mach-O header" };
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const cpu = view.getUint32(4, littleEndian);
  const fileType = view.getUint32(12, littleEndian);
  const loadCommandBytes = view.getUint32(20, littleEndian);
  if (fileType !== 2) return { observed: `a non-executable Mach-O with file type ${fileType}` };
  if (loadCommandBytes > header.byteLength - 32) return { observed: "a malformed Mach-O load-command table" };
  if (cpu === 0x0100000c) return { architecture: "arm64", observed: "a thin arm64 Mach-O" };
  if (cpu === 0x01000007) return { architecture: "x64", observed: "a thin x64 Mach-O" };
  return { observed: `a thin Mach-O with unsupported CPU type 0x${cpu.toString(16)}` };
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
    const plutil = yield* selectAppleTool("plutil", options.plutil, "plist-lint");

    const validateExecutable = (executable: Artifact.HashedExecutable, expected: "arm64" | "x64") => {
      const expectedTarget = expected === "arm64" ? "macos-aarch64" : "macos-x64";
      if (executable.target !== expectedTarget || executable.nativeFormat !== "mach-o") {
        return Effect.fail(
          new ExecutableArchitectureMismatch({
            path: executable.path,
            expected,
            observed: `a core ${executable.target}/${executable.nativeFormat} executable`,
          }),
        );
      }
      return File.withVerifiedBytes(executable, (contents) => {
        const observed = describeMachO(contents);
        return observed.architecture === expected
          ? Effect.succeed(contents)
          : Effect.fail(
            new ExecutableArchitectureMismatch({ path: executable.path, expected, observed: observed.observed }),
          );
      });
    };

    const buildOne = (
      input: BuildAppBundlesInput,
      variant: AppVariantInput,
      executableContents: Uint8Array,
      resourcesContents: readonly Uint8Array[],
    ) =>
      Tree.publish(
        { outdir: variant.outdir, observation: "hashed", provenance: plutil.observation },
        (staging) =>
          Effect.gen(function*() {
            const contents = path.join(staging, "Contents");
            const macos = path.join(contents, "MacOS");
            const resources = path.join(contents, "Resources");
            yield* fileSystem.makeDirectory(macos, { recursive: true }).pipe(
              Effect.mapError((error) => invalid("create app bundle", staging, String(error))),
            );
            yield* fileSystem.makeDirectory(resources, { recursive: true }).pipe(
              Effect.mapError((error) => invalid("create app bundle", staging, String(error))),
            );
            const executable = path.join(macos, input.executableName);
            yield* fileSystem.writeFile(executable, executableContents).pipe(
              Effect.mapError((error) => invalid("write app executable", executable, String(error))),
            );
            yield* fileSystem.chmod(executable, 0o755).pipe(
              Effect.mapError((error) => invalid("make app executable", executable, String(error))),
            );
            for (const [index, resource] of (input.resources ?? []).entries()) {
              const target = path.join(resources, resource.destination);
              yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
                Effect.mapError((error) => invalid("create resource directory", target, String(error))),
              );
              yield* fileSystem.writeFile(target, resourcesContents[index]!).pipe(
                Effect.mapError((error) => invalid("write app resource", target, String(error))),
              );
            }
            const infoPlist = path.join(contents, "Info.plist");
            yield* fileSystem.writeFileString(infoPlist, plist(input, variant)).pipe(
              Effect.mapError((error) => invalid("write Info.plist", infoPlist, String(error))),
            );
            yield* plutil.run(["-lint", "--", infoPlist]);
          }),
      );

    const buildAppBundles = Effect.fn("effect-build-apple.buildAppBundles")(function*(input: BuildAppBundlesInput) {
      const armDestination = path.resolve(input.arm64.outdir);
      const x64Destination = path.resolve(input.x64.outdir);
      if (armDestination === x64Destination) {
        return yield* invalid("build app bundles", armDestination, "arm64 and x64 outputs must differ");
      }
      yield* ensureNewDestination(armDestination);
      yield* ensureNewDestination(x64Destination);
      for (const destination of [armDestination, x64Destination]) {
        if (!path.basename(destination).endsWith(".app")) {
          return yield* invalid("build app bundle", destination, "output must end in .app");
        }
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/u.test(input.bundleIdentifier)) {
        return yield* invalid("build app bundle", armDestination, "invalid bundle identifier");
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(input.executableName)) {
        return yield* invalid("build app bundle", armDestination, "invalid executable name");
      }
      const destinations = (input.resources ?? []).map(({ destination }) => destination);
      const folded = destinations.map((destination) => destination.normalize("NFC").toLowerCase());
      for (const [index, destination] of destinations.entries()) {
        if (!isSafeRelative(destination)) {
          return yield* invalid("build app bundle", armDestination, `unsafe resource destination ${destination}`);
        }
        if (folded.indexOf(folded[index]!) !== index) {
          return yield* invalid("build app bundle", armDestination, `duplicate resource destination ${destination}`);
        }
        if (
          folded.some((candidate, other) =>
            other !== index
            && (candidate.startsWith(`${folded[index]!}/`) || folded[index]!.startsWith(`${candidate}/`))
          )
        ) {
          return yield* invalid("build app bundle", armDestination, `resource prefix collision ${destination}`);
        }
      }
      const armExecutable = yield* validateExecutable(input.arm64.executable, "arm64");
      const x64Executable = yield* validateExecutable(input.x64.executable, "x64");
      const resources = yield* Effect.forEach(
        input.resources ?? [],
        ({ artifact }) => File.withVerifiedBytes(artifact, (contents) => Effect.succeed(contents)),
        { concurrency: "unbounded" },
      );
      let armCommitted = false;
      let x64Committed = false;
      return yield* withApplePairRollback(
        Effect.gen(function*() {
          const arm64 = yield* claimApplePairMember(
            buildOne(input, input.arm64, armExecutable, resources),
            () => {
              armCommitted = true;
            },
          );
          const x64 = yield* claimApplePairMember(
            buildOne(input, input.x64, x64Executable, resources),
            () => {
              x64Committed = true;
            },
          );
          return {
            arm64: Object.freeze({ ...arm64, architecture: "arm64" as const }),
            x64: Object.freeze({ ...x64, architecture: "x64" as const }),
          };
        }),
        fileSystem,
        () => ({
          operation: "build app bundles rollback",
          arm64Path: armDestination,
          x64Path: x64Destination,
          arm64Committed: armCommitted,
          x64Committed,
          recursive: true,
          failure: (reason) => new Tree.TreeCommitFailed({ destination: armDestination, reason }),
        }),
      );
    });

    return { buildAppBundles: (input) => buildAppBundles(input).pipe(Effect.provide(services)) };
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
