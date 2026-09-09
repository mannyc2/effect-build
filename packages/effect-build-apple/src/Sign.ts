import { Effect, FileSystem, Path } from "effect";
import { Artifact, Commit, type Executable, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { copyProduct, copyRegular, type Entitlements, entitlementsFile, fileError, outputPath, relativeValid, runNative, verifySignature } from "./internal.js";
import type { App, Dmg, Pkg, SignedApp, SignedDmg, SignedExecutable, SignedPkg, SignedProduct } from "./Model.js";

export type { Entitlements } from "./internal.js";
export interface NestedCode {
  readonly path: string;
  readonly entitlements?: Entitlements | undefined;
}
interface SignOptions {
  readonly certificateSha1: string;
  readonly cwd?: string | undefined;
  readonly atomic?: boolean | undefined;
}
export interface SignAppInput extends SignOptions {
  readonly artifact: App;
  readonly outdir?: string | undefined;
  readonly entitlements?: Entitlements | undefined;
  readonly nestedCode?: readonly NestedCode[] | undefined;
}
export interface SignDmgInput extends SignOptions { readonly artifact: Dmg; readonly outfile?: string }
export interface SignPkgInput extends SignOptions { readonly artifact: Pkg; readonly outfile?: string }
/** A standalone Darwin executable, signed with the hardened runtime and a secure timestamp as notarization requires. */
export interface SignExecutableInput extends SignOptions {
  readonly artifact: Artifact.Executable;
  readonly outfile?: string | undefined;
  readonly entitlements?: Entitlements | undefined;
}
export type SignInput = SignAppInput | SignDmgInput | SignPkgInput | SignExecutableInput;
export type SignError = InputInvalid | Artifact.ArtifactError | Executable.InspectError | Executable.TargetMismatch | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;

const nestedValid = (app: App, path: string): boolean => {
  if (!relativeValid(path)) return false;
  const segments = path.split("/");
  return segments.every((_, index) => {
    const entry = app.entries.find((entry) => entry.path === segments.slice(0, index + 1).join("/"));
    return entry !== undefined && (index === segments.length - 1 ? entry.kind !== "symlink" : entry.kind === "directory");
  });
};
const signProduct = (input: SignAppInput | SignDmgInput | SignPkgInput): Effect.Effect<SignedProduct, SignError, Apple | Env> =>
  Effect.scoped(Effect.gen(function*() {
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
    const topEntitlements = yield* entitlementsFile(appInput?.entitlements, p.join(temporary, "app-entitlements.plist"));
    const nestedInputs = yield* Effect.forEach(nested, (code, index) => entitlementsFile(code.entitlements, p.join(temporary, `nested-${index}.plist`)).pipe(Effect.map((entitlements) => ({ path: code.path, entitlements }))));
    // productsign requires separate input/output paths, even for a direct in-place request.
    const packageSource = p.join(temporary, "unsigned.pkg");
    if (input.artifact.product === "pkg") yield* copyRegular(input.artifact, packageSource);
    const { tool } = yield* Apple;
    const produce = Effect.fn("Apple.sign.produce")(function*(out: string) {
      if (input.artifact.product === "pkg") {
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
    return yield* Commit.output(destination, produce, { atomic: input.atomic });
  }));
const signExecutable = (input: SignExecutableInput): Effect.Effect<SignedExecutable, SignError, Apple | Env> =>
  Effect.scoped(Effect.gen(function*() {
    if (input.artifact.format !== "mach-o" || !input.artifact.target.startsWith("darwin-")) {
      return yield* new InputInvalid({ reason: "executables must target Darwin and use Mach-O" });
    }
    if ("outdir" in input) return yield* new InputInvalid({ reason: "executable signing takes outfile" });
    const destination = yield* outputPath(input.outfile ?? input.artifact.path, undefined, input.cwd);
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-apple-sign-" }).pipe(Effect.mapError(fileError(destination)));
    const entitlements = yield* entitlementsFile(input.entitlements, p.join(temporary, "entitlements.plist"));
    const { tool } = yield* Apple;
    const signature = { certificateSha1: input.certificateSha1, secureTimestamp: true as const, hardenedRuntime: true as const };
    const produce = Effect.fn("Apple.sign.produce")(function*(out: string) {
      yield* copyRegular(input.artifact, out);
      yield* runNative("codesign", [
        "--force", "--sign", input.certificateSha1, "--timestamp", "--options", "runtime",
        ...(entitlements === undefined ? [] : ["--entitlements", entitlements]), out,
      ], { cwd });
      // Signing rewrites the binary; its header must still describe the input target.
      return { ...yield* Artifact.executable(out, Tool.producer(tool), input.artifact.target), signature };
    }, Effect.tap(verifySignature));
    return yield* Commit.output(destination, produce, { atomic: input.atomic });
  }));

export function sign(input: SignAppInput): Effect.Effect<SignedApp, SignError, Apple | Env>;
export function sign(input: SignDmgInput): Effect.Effect<SignedDmg, SignError, Apple | Env>;
export function sign(input: SignPkgInput): Effect.Effect<SignedPkg, SignError, Apple | Env>;
export function sign(input: SignExecutableInput): Effect.Effect<SignedExecutable, SignError, Apple | Env>;
export function sign(input: SignInput): Effect.Effect<SignedProduct | SignedExecutable, SignError, Apple | Env>;
export function sign(input: SignInput): Effect.Effect<SignedProduct | SignedExecutable, SignError, Apple | Env> {
  if (!/^[0-9a-f]{40}$/iu.test(input.certificateSha1)) return Effect.fail(new InputInvalid({ reason: "certificateSha1 must be a 40-digit SHA-1 certificate fingerprint" }));
  return input.artifact.kind === "executable" ? signExecutable(input as SignExecutableInput) : signProduct(input as SignAppInput | SignDmgInput | SignPkgInput);
}
