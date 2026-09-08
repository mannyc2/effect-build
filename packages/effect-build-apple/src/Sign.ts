import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { copyProduct, copyRegular, fileError, outputPath, relativeValid, runNative, verifySignature } from "./internal.js";
import type { App, Dmg, Pkg, SignedApp, SignedDmg, SignedPkg, SignedProduct } from "./Model.js";

export interface NestedCode {
  readonly path: string;
  readonly entitlements?: Artifact.Regular;
}
interface SignOptions {
  readonly certificateSha1: string;
  readonly cwd?: string;
  readonly atomic?: boolean;
}
export interface SignAppInput extends SignOptions {
  readonly artifact: App;
  readonly outdir?: string;
  readonly entitlements?: Artifact.Regular;
  readonly nestedCode?: readonly NestedCode[];
}
export interface SignDmgInput extends SignOptions { readonly artifact: Dmg; readonly outfile?: string }
export interface SignPkgInput extends SignOptions { readonly artifact: Pkg; readonly outfile?: string }
export type SignInput = SignAppInput | SignDmgInput | SignPkgInput;
export type SignError = InputInvalid | Artifact.ArtifactError | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;

const nestedValid = (app: App, path: string): boolean => {
  if (!relativeValid(path)) return false;
  const segments = path.split("/");
  return segments.every((_, index) => {
    const entry = app.entries.find((entry) => entry.path === segments.slice(0, index + 1).join("/"));
    return entry !== undefined && (index === segments.length - 1 ? entry.kind !== "symlink" : entry.kind === "directory");
  });
};
export function sign(input: SignAppInput): Effect.Effect<SignedApp, SignError, Apple | Env>;
export function sign(input: SignDmgInput): Effect.Effect<SignedDmg, SignError, Apple | Env>;
export function sign(input: SignPkgInput): Effect.Effect<SignedPkg, SignError, Apple | Env>;
export function sign(input: SignInput): Effect.Effect<SignedProduct, SignError, Apple | Env>;
export function sign(input: SignInput): Effect.Effect<SignedProduct, SignError, Apple | Env> {
  return Effect.scoped(Effect.gen(function*() {
    if (!/^[0-9a-f]{40}$/iu.test(input.certificateSha1)) return yield* new InputInvalid({ reason: "certificateSha1 must be a 40-digit SHA-1 certificate fingerprint" });
    if (input.artifact.product === "app" ? "outfile" in input : "outdir" in input) {
      return yield* new InputInvalid({ reason: "app signing takes outdir; file signing takes outfile" });
    }
    const appInput = input.artifact.product === "app" ? input as SignAppInput : undefined;
    const destination = yield* outputPath(
      appInput === undefined ? (input as SignDmgInput | SignPkgInput).outfile ?? input.artifact.path : appInput.outdir ?? input.artifact.path,
      `.${input.artifact.product}`, input.cwd,
    );
    const nested = [...appInput?.nestedCode ?? []];
    if (appInput !== undefined && (new Set(nested.map((code) => code.path)).size !== nested.length || nested.some((code) => !nestedValid(appInput.artifact, code.path)))) {
      return yield* new InputInvalid({ reason: "nested code paths must be distinct existing app entries without symlink traversal" });
    }
    // The caller declares nested code explicitly; sign children before their containing bundles.
    nested.sort((left, right) => right.path.split("/").length - left.path.split("/").length || left.path.localeCompare(right.path));
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-apple-sign-" }).pipe(Effect.mapError(fileError(destination)));
    const entitlements = (artifact: Artifact.Regular | undefined, name: string) => Effect.gen(function*() {
      if (artifact === undefined) return undefined;
      const path = p.join(temporary, name);
      yield* copyRegular(artifact, path);
      yield* runNative("plutil", ["-lint", path]);
      return path;
    });
    const topEntitlements = yield* entitlements(appInput?.entitlements, "app-entitlements.plist");
    const nestedInputs = yield* Effect.forEach(nested, (code, index) => entitlements(code.entitlements, `nested-${index}.plist`).pipe(Effect.map((entitlements) => ({ path: code.path, entitlements }))));
    // productsign requires separate input/output paths, even for a direct in-place request.
    const packageSource = p.join(temporary, "unsigned.pkg");
    if (input.artifact.product === "pkg") yield* copyRegular(input.artifact, packageSource);
    const { tool } = yield* Apple;
    const produce = Effect.fn("Apple.sign.produce")(function*(out: string) {
      if (input.artifact.product === "pkg") {
        yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError(out)));
        yield* runNative("productsign", ["--sign", input.certificateSha1, "--timestamp", packageSource, out], { cwd });
      } else {
        yield* copyProduct(input.artifact, out);
        const signCode = (path: string, entitlements: string | undefined, runtime: boolean) => runNative("codesign", [
          "--force", "--sign", input.certificateSha1, "--timestamp", ...(runtime ? ["--options", "runtime"] : []),
          ...(entitlements === undefined ? [] : ["--entitlements", entitlements]), path,
        ], { cwd });
        for (const code of nestedInputs) yield* signCode(p.join(out, code.path), code.entitlements, true);
        yield* signCode(out, topEntitlements, input.artifact.product === "app");
      }
      const signature = { certificateSha1: input.certificateSha1, secureTimestamp: true as const };
      return input.artifact.product === "app"
        ? { ...yield* Artifact.directory(out, Tool.producer(tool)), product: "app" as const, signature: { ...signature, hardenedRuntime: true as const } }
        : { ...yield* Artifact.file(out, Tool.producer(tool)), product: input.artifact.product, signature };
    }, Effect.tap(verifySignature));
    return yield* input.atomic === false ? produce(destination) : Commit.atomic(destination, produce);
  }));
}
