import { Effect, Schema } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { runNative, verifySignature } from "./internal.js";
import type { StapledProduct } from "./Model.js";
import { AcceptedReference } from "./Notary.js";

export type AssessError = InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed;

export const assess = <A extends StapledProduct>(input: { readonly artifact: A }): Effect.Effect<A, AssessError, Apple | Env> =>
  Effect.gen(function*() {
    const artifact = input.artifact;
    yield* Schema.decodeUnknownEffect(AcceptedReference)(artifact.ticket).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    if (artifact.ticket.artifact.product !== artifact.product || artifact.ticket.artifact.kind !== artifact.kind) {
      return yield* new InputInvalid({ reason: "the notarization ticket describes a different product kind" });
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
