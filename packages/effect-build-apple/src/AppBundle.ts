import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, Executable, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { fileError, outputPath, relativeValid, runNative, textValid } from "./internal.js";
import type { App } from "./Model.js";

export interface Resource {
  readonly artifact: Artifact.Regular;
  /** Relative to Contents/Resources for apps, or the volume root for disk images. */
  readonly path: string;
  readonly executable?: boolean;
}
export interface AppBundleInput {
  readonly executable: Artifact.Executable;
  readonly outdir: string;
  readonly bundleIdentifier: string;
  readonly bundleName: string;
  readonly version: string;
  readonly shortVersion?: string;
  readonly displayName?: string;
  readonly executableName?: string;
  readonly minimumSystemVersion?: string;
  readonly resources?: readonly Resource[];
  readonly cwd?: string;
  readonly atomic?: boolean;
}
export type AppBundleError = InputInvalid | Artifact.ArtifactError | Executable.InspectError | Executable.TargetMismatch | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;
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
  // Capture inputs before direct output replacement, including resources located in a prior bundle.
  const executable = yield* Artifact.readVerified(input.executable);
  const resources = yield* Effect.forEach(input.resources ?? [], (resource) => Artifact.readVerified(resource.artifact).pipe(Effect.map((contents) => ({ ...resource, contents }))));
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
    yield* fs.remove(out, { recursive: true, force: true }).pipe(Effect.mapError(fileError(out)));
    const binary = p.join(out, "Contents", "MacOS", executableName);
    const resourceRoot = p.join(out, "Contents", "Resources");
    yield* fs.makeDirectory(p.dirname(binary), { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* fs.makeDirectory(resourceRoot, { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* fs.writeFile(binary, executable).pipe(Effect.mapError(fileError(binary)));
    yield* fs.chmod(binary, 0o755).pipe(Effect.mapError(fileError(binary)));
    yield* Artifact.executable(binary, input.executable.producedBy, input.executable.target);
    for (const resource of resources) {
      const path = p.join(resourceRoot, resource.path);
      yield* fs.makeDirectory(p.dirname(path), { recursive: true }).pipe(Effect.mapError(fileError(path)));
      yield* fs.writeFile(path, resource.contents).pipe(Effect.mapError(fileError(path)));
      yield* fs.chmod(path, (resource.executable ?? resource.artifact.kind === "executable") ? 0o755 : 0o644).pipe(Effect.mapError(fileError(path)));
    }
    const info = p.join(out, "Contents", "Info.plist");
    yield* fs.writeFileString(info, plist).pipe(Effect.mapError(fileError(info)));
    yield* runNative("plutil", ["-lint", info]);
    return { ...yield* Artifact.directory(out, Tool.producer(tool)), product: "app" as const };
  });
  return yield* input.atomic === false ? produce(outdir) : Commit.atomic(outdir, produce);
});
