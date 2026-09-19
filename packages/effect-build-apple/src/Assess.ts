import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { runNative } from "./internal.js";
import type { Product } from "./Model.js";

export type AssessError = Tool.InputInvalid | Tool.Failed | Tool.SpawnFailed;
export interface AssessInput<A extends Product | Artifact.Executable> extends Tool.EnvironmentOptions { readonly artifact: A }
/** Ask Gatekeeper to assess the current product or standalone Darwin executable. */
export const assess = <A extends Product | Artifact.Executable>(input: AssessInput<A>): Effect.Effect<A, AssessError, Apple | Env> => Effect.gen(function*() {
  const artifact = input.artifact;
  if (artifact.kind === "executable" && (artifact.format !== "mach-o" || !artifact.target.startsWith("darwin-"))) {
    return yield* new Tool.InputInvalid({ operation: "Apple.assess", reason: "executables must target Darwin and use Mach-O" });
  }
  const mode = artifact.kind === "executable" || artifact.product === "app" ? ["execute"]
    : artifact.product === "pkg" ? ["install"] : ["open", "--context", "context:primary-signature"];
  yield* runNative("spctl", ["--assess", "--type", ...mode, "--verbose=4", artifact.path], input);
  return artifact;
});
