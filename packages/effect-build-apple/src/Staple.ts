import { Effect, Path } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { copyProduct, inspectProduct, outputPath, runNative } from "./internal.js";
import type { App, Dmg, Pkg, Product } from "./Model.js";

interface StapleOptions extends Commit.ProducerOptions, Tool.EnvironmentOptions {
  readonly cwd?: string | undefined;
}
export interface StapleAppInput extends StapleOptions {
  readonly artifact: App;
  readonly outdir?: string | undefined;
}
export interface StapleFileInput<P extends Dmg | Pkg = Dmg | Pkg> extends StapleOptions {
  readonly artifact: P;
  readonly outfile?: string | undefined;
}
export type StapleInput = StapleAppInput | StapleFileInput;
export type StapleError = Tool.InputInvalid | Artifact.ArtifactError | Commit.CommitError | Tool.Failed | Tool.SpawnFailed;

const invalid = (reason: unknown) => new Tool.InputInvalid({ operation: "Apple.staple", reason: String(reason) });
export function staple(input: StapleAppInput): Effect.Effect<App, StapleError, Apple | Env>;
export function staple(input: StapleFileInput<Dmg>): Effect.Effect<Dmg, StapleError, Apple | Env>;
export function staple(input: StapleFileInput<Pkg>): Effect.Effect<Pkg, StapleError, Apple | Env>;
export function staple(input: StapleInput): Effect.Effect<Product, StapleError, Apple | Env>;
export function staple(input: StapleInput): Effect.Effect<Product, StapleError, Apple | Env> {
  return Effect.gen(function*() {
    const source = input.artifact;
    if (source.product === "app" ? "outfile" in input : "outdir" in input) {
      return yield* invalid("app stapling takes outdir; file stapling takes outfile");
    }
    const requested = "outdir" in input ? input.outdir : "outfile" in input ? input.outfile : undefined;
    const destination = yield* outputPath("Apple.staple", requested ?? source.path, `.${source.product}`, input.cwd);
    const p = yield* Path.Path;
    const produce = (out: string) => Effect.gen(function*() {
      // Direct output can intentionally staple in place; copying a file over itself would truncate it.
      if (out !== p.resolve(source.path)) yield* copyProduct("Apple.staple", source, out, input);
      yield* runNative("stapler", ["staple", out], input);
      return yield* inspectProduct(source, out);
    });
    return yield* Commit.output(destination, produce, input);
  });
}
