import type { Crypto, Effect, FileSystem, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as Tool from "../packages/effect-build/src/Author/Tool.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

declare const produce: (stagedPath: string) => Effect.Effect<void, BuildError.ToolFailed, ChildProcessSpawner>;

const published = Tool.publishExecutable({
  tool: {
    protocol: "effect-build/selected-tool@1",
    name: "bun",
    version: "1.3.14",
    executablePath: "/usr/local/bin/bun",
    digest: { algorithm: "sha256", value: "0".repeat(64) },
  },
  outfile: "dist/app",
  target: "linux-x64-gnu",
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

const resolved = Tool.resolveExecutable({ name: "bun" });
export type _Resolve = Assert<
  Same<typeof resolved, Effect.Effect<string, BuildError.ToolNotFound, FileSystem.FileSystem | Path.Path>>
>;

const completion = Tool.run({ tool: "bun", executable: "/usr/local/bin/bun", args: ["--version"] });
export type _Run = Assert<
  Same<typeof completion, Effect.Effect<Tool.Completion, BuildError.ToolFailed, ChildProcessSpawner>>
>;
