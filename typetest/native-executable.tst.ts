import type { Effect, FileSystem, Path } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import * as NativeExecutable from "effect-build/Author/NativeExecutable";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const path: AbsolutePath;
const parsed = NativeExecutable.parse(new Uint8Array());
export type _Parsed = Assert<
  Same<typeof parsed, Effect.Effect<NativeExecutable.Observation, NativeExecutable.NativeExecutableParseFailed>>
>;

const observed = NativeExecutable.observe(path);
export type _Observed = Assert<
  Same<
    typeof observed,
    Effect.Effect<
      NativeExecutable.Observation,
      NativeExecutable.NativeExecutableObservationFailed,
      FileSystem.FileSystem | Path.Path
    >
  >
>;

declare const observation: NativeExecutable.Observation;
// @ts-expect-error! Native headers do not identify a producer runtime.
observation.runtime;
// @ts-expect-error! Target admission remains with the provider.
observation.target;

// @ts-expect-error! GNU and musl ABI observations belong only to ELF/Linux.
const wrongAbi: NativeExecutable.Observation = { nativeFormat: "pe", os: "windows", architecture: "x64", abi: "gnu" };
void wrongAbi;
