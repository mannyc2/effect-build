import { Effect, FileSystem, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import type { Product, Signed } from "./Model.js";
import { plist } from "./plist.js";

export type NativeTool = "codesign" | "hdiutil" | "plutil" | "pkgbuild" | "productbuild" | "productsign" | "pkgutil" | "notarytool" | "stapler" | "spctl" | "ditto";
export const runNative = (name: NativeTool, args: readonly string[], options: { readonly cwd?: string | undefined; readonly redact?: readonly string[] | undefined } = {}): Effect.Effect<
  Tool.Completion, Tool.Failed | Tool.SpawnFailed, Apple | ChildProcessSpawner.ChildProcessSpawner
> => Apple.use(({ tool }) => Tool.run(tool, [name, ...args], options));

export const textValid = (value: string): boolean => value.length > 0 && !value.includes("\0");
export const outputPath = (value: string, extension: ".app" | ".dmg" | ".pkg" | undefined, cwd?: string) => Effect.gen(function*() {
  if (!textValid(value) || (extension !== undefined && !value.toLowerCase().endsWith(extension)) || (cwd !== undefined && !textValid(cwd))) {
    return yield* new InputInvalid({ reason: `${extension === undefined ? "output" : `output must end in ${extension};`} paths must be non-empty and contain no NUL` });
  }
  const p = yield* Path.Path;
  return p.resolve(cwd ?? "", value);
});

export const copyRegular = (artifact: Artifact.Regular, destination: string, executable = artifact.kind === "executable") => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  yield* Artifact.copyVerified(artifact, destination);
  // An in-place destination keeps its own mode.
  if (p.resolve(artifact.path) !== p.resolve(destination)) {
    yield* fs.chmod(destination, executable ? 0o755 : 0o644).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  }
});
export const copyProduct = (artifact: Artifact.Artifact, destination: string): Effect.Effect<
  void, InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed, Apple | Env
> => Effect.gen(function*() {
  if (artifact.kind !== "directory") return yield* copyRegular(artifact, destination);
  yield* Artifact.verify(artifact);
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const source = yield* fs.realPath(artifact.path).pipe(Effect.mapError(Artifact.ioError(artifact.path)));
  // Resolve missing output components too: a symlinked parent can otherwise copy an app inside itself.
  const missing: string[] = [];
  let destinationRoot = p.resolve(destination);
  while (true) {
    const existing = yield* fs.realPath(destinationRoot).pipe(
      Effect.catchIf((error) => error.reason._tag === "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(Artifact.ioError(destinationRoot)),
    );
    if (existing !== undefined) {
      destinationRoot = p.join(existing, ...missing);
      break;
    }
    const parent = p.dirname(destinationRoot);
    if (parent === destinationRoot) return yield* new Artifact.ArtifactError({ path: destination, reason: "unreadable" });
    missing.unshift(p.basename(destinationRoot));
    destinationRoot = parent;
  }
  if (source === destinationRoot) return;
  if (source.startsWith(`${destinationRoot}${p.sep}`) || destinationRoot.startsWith(`${source}${p.sep}`)) {
    return yield* new InputInvalid({ reason: "app copy source and destination must not contain one another" });
  }
  yield* fs.makeDirectory(p.dirname(destination), { recursive: true }).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  yield* fs.remove(destination, { recursive: true, force: true }).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  // ditto preserves framework symlinks verbatim; Node's recursive copy can rewrite them toward the source tree.
  yield* runNative("ditto", [artifact.path, destination]);
  yield* Artifact.verify({ ...artifact, path: destination });
});
export const verifySignature = (signed: Signed, path = signed.path): Effect.Effect<
  void, Tool.Failed | Tool.SpawnFailed, Apple | ChildProcessSpawner.ChildProcessSpawner
> => ("product" in signed && signed.product === "pkg"
  ? runNative("pkgutil", ["--check-signature", path])
  : runNative("codesign", ["--verify", ...("product" in signed && signed.product === "app" ? ["--deep"] : []), "--strict", path])).pipe(Effect.asVoid);
/** Entitlements arrive as a plist artifact or as keys; both are linted as the file codesign receives. */
export type Entitlements = Artifact.Regular | readonly string[];
export const entitlementsFile = (entitlements: Entitlements | undefined, path: string): Effect.Effect<
  string | undefined, InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed, Apple | Env
> => Effect.gen(function*() {
  if (entitlements === undefined) return undefined;
  if (Array.isArray(entitlements)) {
    const keys = entitlements as readonly string[];
    if (keys.length === 0 || keys.some((key) => !textValid(key) || key.trim() !== key) || new Set(keys).size !== keys.length) {
      return yield* new InputInvalid({ reason: "entitlement keys must be distinct, trimmed, non-empty, and contain no NUL" });
    }
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, plist(Object.fromEntries(keys.map((key) => [key, true as const])))).pipe(Effect.mapError(Artifact.ioError(path, "write")));
  } else {
    yield* copyRegular(entitlements as Artifact.Regular, path);
  }
  yield* runNative("plutil", ["-lint", path]);
  return path;
});
/** Refresh core file facts after the caller has checked the retained product refinements. */
export const inspectProduct = <P extends Product>(product: P, path: string): Effect.Effect<P, Artifact.ArtifactError, Apple | Env> => Effect.gen(function*() {
  const { tool } = yield* Apple;
  const current = product.kind === "directory" ? yield* Artifact.directory(path, Tool.producer(tool)) : yield* Artifact.file(path, Tool.producer(tool));
  return { ...product, ...current };
});
