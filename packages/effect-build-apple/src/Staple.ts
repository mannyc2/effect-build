import { Effect, Path, Schema } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { copyProduct, inspectProduct, outputPath, runNative, verifySignature } from "./internal.js";
import { SignedProduct, type SignedApp, type SignedDmg, type SignedPkg, type StapledApp, type StapledDmg, type StapledPkg, type StapledProduct } from "./Model.js";
import { AcceptedReference } from "./Notary.js";

interface StapleOptions {
  readonly acceptance: AcceptedReference;
  readonly cwd?: string | undefined;
  readonly atomic?: boolean | undefined;
}
export interface StapleAppInput extends StapleOptions {
  readonly artifact: SignedApp;
  readonly outdir?: string | undefined;
}
export interface StapleFileInput<P extends SignedDmg | SignedPkg = SignedDmg | SignedPkg> extends StapleOptions {
  readonly artifact: P;
  readonly outfile?: string | undefined;
}
export type StapleInput = StapleAppInput | StapleFileInput;
export type StapleError = InputInvalid | Artifact.ArtifactError | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;

export function staple(input: StapleAppInput): Effect.Effect<StapledApp, StapleError, Apple | Env>;
export function staple(input: StapleFileInput<SignedDmg>): Effect.Effect<StapledDmg, StapleError, Apple | Env>;
export function staple(input: StapleFileInput<SignedPkg>): Effect.Effect<StapledPkg, StapleError, Apple | Env>;
export function staple(input: StapleInput): Effect.Effect<StapledProduct, StapleError, Apple | Env>;
export function staple(input: StapleInput): Effect.Effect<StapledProduct, StapleError, Apple | Env> {
  return Effect.gen(function*() {
    yield* Schema.decodeUnknownEffect(SignedProduct)(input.artifact).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    yield* Schema.decodeUnknownEffect(AcceptedReference)(input.acceptance).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    const source = input.artifact;
    const accepted = input.acceptance.artifact;
    // Acceptance names the input before stapling; its path can change without changing the accepted bytes.
    if (accepted.kind !== source.kind || accepted.product !== source.product || accepted.bytes !== source.bytes || accepted.sha256 !== source.sha256) {
      return yield* new InputInvalid({ reason: "notarization acceptance does not match the artifact to staple" });
    }
    if (source.product === "app" ? "outfile" in input : "outdir" in input) {
      return yield* new InputInvalid({ reason: "app stapling takes outdir; file stapling takes outfile" });
    }
    const requested = "outdir" in input ? input.outdir : "outfile" in input ? input.outfile : undefined;
    const destination = yield* outputPath(requested ?? source.path, `.${source.product}`, input.cwd);
    const p = yield* Path.Path;
    yield* Artifact.verify(source);
    const produce = (out: string) => Effect.gen(function*() {
      // Direct output can intentionally staple in place; copying a file over itself would truncate it.
      if (out !== p.resolve(source.path)) yield* copyProduct(source, out);
      yield* verifySignature(source, out);
      yield* runNative("stapler", ["staple", out]);
      yield* runNative("stapler", ["validate", out]);
      yield* verifySignature(source, out);
      const current = yield* inspectProduct(source, out);
      return { ...current, ticket: input.acceptance };
    });
    return yield* Commit.output(destination, produce, { atomic: input.atomic });
  });
}
