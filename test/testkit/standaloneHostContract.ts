import { Effect, FileSystem, Path } from "effect";
import * as Bun from "effect-build-bun";
import { type ChildProcessSpawner, runProcess } from "../../packages/effect-build/src/standalone/internal/Process.js";

export const standaloneHostContract: Effect.Effect<
  void,
  unknown,
  Bun.Compiler | ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> = Effect.scoped(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-host-" });
    const entrypoint = yield* path.fromFileUrl(new URL("../fixtures/standalone/hello.ts", import.meta.url));
    const artifact = yield* Bun.compileExecutable({
      entrypoint,
      outfile: path.join(directory, "host-app"),
    });
    const completion = yield* runProcess(artifact.path, []);
    if (completion.exitCode !== 0 || completion.stdout.text !== "effect-build-ok\n") {
      return yield* Effect.fail(new Error("compiled artifact failed under host contract"));
    }
  }),
);
