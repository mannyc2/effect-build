import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { fileError, outputPath, relativeValid, runNative, textValid } from "./internal.js";
import type { App } from "./Model.js";

export interface Resource {
  readonly artifact: Artifact.Regular;
  /** Relative to Contents/Resources for apps, or the volume root for disk images. */
  readonly path: string;
  readonly executable?: boolean | undefined;
}
export interface AppBundleInput {
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
  readonly atomic?: boolean | undefined;
}
export type AppBundleError = InputInvalid | Artifact.ArtifactError | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;
const escapeXml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
export const validateResources = (resources: readonly Resource[], reserved: readonly string[] = []) => Effect.gen(function*() {
  // HFS+ disk images and common macOS volumes fold case and Unicode normalization.
  const paths = reserved.map((path) => path.normalize("NFC").toLowerCase());
  for (const resource of resources) {
    const folded = resource.path.normalize("NFC").toLowerCase();
    if (!relativeValid(resource.path) || paths.some((path) => path === folded || path.startsWith(`${folded}/`) || folded.startsWith(`${path}/`))) {
      return yield* new InputInvalid({ reason: "resource paths must be distinct relative paths without traversal or file/directory collisions" });
    }
    paths.push(folded);
  }
});
export const appBundle = (input: AppBundleInput): Effect.Effect<App, AppBundleError, Apple | Env> => Effect.gen(function*() {
  const outdir = yield* outputPath(input.outdir, ".app", input.cwd);
  const p = yield* Path.Path;
  const executableName = input.executableName ?? p.basename(input.executable.path);
  const strings = [input.bundleName, input.version, input.shortVersion ?? input.version, input.displayName ?? input.bundleName, executableName, ...(input.minimumSystemVersion === undefined ? [] : [input.minimumSystemVersion])];
  if (!strings.every((value) => textValid(value) && Array.from(value).every((character) => character.charCodeAt(0) >= 32 || "\t\n\r".includes(character))) || !relativeValid(executableName) || executableName.includes("/")) {
    return yield* new InputInvalid({ reason: "bundle strings must be non-empty XML text; executableName must be one filename" });
  }
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(input.bundleIdentifier)) {
    return yield* new InputInvalid({ reason: "bundleIdentifier must be a reverse-DNS identifier" });
  }
  if (input.executable.format !== "mach-o" || !input.executable.target.startsWith("darwin-")) {
    return yield* new InputInvalid({ reason: "app executables must target Darwin and use Mach-O" });
  }
  yield* validateResources(input.resources ?? []);
  const resources = input.resources ?? [];
  const fs = yield* FileSystem.FileSystem;
  const { tool } = yield* Apple;
  const fields: Record<string, string> = {
    CFBundleDisplayName: input.displayName ?? input.bundleName,
    CFBundleExecutable: executableName,
    CFBundleIdentifier: input.bundleIdentifier,
    CFBundleName: input.bundleName,
    CFBundlePackageType: "APPL",
    CFBundleShortVersionString: input.shortVersion ?? input.version,
    CFBundleVersion: input.version,
    ...(input.minimumSystemVersion === undefined ? {} : { LSMinimumSystemVersion: input.minimumSystemVersion }),
  };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n${Object.entries(fields).map(([key, value]) => `<key>${key}</key><string>${escapeXml(value)}</string>`).join("\n")}\n<key>NSHighResolutionCapable</key><true/>\n</dict></plist>\n`;
  const produce = (out: string) => Effect.gen(function*() {
    // Direct output removes the previous bundle before copying, so inputs cannot come from inside it.
    if ([input.executable, ...resources.map((resource) => resource.artifact)].some((artifact) => p.resolve(artifact.path).startsWith(`${out}${p.sep}`))) {
      return yield* new InputInvalid({ reason: "inputs inside the bundle being replaced require atomic output" });
    }
    yield* fs.remove(out, { recursive: true, force: true }).pipe(Effect.mapError(fileError(out)));
    const binary = p.join(out, "Contents", "MacOS", executableName);
    const resourceRoot = p.join(out, "Contents", "Resources");
    yield* fs.makeDirectory(resourceRoot, { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* Artifact.copyVerified(input.executable, binary);
    yield* fs.chmod(binary, 0o755).pipe(Effect.mapError(fileError(binary)));
    for (const resource of resources) {
      const path = p.join(resourceRoot, resource.path);
      yield* Artifact.copyVerified(resource.artifact, path);
      yield* fs.chmod(path, (resource.executable ?? resource.artifact.kind === "executable") ? 0o755 : 0o644).pipe(Effect.mapError(fileError(path)));
    }
    const info = p.join(out, "Contents", "Info.plist");
    yield* fs.writeFileString(info, plist).pipe(Effect.mapError(fileError(info)));
    yield* runNative("plutil", ["-lint", info]);
    return { ...yield* Artifact.directory(out, Tool.producer(tool)), product: "app" as const };
  });
  return yield* Commit.output(outdir, produce, { atomic: input.atomic });
});
