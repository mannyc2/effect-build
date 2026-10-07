import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Python } from "effect-build-python";

const native = Python.layer({ executable: process.env.EFFECT_BUILD_UV_BIN }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.live(
  "real uv builds a wheel and sdist into the final directory",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-uv-" });
        const project = path.join(root, "project");
        yield* fs.makeDirectory(path.join(project, "src", "effect_build_fixture"), { recursive: true });
        yield* fs.writeFileString(path.join(project, "src", "effect_build_fixture", "__init__.py"), "answer = 42\n");
        yield* fs.writeFileString(
          path.join(project, "pyproject.toml"),
          [
            "[build-system]",
            'requires = ["hatchling==1.27.0"]',
            'build-backend = "hatchling.build"',
            "[project]",
            'name = "effect-build-fixture"',
            'version = "1.2.3"',
            'requires-python = ">=3.9"',
            "[tool.hatch.build.targets.wheel]",
            'packages = ["src/effect_build_fixture"]',
            "",
          ].join("\n"),
        );
        const uv = yield* Python;
        const outdir = yield* uv.build({ project, outdir: path.join(root, "dist"), atomic: true });
        const entries = yield* fs.readDirectory(outdir);
        assert.deepStrictEqual(entries.sort((left, right) => left.localeCompare(right)), [
          "effect_build_fixture-1.2.3-py3-none-any.whl",
          "effect_build_fixture-1.2.3.tar.gz",
        ]);
        assert.isAbove(
          (yield* fs.readFile(path.join(outdir, "effect_build_fixture-1.2.3-py3-none-any.whl"))).length,
          0,
        );
      }).pipe(Effect.provideContext(context))
    )),
  180_000,
);

it.live(
  "real uv backend failure preserves unrelated output files",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-uv-failure-" });
        const outdir = path.join(root, "dist");
        yield* fs.makeDirectory(outdir);
        yield* fs.writeFileString(path.join(outdir, "keep"), "keep");
        yield* fs.writeFileString(path.join(root, "pyproject.toml"), "[project\n");
        const uv = yield* Python;
        const error = yield* Effect.flip(uv.build({ project: root, outdir, atomic: true }));
        assert.strictEqual(error._tag, "ToolError");
        assert.strictEqual(yield* fs.readFileString(path.join(outdir, "keep")), "keep");
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);
