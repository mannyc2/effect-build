import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Stream } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Bun from "effect-build-bun";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const bunLayer = Bun.layer({ executable: process.env.EFFECT_BUILD_BUN });
const run = <A, E>(effect: Effect.Effect<A, E, Bun.Bun | NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(bunLayer), Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-"));
  await writeFile(join(root, "hello.ts"), "console.log('hello');\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("Bun CLI", () => {
  it("builds a stdout bundle with defines and minification", async () => {
    await writeFile(join(root, "hello.ts"), "console.log(MESSAGE);\n");
    const output = await run(Bun.build({
      entrypoints: ["hello.ts"], cwd: root,
      options: { define: { MESSAGE: "42" }, minify: { syntax: true, whitespace: true, identifiers: true } },
    }));
    expect(new TextDecoder().decode(output)).toContain("console.log(42)");
    expect(await readdir(root)).toEqual(["hello.ts"]);
  });

  it("returns a complete bundle larger than the diagnostic limit", async () => {
    const diagnosticLimit = 8 * 1024 * 1024; // Tool.run's default retained bytes per stream
    const length = diagnosticLimit + 1024 * 1024;
    await writeFile(join(root, "large.ts"), `const value = "${"x".repeat(length)}"; console.log(value.length);\n`);
    const output = await run(Bun.build({ entrypoints: ["large.ts"], cwd: root }));
    expect(output.byteLength).toBeGreaterThan(length);
    const outfile = join(root, "large.js");
    await writeFile(outfile, output);
    expect((await execute(process.execPath, [outfile])).stdout.trim()).toBe(String(length));
  }, 30_000);

  it("bundles a real directory relative to cwd and verifies its files", async () => {
    const artifact = await run(Bun.bundle({ entrypoints: ["hello.ts"], outdir: "nested/bundle", cwd: root }));
    expect(artifact.path).toBe(join(root, "nested/bundle"));
    expect(artifact.entries.map((entry) => entry.path)).toContain("hello.js");
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    expect((await execute(process.execPath, [join(artifact.path, "hello.js")])).stdout.trim()).toBe("hello");
  });

  it("compiles a native executable at a path relative to cwd", async () => {
    const outfile = process.platform === "win32" ? "bin/hello.exe" : "bin/hello";
    const artifact = await run(Bun.compile({
      entrypoints: ["hello.ts"], outfile, cwd: root,
      options: { minify: true, autoloadDotenv: false, autoloadBunfig: false },
    }));
    expect(artifact.path).toBe(join(root, outfile));
    expect((await execute(artifact.path)).stdout.trim()).toBe("hello");
  }, 30_000);

  it("keeps the old output when a bundle fails and removes its staging directory", async () => {
    await run(Bun.bundle({ entrypoints: ["hello.ts"], outdir: "bundle", cwd: root }));
    const previous = await readFile(join(root, "bundle/hello.js"), "utf8");
    await writeFile(join(root, "hello.ts"), "const = ;\n");
    const failure = await run(Bun.bundle({ entrypoints: ["hello.ts"], outdir: "bundle", cwd: root }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(await readFile(join(root, "bundle/hello.js"), "utf8")).toBe(previous);
    expect((await readdir(root)).sort()).toEqual(["bundle", "hello.ts"]);
  });

  it("rejects an empty entrypoint and a Windows output without .exe", async () => {
    const invalid = [
      Bun.compile({ entrypoints: [""], outfile: "hello", cwd: root }),
      Bun.compile({ entrypoints: ["hello.ts"], target: "windows-x64", outfile: "hello", cwd: root }),
      Bun.compile({ entrypoints: ["hello.ts"], target: "windows-x64", outfile: "HELLO.EXE", cwd: root }),
    ];
    for (const effect of invalid) {
      const failure = await run(effect.pipe(Effect.flip));
      expect(failure).toBeInstanceOf(Tool.InputInvalid);
      expect(String(failure)).toMatch(/^InputInvalid: Bun\.compile: \S/u);
    }
    expect(await readdir(root)).toEqual(["hello.ts"]);
  });

  it("rebuilds changed files and stops watching when its scope closes", async () => {
    const watched = await run(Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const watcher = yield* Bun.watch({ entrypoints: ["hello.ts"], outdir: "watch", cwd: root, noClearScreen: true });
      yield* Effect.forkScoped(Stream.runDrain(watcher.process.stdout));
      yield* Effect.forkScoped(Stream.runDrain(watcher.process.stderr));
      const output = join(watcher.outdir, "hello.js");
      const waitFor = (text: string) => Effect.gen(function*() {
        for (let attempt = 0; attempt < 100; attempt++) {
          const content = yield* fs.readFileString(output).pipe(Effect.orElseSucceed(() => ""));
          if (content.includes(text)) return;
          yield* Effect.sleep("50 millis");
        }
        return yield* Effect.fail(new Error(`watch did not write ${text}`));
      });
      yield* waitFor("hello");
      yield* fs.writeFileString(join(root, "hello.ts"), "console.log('changed');\n");
      yield* waitFor("changed");
      expect(yield* watcher.process.isRunning).toBe(true);
      return watcher.process;
    })));
    expect(await run(watched.isRunning)).toBe(false);
  }, 15_000);
});
