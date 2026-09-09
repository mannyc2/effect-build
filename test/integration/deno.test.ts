import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Stream } from "effect";
import { Artifact, Target, Tool } from "effect-build";
import * as Deno from "effect-build-deno";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_DENO;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_DENO to the exact Deno executable under test");
const run = <A, E>(effect: Effect.Effect<A, E, Deno.Deno | NodeServices.NodeServices>, runtime?: string) =>
  Effect.runPromise(effect.pipe(
    Effect.provide(Deno.layer({ executable, ...(runtime === undefined ? {} : { runtime }) })),
    Effect.provide(NodeServices.layer),
  ));
const name = (base: string) => `${base}${process.platform === "win32" ? ".exe" : ""}`;
const options = { config: false, check: false, noRemote: true } as const;
let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-deno-")));
  await writeFile(join(root, "hello.ts"), "console.log('hello from Deno');\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real Deno 2.9.5", () => {
  it("compiles a native executable and keeps its final basename in import.meta.url", async () => {
    await writeFile(join(root, "hello.ts"), "console.log(JSON.stringify({ main: import.meta.main, url: import.meta.url }));\n");
    const artifact = await run(Deno.compile({
      entrypoint: "hello.ts", outfile: `bin/${name("chosen-name")}`, cwd: root, options,
    }));
    expect(artifact.path).toBe(join(root, "bin", name("chosen-name")));
    expect(artifact.target).toBe(Target.host());
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    const result: unknown = JSON.parse((await execute(artifact.path, [], { timeout: 30_000 })).stdout);
    expect(result).toMatchObject({ main: true, url: expect.stringContaining("/deno-compile-chosen-name") });
  }, 300_000);

  it("bundles and transpiles TypeScript into verified directories of executable JavaScript", async () => {
    await writeFile(join(root, "hello.ts"), "export const answer: number = 42; console.log(answer);\n");
    const artifacts = await run(Effect.all([
      Deno.bundle({ entrypoints: ["hello.ts"], outdir: "bundle", cwd: root, options }),
      Deno.transpile({ files: ["hello.ts"], outdir: "transpiled", cwd: root, options: { config: false, noRemote: true } }),
    ]));
    for (const artifact of artifacts) {
      expect(await run(Artifact.verify(artifact))).toEqual(artifact);
      const entry = artifact.entries.find((entry) => entry.kind === "file" && entry.path.endsWith("hello.js"));
      expect(entry).toBeDefined();
      if (entry === undefined) throw new Error("Deno did not produce hello.js");
      const output = join(artifact.path, entry.path);
      expect(await readFile(output, "utf8")).not.toContain(": number");
      expect((await execute(executable, ["run", "--no-config", output], { timeout: 30_000 })).stdout.trim()).toBe("42");
    }
  }, 120_000);

  it("preserves existing output and removes staging files when compilation fails", async () => {
    const outfile = join(root, name("existing"));
    await writeFile(outfile, "previous output");
    await writeFile(join(root, "hello.ts"), "const = ;\n");
    const failure = await run(Deno.compile({ entrypoint: "hello.ts", outfile, cwd: root, options }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous output");
    expect((await readdir(root)).sort()).toEqual([name("existing"), "hello.ts"].sort());
  }, 30_000);

  it("requires the lowercase .exe suffix for Windows output paths", async () => {
    for (const outfile of ["bare", "UPPER.EXE"]) {
      const failure = await run(Deno.compile({
        entrypoint: "hello.ts", outfile, target: "windows-x64", cwd: root, options,
      }).pipe(Effect.flip));
      expect(failure).toBeInstanceOf(Deno.InputInvalid);
    }
    expect(await readdir(root)).toEqual(["hello.ts"]);
  });

  it.skipIf(process.platform === "win32")("hashes an explicit runtime without executing it during layer acquisition", async () => {
    const marker = join(root, "was-executed");
    const runtime = join(root, "denort");
    const script = `#!/bin/sh\nprintf 'executed' > '${marker.replaceAll("'", "'\\''")}'\nexit 89\n`;
    await writeFile(runtime, script, { mode: 0o755 });
    const service = await run(Deno.Deno, runtime);
    expect(service.runtime?.sha256).toBe(createHash("sha256").update(script).digest("hex"));
    expect(await readdir(root)).not.toContain("was-executed");
  });

  it("compiles with an explicit denort and records the runtime's actual bytes", async () => {
    await run(Deno.compile({ entrypoint: "hello.ts", outfile: name("download-runtime"), cwd: root, options }));
    const info: unknown = JSON.parse((await execute(executable, ["info", "--json"])).stdout);
    if (typeof info !== "object" || info === null || !("denoDir" in info) || typeof info.denoDir !== "string") {
      throw new Error("Deno info did not report its cache directory");
    }
    const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
    const platform = process.platform === "darwin" ? "apple-darwin" : process.platform === "win32" ? "pc-windows-msvc" : "unknown-linux-gnu";
    const zip = join(info.denoDir, "dl/release/v2.9.5", `denort-${architecture}-${platform}.zip`);
    const directory = join(root, "runtime");
    await mkdir(directory);
    if (process.platform === "win32") await execute("tar", ["-xf", zip, "-C", directory]);
    else await execute("unzip", ["-q", zip, "-d", directory]);
    const runtime = join(directory, name("denort"));
    await chmod(runtime, 0o755);
    const target = `${architecture}-${platform}` as const;
    const artifact = await run(Deno.compile({ entrypoint: "hello.ts", outfile: name("explicit-runtime"), target, cwd: root, options }), runtime);
    expect(artifact.runtime?.sha256).toBe(createHash("sha256").update(await readFile(runtime)).digest("hex"));
    expect(await realpath(artifact.runtime!.path)).toBe(await realpath(runtime));
    expect((await execute(artifact.path, [], { timeout: 30_000 })).stdout.trim()).toBe("hello from Deno");
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
  }, 300_000);

  it("recompiles changed files and stops watching when its scope closes", async () => {
    const process = await run(Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const watcher = yield* Deno.watch({
        entrypoint: "hello.ts", outfile: name("watched"), cwd: root, options, noClearScreen: true, stdio: "pipe",
      });
      const diagnostics: string[] = [];
      yield* Effect.forkScoped(Stream.runDrain(watcher.process.stdout));
      yield* Effect.forkScoped(Stream.runForEach(watcher.process.stderr, (chunk) => Effect.sync(() => {
        diagnostics.push(new TextDecoder().decode(chunk));
      })));
      const waitFor = (expected: string) => Effect.gen(function*() {
        for (let attempt = 0; attempt < 300; attempt++) {
          const result = yield* Effect.tryPromise(() => execute(watcher.outfile, [], { timeout: 5000 })).pipe(
            Effect.map((result) => result.stdout.trim()), Effect.orElseSucceed(() => ""),
          );
          if (result === expected) return;
          yield* Effect.sleep("100 millis");
        }
        return yield* Effect.fail(new Error(`Deno watch did not compile ${expected}\n${diagnostics.join("")}`));
      });
      yield* waitFor("hello from Deno");
      for (let attempt = 0; !diagnostics.join("").includes("Restarting on file change"); attempt++) {
        if (attempt === 300) return yield* Effect.fail(new Error("Deno watcher did not become ready"));
        yield* Effect.sleep("100 millis");
      }
      yield* fs.writeFileString(join(root, "hello.ts"), "console.log('changed');\n");
      yield* waitFor("changed");
      expect(yield* watcher.process.isRunning).toBe(true);
      return watcher.process;
    })));
    expect(await run(process.isRunning)).toBe(false);
  }, 120_000);
});
