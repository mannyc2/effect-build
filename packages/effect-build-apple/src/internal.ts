import { Effect, FileSystem, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import type { Product, SignedProduct } from "./Model.js";

export type NativeTool = "codesign" | "hdiutil" | "plutil" | "pkgbuild" | "productbuild" | "productsign" | "pkgutil" | "notarytool" | "stapler" | "spctl" | "ditto";
export const runNative = (name: NativeTool, args: readonly string[], options: { readonly cwd?: string; readonly redact?: readonly string[] } = {}): Effect.Effect<
  Tool.Completion, Tool.Failed | Tool.SpawnFailed, Apple | ChildProcessSpawner.ChildProcessSpawner
> => Apple.use(({ tool }) => Tool.run(tool, [name, ...args], options).pipe(Effect.mapError((error) => {
  const scrub = (value: string) => (options.redact ?? []).reduce((text, secret) => secret.length === 0 ? text : text.replaceAll(secret, "<redacted>"), value);
  // Native credentials can appear in argv, stderr, or a failed process launch.
  return error instanceof Tool.Failed
    ? new Tool.Failed({ name: error.name, args: error.args.map(scrub), exitCode: error.exitCode, stderr: scrub(error.stderr) })
    : new Tool.SpawnFailed({ name: error.name, detail: scrub(error.detail) });
})));

export const fileError = (path: string) => (error: unknown): Artifact.ArtifactError =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });
export const textValid = (value: string): boolean => value.length > 0 && !value.includes("\0");
export const relativeValid = (value: string): boolean => textValid(value) && !/^[a-z]:/iu.test(value) && !value.includes("\\") && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
export const outputPath = (value: string, extension: ".app" | ".dmg" | ".pkg", cwd?: string) => Effect.gen(function*() {
  if (!textValid(value) || !value.toLowerCase().endsWith(extension) || (cwd !== undefined && !textValid(cwd))) {
    return yield* new InputInvalid({ reason: `output must end in ${extension}; paths must be non-empty and contain no NUL` });
  }
  const p = yield* Path.Path;
  return p.resolve(cwd ?? "", value);
});

export const copyRegular = (artifact: Artifact.Regular, destination: string, executable = artifact.kind === "executable") => Effect.gen(function*() {
  const contents = yield* Artifact.readVerified(artifact);
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  if (p.resolve(artifact.path) === p.resolve(destination)) return;
  yield* fs.makeDirectory(p.dirname(destination), { recursive: true }).pipe(Effect.mapError(fileError(destination)));
  yield* fs.writeFile(destination, contents).pipe(Effect.mapError(fileError(destination)));
  yield* fs.chmod(destination, executable ? 0o755 : 0o644).pipe(Effect.mapError(fileError(destination)));
});
export const copyProduct = (artifact: Artifact.Artifact, destination: string): Effect.Effect<
  void, InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed, Apple | Env
> => Effect.gen(function*() {
  if (artifact.kind !== "directory") return yield* copyRegular(artifact, destination);
  yield* Artifact.verify(artifact);
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const source = yield* fs.realPath(artifact.path).pipe(Effect.mapError(fileError(artifact.path)));
  // Resolve missing output components too: a symlinked parent can otherwise copy an app inside itself.
  const missing: string[] = [];
  let destinationRoot = p.resolve(destination);
  while (true) {
    const existing = yield* fs.realPath(destinationRoot).pipe(Effect.option);
    if (existing._tag === "Some") { destinationRoot = p.join(existing.value, ...missing); break; }
    const parent = p.dirname(destinationRoot);
    if (parent === destinationRoot) return yield* new Artifact.ArtifactError({ path: destination, reason: "unreadable" });
    missing.unshift(p.basename(destinationRoot));
    destinationRoot = parent;
  }
  if (source === destinationRoot) return;
  if (source.startsWith(`${destinationRoot}${p.sep}`) || destinationRoot.startsWith(`${source}${p.sep}`)) {
    return yield* new InputInvalid({ reason: "app copy source and destination must not contain one another" });
  }
  yield* fs.makeDirectory(p.dirname(destination), { recursive: true }).pipe(Effect.mapError(fileError(destination)));
  yield* fs.remove(destination, { recursive: true, force: true }).pipe(Effect.mapError(fileError(destination)));
  // ditto preserves framework symlinks verbatim; Node's recursive copy can rewrite them toward the source tree.
  yield* runNative("ditto", [artifact.path, destination]);
  yield* Artifact.verify({ ...artifact, path: destination });
});
export const verifySignature = (product: SignedProduct, path = product.path): Effect.Effect<
  void, Tool.Failed | Tool.SpawnFailed, Apple | ChildProcessSpawner.ChildProcessSpawner
> => (product.product === "pkg"
  ? runNative("pkgutil", ["--check-signature", path])
  : runNative("codesign", ["--verify", ...(product.product === "app" ? ["--deep"] : []), "--strict", path])).pipe(Effect.asVoid);
/** Refresh core file facts after the caller has checked the retained product refinements. */
export const inspectProduct = <P extends Product>(product: P, path: string): Effect.Effect<P, Artifact.ArtifactError, Apple | Env> => Effect.gen(function*() {
  const { tool } = yield* Apple;
  const current = product.kind === "directory" ? yield* Artifact.directory(path, Tool.producer(tool)) : yield* Artifact.file(path, Tool.producer(tool));
  return { ...product, ...current };
});
