import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Nfpm } from "effect-build-nfpm";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

it.effect("nFPM consumes its native config without rewriting metadata", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(Path.layer)));
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        assert.strictEqual(command._tag, "StandardCommand");
        if (command._tag === "StandardCommand") {
          assert.deepStrictEqual(command.args, [
            "package",
            "--quiet",
            "--config",
            "nfpm.yaml",
            "--packager",
            "deb",
            "--target",
            path.resolve("app.deb"),
          ]);
        }
        return ToolTest.handle();
      })
    );
    const nfpm = yield* Nfpm.make({ executable: "nfpm" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    assert.strictEqual(
      yield* nfpm.package({ config: "nfpm.yaml", format: "deb", outfile: "app.deb", extraArgs: ["--quiet"] }),
      path.resolve("app.deb"),
    );
  }));

it.effect("nFPM leaves native config failures observable", () =>
  Effect.gen(function*() {
    const nfpm = yield* Nfpm.make({ executable: "nfpm" }).pipe(Effect.provideContext(
      yield* Layer.build(Layer.mergeAll(
        ToolTest.layer(() =>
          Effect.succeed(
            ToolTest.handle({
              stderr: "yaml: cannot unmarshal",
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
            }),
          )
        ),
        FileSystem.layerNoop({}),
        Path.layer,
      )),
    ));
    const error = yield* Effect.flip(nfpm.package({ config: "invalid.yaml", format: "deb", outfile: "app.deb" }));
    assert.include(error.message, "yaml: cannot unmarshal");
  }));
