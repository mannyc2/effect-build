import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Deno } from "effect-build-deno";
import { ToolTest } from "effect-build/testing";

it.effect("Deno preserves native target, script ordering and Windows basename", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(Path.layer)));
    const commands: Array<ReadonlyArray<string>> = [];
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        assert.strictEqual(command._tag, "StandardCommand");
        if (command._tag === "StandardCommand") {
          commands.push(command.args);
          assert.deepStrictEqual(command.options.env, { DENO_DIR: "/cache", DENORT_BIN: "/runtime/denort" });
          assert.isFalse(command.options.extendEnv);
        }
        return ToolTest.handle();
      })
    );
    const deno = yield* Deno.make({ executable: "deno", runtime: "/runtime/denort" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const outfile = yield* deno.compile({
      entrypoint: "main.ts",
      outfile: "named-app",
      target: "x86_64-pc-windows-msvc",
      config: false,
      allowAll: true,
      extraArgs: ["--no-check"],
      scriptArgs: ["--literal"],
      env: { DENO_DIR: "/cache" },
      extendEnv: false,
    });
    assert.strictEqual(outfile, path.resolve("named-app.exe"));
    assert.deepStrictEqual(commands, [[
      "compile",
      "--no-check",
      "--no-config",
      "--allow-all",
      "--target",
      "x86_64-pc-windows-msvc",
      "--output",
      outfile,
      "main.ts",
      "--literal",
    ]]);
  }));

it.effect("Deno bundle uses its command and leaves tool options native", () =>
  Effect.gen(function*() {
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        assert.strictEqual(command._tag, "StandardCommand");
        if (command._tag === "StandardCommand") {
          assert.deepStrictEqual(command.args.slice(0, 9), [
            "bundle",
            "--config",
            "deno.json",
            "--platform",
            "browser",
            "--format",
            "esm",
            "--minify",
            "--outdir",
          ]);
          assert.deepStrictEqual(command.args.slice(-1), ["main.ts"]);
        }
        return ToolTest.handle();
      })
    );
    const deno = yield* Deno.make({ executable: "deno" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const outdir = yield* deno.bundle({
      entrypoints: ["main.ts"],
      outdir: "dist",
      platform: "browser",
      format: "esm",
      minify: true,
      config: "deno.json",
    });
    assert.isTrue(outdir.endsWith("dist"));
  }));
