import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, Layout, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { outputPath, runNative } from "./internal.js";
import type { App } from "./Model.js";
import { plist } from "./plist.js";

export interface Resource {
  readonly artifact: Artifact.Regular;
  /** Relative to Contents/Resources for apps, or the volume root for disk images. */
  readonly path: string;
  readonly executable?: boolean | undefined;
}
export interface AppBundleInput extends Commit.ProducerOptions {
  readonly executable: Artifact.Executable;
  readonly outdir: string;
  readonly bundleIdentifier: string;
  readonly bundleName: string;
  readonly version: string;
  readonly shortVersion?: string | undefined;
  readonly displayName?: string | undefined;
  readonly executableName?: string | undefined;
  readonly minimumSystemVersion?: string | undefined;
  readonly resources?: readonly Resource[] | undefined;
  readonly cwd?: string | undefined;
}
export type AppBundleError = Tool.InputInvalid | Artifact.ArtifactError | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;
export const validateResources = (operation: string, resources: readonly Resource[], reserved: readonly string[] = []) => Effect.gen(function*() {
  // Reserved product roots are opaque: resource entries cannot add descendants inside them.
  const issue = Layout.validate([...reserved, ...resources.map((resource) => resource.path)].map((path) => ({ path, kind: "file" })));
  if (issue !== undefined) return yield* new Tool.InputInvalid({ operation, ...issue });
});
const invalid = (reason: string) => new Tool.InputInvalid({ operation: "Apple.appBundle", reason });
export const appBundle = (input: AppBundleInput): Effect.Effect<App, AppBundleError, Apple | Env> => Effect.gen(function*() {
  const outdir = yield* outputPath("Apple.appBundle", input.outdir, ".app", input.cwd);
  const p = yield* Path.Path;
  const executableName = input.executableName ?? p.basename(input.executable.path);
  const strings = [input.bundleName, input.version, input.shortVersion ?? input.version, input.displayName ?? input.bundleName, executableName, ...(input.minimumSystemVersion === undefined ? [] : [input.minimumSystemVersion])];
  if (!strings.every((value) => Tool.argumentIssue(value) === undefined && Array.from(value).every((character) => character.charCodeAt(0) >= 32 || "\t\n\r".includes(character))) || Layout.pathIssue(executableName) !== undefined || executableName.includes("/")) {
    return yield* invalid("bundle strings must be non-empty XML text; executableName must be one filename");
  }
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(input.bundleIdentifier)) {
    return yield* invalid("bundleIdentifier must be a reverse-DNS identifier");
  }
  if (input.executable.format !== "mach-o" || !input.executable.target.startsWith("darwin-")) {
    return yield* invalid("app executables must target Darwin and use Mach-O");
  }
  yield* validateResources("Apple.appBundle", input.resources ?? []);
  const resources = input.resources ?? [];
  const fs = yield* FileSystem.FileSystem;
  const { tool } = yield* Apple;
  const fields: Record<string, string | true> = {
    CFBundleDisplayName: input.displayName ?? input.bundleName,
    CFBundleExecutable: executableName,
    CFBundleIdentifier: input.bundleIdentifier,
    CFBundleName: input.bundleName,
    CFBundlePackageType: "APPL",
    CFBundleShortVersionString: input.shortVersion ?? input.version,
    CFBundleVersion: input.version,
    NSHighResolutionCapable: true,
    ...(input.minimumSystemVersion === undefined ? {} : { LSMinimumSystemVersion: input.minimumSystemVersion }),
  };
  const produce = (out: string) => Effect.gen(function*() {
    // Direct output removes the previous bundle before copying, so inputs cannot come from inside it.
    if ([input.executable, ...resources.map((resource) => resource.artifact)].some((artifact) => p.resolve(artifact.path).startsWith(`${out}${p.sep}`))) {
      return yield* invalid("inputs inside the bundle being replaced require atomic output");
    }
    yield* fs.remove(out, { recursive: true, force: true }).pipe(Effect.mapError(Artifact.ioError(out, "write")));
    const binary = p.join(out, "Contents", "MacOS", executableName);
    const resourceRoot = p.join(out, "Contents", "Resources");
    yield* fs.makeDirectory(resourceRoot, { recursive: true }).pipe(Effect.mapError(Artifact.ioError(out, "write")));
    yield* Artifact.copyVerified(input.executable, binary);
    yield* fs.chmod(binary, 0o755).pipe(Effect.mapError(Artifact.ioError(binary, "write")));
    for (const resource of resources) {
      const path = p.join(resourceRoot, resource.path);
      yield* Artifact.copyVerified(resource.artifact, path);
      yield* fs.chmod(path, (resource.executable ?? resource.artifact.kind === "executable") ? 0o755 : 0o644).pipe(Effect.mapError(Artifact.ioError(path, "write")));
    }
    const info = p.join(out, "Contents", "Info.plist");
    yield* fs.writeFileString(info, plist(fields)).pipe(Effect.mapError(Artifact.ioError(info, "write")));
    yield* runNative("plutil", ["-lint", info]);
    return { ...yield* Artifact.directory(out, Tool.producer(tool)), product: "app" as const };
  });
  return yield* Commit.output(outdir, produce, input);
});
