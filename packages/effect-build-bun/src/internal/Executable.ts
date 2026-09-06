import { Effect, FileSystem, Path, Schema } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import type * as Executable from "effect-build/Author/Executable";
import * as NativeExecutable from "effect-build/Author/NativeExecutable";
import type { SystemTarget } from "effect-build/SystemTarget";
import { describe as describeTarget, SystemTarget as SystemTargetSchema } from "effect-build/SystemTarget";

export class NativeExecutableInspectionFailed extends Schema.TaggedError<NativeExecutableInspectionFailed>()(
  "NativeExecutableInspectionFailed",
  { path: Schema.String, reason: Schema.String },
) {}

const matches = (target: SystemTarget, observed: NativeExecutable.Observation): boolean => {
  const expected = describeTarget(target);
  return expected.os === observed.os && expected.architecture === observed.architecture
    && expected.abi === (observed.abi ?? null);
};

export const inspect = (
  path: AbsolutePath,
  runtime: "bun" | "deno",
  version: string,
  expected?: SystemTarget,
): Effect.Effect<Executable.Inspection, NativeExecutableInspectionFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const observed = yield* NativeExecutable.observe(path).pipe(
      Effect.mapError(({ reason }) => new NativeExecutableInspectionFailed({ path, reason })),
    );
    const candidates = expected === undefined
      ? SystemTargetSchema.literals.filter((candidate) => matches(candidate, observed))
      : [expected];
    if (candidates.length !== 1 || !matches(candidates[0]!, observed)) {
      return yield* new NativeExecutableInspectionFailed({ path, reason: "native-target-does-not-match-request" });
    }
    const target = candidates[0]!;
    return {
      nativeFormat: observed.nativeFormat,
      runtime: { name: runtime, version },
      target,
    };
  });
