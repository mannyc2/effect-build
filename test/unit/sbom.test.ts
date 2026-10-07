import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Sbom } from "effect-build-sbom";
import { ToolTest } from "effect-build/testing";

it.effect("Syft decodes native JSON and preserves its report structure", () =>
  Effect.gen(function*() {
    const sbom = yield* Sbom.make({ executable: "syft" }).pipe(Effect.provideContext(
      yield* Layer.build(Layer.mergeAll(
        ToolTest.layer((command) =>
          Effect.sync(() => {
            assert.strictEqual(command._tag, "StandardCommand");
            if (command._tag === "StandardCommand") {
              assert.deepStrictEqual(command.args, ["scan", "dir:project", "--output", "syft-json", "--quiet"]);
            }
            return ToolTest.handle({
              stdout: '{"artifacts":[{"name":"effect","version":"4.0.0"}],"descriptor":{"name":"syft"}}',
            });
          })
        ),
        FileSystem.layerNoop({}),
        Path.layer,
      )),
    ));
    assert.deepStrictEqual(yield* sbom.report({ source: "dir:project" }), {
      artifacts: [{ name: "effect", version: "4.0.0" }],
      descriptor: { name: "syft" },
    });
  }));

it.effect("Syft rejects malformed JSON through ToolError Output", () =>
  Effect.gen(function*() {
    const sbom = yield* Sbom.make({ executable: "syft" }).pipe(Effect.provideContext(
      yield* Layer.build(Layer.mergeAll(
        ToolTest.layer(() => Effect.succeed(ToolTest.handle({ stdout: "{truncated" }))),
        FileSystem.layerNoop({}),
        Path.layer,
      )),
    ));
    const error = yield* Effect.flip(sbom.report({ source: "dir:project" }));
    assert.strictEqual(error.reason._tag, "Output");
  }));

it.effect("Syft writes the requested native format to the returned final path", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(Path.layer)));
    const sbom = yield* Sbom.make({ executable: "syft" }).pipe(Effect.provideContext(
      yield* Layer.build(Layer.mergeAll(
        ToolTest.layer((command) =>
          Effect.sync(() => {
            assert.strictEqual(command._tag, "StandardCommand");
            if (command._tag === "StandardCommand") {
              assert.deepStrictEqual(command.args, [
                "scan",
                "dir:project",
                "--output",
                `spdx-json@2.3=${path.resolve("sbom.json")}`,
                "--quiet",
              ]);
            }
            return ToolTest.handle();
          })
        ),
        FileSystem.layerNoop({}),
        Path.layer,
      )),
    ));
    assert.strictEqual(
      yield* sbom.generate({ source: "dir:project", format: "spdx-json@2.3", outfile: "sbom.json" }),
      path.resolve("sbom.json"),
    );
  }));
