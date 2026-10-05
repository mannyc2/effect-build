import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { NodeSea } from "effect-build-node-sea";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

const Config = Schema.fromJsonString(Schema.Struct({
  main: Schema.String,
  executable: Schema.String,
  output: Schema.String,
  assets: Schema.Record(Schema.String, Schema.String),
}));

describe("NodeSea", () => {
  it.effect("checks source then assembles through the selected command and publishes the final path", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "sea-binding-test-" });
      const main = path.join(directory, "main.cjs");
      yield* fs.writeFileString(main, 'console.log("hello");');
      const calls: ReadonlyArray<string>[] = [];
      const spawner = ToolTest.layer((command) =>
        Effect.gen(function*() {
          if (command._tag !== "StandardCommand") return assert.fail("expected a native Node command");
          assert.strictEqual(command.command, "selected-node");
          calls.push(command.args);
          if (command.args[0] === "--version") return ToolTest.handle({ stdout: "v26.7.0\n" });
          if (command.args[0] === "--build-sea") {
            const configFile = command.args[1];
            assert.isDefined(configFile);

            const config = yield* fs.readFileString(configFile).pipe(Effect.flatMap(Schema.decodeEffect(Config)));
            assert.strictEqual(config.main, main);
            assert.strictEqual(config.executable, "base-node");
            assert.deepStrictEqual(config.assets, { data: path.join(directory, "data.txt") });
            yield* fs.writeFile(config.output, Uint8Array.of(0x7f, 0x45, 0x4c, 0x46, 1));
          }
          return ToolTest.handle();
        }).pipe(Effect.orDie)
      );
      const services = NodeSea.layer({ executable: "selected-node", baseExecutable: "base-node" }).pipe(
        Layer.provide(spawner),
        Layer.provide(NodeServices.layer),
      );
      const outfile = path.join(directory, "published");
      const output = yield* Effect.gen(function*() {
        const sea = yield* NodeSea;
        return yield* sea.assemble({ main, outfile, assets: { data: "data.txt" }, cwd: directory, atomic: true });
      }).pipe(Effect.provideContext(yield* Layer.build(services)));
      assert.strictEqual(output, outfile);
      assert.deepStrictEqual(yield* fs.readFile(outfile), Uint8Array.of(0x7f, 0x45, 0x4c, 0x46, 1));
      assert.deepStrictEqual(calls.map((args) => args[0]), ["--version", "--check", "--build-sea"]);
      assert.deepStrictEqual((yield* fs.readDirectory(directory)).sort((a, b) => a.localeCompare(b)), [
        "main.cjs",
        "published",
      ]);
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the test entry point.
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)));

  it.effect("failed source validation retains native diagnostics and leaves the destination unchanged", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "sea-failure-test-" });
      const outfile = path.join(directory, "published");
      yield* fs.writeFileString(outfile, "old");
      const spawner = ToolTest.layer((command) =>
        Effect.sync(() => {
          if (command._tag !== "StandardCommand") return assert.fail("expected a native Node command");
          return command.args[0] === "--version"
            ? ToolTest.handle({ stdout: "v26.7.0\n" })
            : ToolTest.handle({
              stderr: "SyntaxError: unexpected token",
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
            });
        })
      );
      const services = NodeSea.layer({ executable: "selected-node" }).pipe(
        Layer.provide(spawner),
        Layer.provide(NodeServices.layer),
      );
      const error = yield* Effect.gen(function*() {
        const sea = yield* NodeSea;
        return yield* sea.assemble({ main: "invalid.cjs", outfile, atomic: true }).pipe(Effect.flip);
      }).pipe(Effect.provideContext(yield* Layer.build(services)));
      assert.strictEqual(error._tag, "ToolError");
      if (error._tag !== "ToolError") return assert.fail("expected the native tool failure");
      assert.strictEqual(error.reason._tag, "Exit");
      assert.include(error.message, "SyntaxError");
      assert.strictEqual(yield* fs.readFileString(outfile), "old");
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the test entry point.
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)));
});
