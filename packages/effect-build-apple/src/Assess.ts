import { Effect, Schema } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { runNative, verifySignature } from "./internal.js";
import { SignedExecutable, type StapledProduct } from "./Model.js";
import { AcceptedReference } from "./Notary.js";

export type AssessError = Tool.InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed;
export interface AssessProductInput<A extends StapledProduct = StapledProduct> { readonly artifact: A }
/** Standalone executables cannot be stapled: Gatekeeper fetches their ticket online, so acceptance must name these exact bytes. */
export interface AssessExecutableInput { readonly artifact: SignedExecutable; readonly acceptance: AcceptedReference }
const invalid = (reason: unknown) => new Tool.InputInvalid({ operation: "Apple.assess", reason: String(reason) });

export function assess<A extends StapledProduct>(input: AssessProductInput<A>): Effect.Effect<A, AssessError, Apple | Env>;
export function assess(input: AssessExecutableInput): Effect.Effect<SignedExecutable, AssessError, Apple | Env>;
export function assess(input: AssessProductInput | AssessExecutableInput): Effect.Effect<StapledProduct | SignedExecutable, AssessError, Apple | Env> {
  return Effect.gen(function*() {
    const artifact = input.artifact;
    if (artifact.kind === "executable") {
      yield* Schema.decodeUnknownEffect(SignedExecutable)(artifact).pipe(Effect.mapError(invalid));
      const acceptance = "acceptance" in input ? input.acceptance : undefined;
      if (acceptance === undefined) return yield* invalid("executable assessment requires the notarization acceptance");
      yield* Schema.decodeUnknownEffect(AcceptedReference)(acceptance).pipe(Effect.mapError(invalid));
      const accepted = acceptance.artifact;
      if (accepted.kind !== "executable" || accepted.bytes !== artifact.bytes || accepted.sha256 !== artifact.sha256) {
        return yield* invalid("notarization acceptance does not match the executable");
      }
      yield* Artifact.verify(artifact);
      yield* verifySignature(artifact);
      yield* runNative("spctl", ["--assess", "--type", "execute", "--verbose=4", artifact.path]);
      return artifact;
    }
    yield* Schema.decodeUnknownEffect(AcceptedReference)(artifact.ticket).pipe(Effect.mapError(invalid));
    if (artifact.ticket.artifact.kind !== artifact.kind || !("product" in artifact.ticket.artifact) || artifact.ticket.artifact.product !== artifact.product) {
      return yield* invalid("the notarization ticket describes a different product kind");
    }
    // Stapling changes the accepted bytes, so validate the current artifact and its native ticket independently.
    yield* Artifact.verify(artifact);
    yield* verifySignature(artifact);
    yield* runNative("stapler", ["validate", artifact.path]);
    const mode = artifact.product === "app" ? ["execute"]
      : artifact.product === "pkg" ? ["install"]
      : ["open", "--context", "context:primary-signature"];
    yield* runNative("spctl", ["--assess", "--type", ...mode, "--verbose=4", artifact.path]);
    return artifact;
  });
}
