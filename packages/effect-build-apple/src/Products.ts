import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { validateResources, type Resource } from "./AppBundle.js";
import { copyProduct, copyRegular, outputPath, runNative, verifySignature } from "./internal.js";
import type { Dmg, Pkg, SignedApp, SignedExecutable } from "./Model.js";

export interface DmgInput extends Commit.ProducerOptions {
  readonly artifact: SignedApp;
  readonly outfile: string;
  readonly volumeName: string;
  readonly layout?: readonly Resource[] | undefined;
  readonly applicationsLink?: true | undefined;
  readonly cwd?: string | undefined;
}
export interface PkgInput extends Commit.ProducerOptions {
  /** A signed app installs under `/Applications`; a signed executable under `/usr/local/bin`, unless installLocation says otherwise. */
  readonly artifact: SignedApp | SignedExecutable;
  readonly outfile: string;
  readonly identifier: string;
  readonly version: string;
  readonly installLocation?: string | undefined;
  readonly cwd?: string | undefined;
}
export type ProductError = Tool.InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;

export const dmg = (input: DmgInput): Effect.Effect<Dmg, ProductError, Apple | Env> => Effect.scoped(Effect.gen(function*() {
  const outfile = yield* outputPath("Apple.dmg", input.outfile, ".dmg", input.cwd);
  if (Tool.argumentIssue(input.volumeName) !== undefined || /[/:]/u.test(input.volumeName) || Array.from(input.volumeName).some((character) => character.charCodeAt(0) < 32)) {
    return yield* new Tool.InputInvalid({ operation: "Apple.dmg", reason: "volumeName must be non-empty and contain no slash, colon, or control characters" });
  }
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const appName = p.basename(input.artifact.path);
  if (!appName.toLowerCase().endsWith(".app")) return yield* new Tool.InputInvalid({ operation: "Apple.dmg", reason: "the input app path must end in .app" });
  yield* validateResources("Apple.dmg", input.layout ?? [], [appName, ...(input.applicationsLink === true ? ["Applications"] : [])]);
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-apple-dmg-" }).pipe(Effect.mapError(Artifact.ioError(outfile, "write")));
  const volume = p.join(temporary, "volume");
  yield* fs.makeDirectory(volume).pipe(Effect.mapError(Artifact.ioError(volume, "write")));
  const app = p.join(volume, appName);
  yield* copyProduct("Apple.dmg", input.artifact, app);
  yield* verifySignature(input.artifact, app);
  for (const entry of input.layout ?? []) yield* copyRegular(entry.artifact, p.join(volume, entry.path), entry.executable ?? entry.artifact.kind === "executable");
  if (input.applicationsLink === true) yield* fs.symlink("/Applications", p.join(volume, "Applications")).pipe(Effect.mapError(Artifact.ioError(volume, "write")));
  const { tool } = yield* Apple;
  const cwd = p.resolve(input.cwd ?? "");
  const produce = (out: string) => Effect.gen(function*() {
    yield* runNative("hdiutil", ["create", "-ov", "-volname", input.volumeName, "-srcfolder", volume, "-fs", "HFS+", "-format", "UDZO", out], { cwd });
    yield* runNative("hdiutil", ["verify", out], { cwd });
    return { ...yield* Artifact.file(out, Tool.producer(tool)), product: "dmg" as const };
  });
  return yield* Commit.output(outfile, produce, input);
}));

export const pkg = (input: PkgInput): Effect.Effect<Pkg, ProductError, Apple | Env> => Effect.scoped(Effect.gen(function*() {
  const outfile = yield* outputPath("Apple.pkg", input.outfile, ".pkg", input.cwd);
  const app = input.artifact.kind === "directory";
  const installLocation = input.installLocation ?? (app ? "/Applications" : "/usr/local/bin");
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(input.identifier) || Tool.argumentIssue(input.version) !== undefined || Tool.argumentIssue(installLocation) !== undefined || !installLocation.startsWith("/") || installLocation.split("/").includes("..")) {
    return yield* new Tool.InputInvalid({ operation: "Apple.pkg", reason: "pkg requires a reverse-DNS identifier, non-empty version, and absolute installLocation without traversal or NUL" });
  }
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-apple-pkg-" }).pipe(Effect.mapError(Artifact.ioError(outfile, "write")));
  const name = p.basename(input.artifact.path);
  if (app && !name.toLowerCase().endsWith(".app")) return yield* new Tool.InputInvalid({ operation: "Apple.pkg", reason: "the input app path must end in .app" });
  // pkgbuild takes an app as a component; an executable ships as a payload root holding it under its own name.
  const payload = app ? p.join(temporary, name) : p.join(temporary, "root", name);
  yield* copyProduct("Apple.pkg", input.artifact, payload);
  yield* verifySignature(input.artifact, payload);
  const component = p.join(temporary, "component.pkg");
  const cwd = p.resolve(input.cwd ?? "");
  yield* runNative("pkgbuild", [...(app ? ["--component", payload] : ["--root", p.dirname(payload)]), "--identifier", input.identifier, "--version", input.version, "--install-location", installLocation, component], { cwd });
  const { tool } = yield* Apple;
  const produce = (out: string) => Effect.gen(function*() {
    yield* runNative("productbuild", ["--package", component, out], { cwd });
    yield* runNative("pkgutil", ["--payload-files", out], { cwd });
    return { ...yield* Artifact.file(out, Tool.producer(tool)), product: "pkg" as const };
  });
  return yield* Commit.output(outfile, produce, input);
}));
