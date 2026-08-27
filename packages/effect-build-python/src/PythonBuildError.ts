import { Schema } from "effect";

/** The uv frontend completed without the exact wheel-and-sdist result family. */
export class PythonBuildFailed extends Schema.TaggedError<PythonBuildFailed>()("PythonBuildFailed", {
  source: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `Python build for ${this.source} failed: ${this.reason}`;
  }
}
