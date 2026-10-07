import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Python } from "effect-build-python";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

it.effect("uv builds from a project with native flags and returns its output directory", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(Path.layer)));
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        assert.strictEqual(command._tag, "StandardCommand");
        if (command._tag === "StandardCommand") {
          assert.deepStrictEqual(command.args, [
            "build",
            "--offline",
            path.resolve("project"),
            "--out-dir",
            path.resolve("dist"),
            "--no-create-gitignore",
          ]);
          assert.strictEqual(command.options.cwd, path.resolve("project"));
        }
        return ToolTest.handle();
      })
    );
    const uv = yield* Python.make({ executable: "uv" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    assert.strictEqual(
      yield* uv.build({ project: "project", outdir: "dist", extraArgs: ["--offline"] }),
      path.resolve("dist"),
    );
  }));

it.effect("uv backend failures keep native diagnostics", () =>
  Effect.gen(function*() {
    const spawner = ToolTest.layer(() =>
      Effect.succeed(ToolTest.handle({
        stderr: "Failed to build: backend rejected pyproject.toml",
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(2)),
      }))
    );
    const uv = yield* Python.make({ executable: "uv" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const error = yield* Effect.flip(uv.build({ project: "project", outdir: "dist" }));
    assert.strictEqual(error._tag, "ToolError");
    assert.include(error.message, "backend rejected pyproject.toml");
  }));
