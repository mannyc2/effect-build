import type { Crypto, Effect, FileSystem, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";
import * as Toolchain from "../packages/effect-build/src/Toolchain.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const produce: (stagedPath: string) => Effect.Effect<void, BuildError.ToolFailed, ChildProcessSpawner>;

const published = Toolchain.publishExecutable({
  tool: { name: "bun", version: "1.3.14" },
  outfile: "dist/app",
  target: "linux-x64-gnu",
  hash: true,
  produce,
});

// Producer failures and requirements flow through publication.
export type _Publish = Assert<
  Same<
    typeof published,
    Effect.Effect<
      Artifact.Executable,
      BuildError.PublishFailed | BuildError.ToolFailed,
      FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner
    >
  >
>;

const resolved = Toolchain.resolveExecutable({ name: "bun" });
export type _Resolve = Assert<
  Same<typeof resolved, Effect.Effect<string, BuildError.ToolNotFound, FileSystem.FileSystem | Path.Path>>
>;

const completion = Toolchain.run({ tool: "bun", executable: "/usr/local/bin/bun", args: ["--version"] });
export type _Run = Assert<
  Same<typeof completion, Effect.Effect<Toolchain.Completion, BuildError.ToolFailed, ChildProcessSpawner>>
>;
