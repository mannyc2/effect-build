import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import type { Artifact, Commit } from "effect-build";
import * as Bun from "effect-build-bun";
import * as Esbuild from "effect-build-esbuild";
import * as Rolldown from "effect-build-rolldown";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const bunLayer = Bun.layer({ executable: process.env.EFFECT_BUILD_BUN });
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices | Bun.Bun>) =>
  Effect.runPromise(effect.pipe(Effect.provide(bunLayer), Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-paths-")));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(root, "src/dep.js"), "export const answer = 42;\n");
  await writeFile(join(root, "src/main.ts"), 'import { answer } from "./dep.js"; console.log(answer);\n');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("committed bundle paths", () => {
  it("keeps esbuild relative external imports executable after staging moves", async () => {
    const artifact = await run(Esbuild.buildToDirectory({ absWorkingDir: root, entryPoints: ["src/main.ts"], outdir: "dist",
      bundle: true, format: "esm", external: ["./src/dep.js"] }));
    const contents = await readFile(join(artifact.path, "main.js"), "utf8");
    expect(contents).toContain("../src/dep.js");
    expect((await execute(process.execPath, [join(artifact.path, "main.js")])).stdout.trim()).toBe("42");
  });

  it.each(["bun", "esbuild", "rolldown"])("resolves every %s source-map source from the final output", async (compiler) => {
    const outdir = "nested/dist";
    const artifact = compiler === "bun"
      ? await run(Bun.bundle({ cwd: root, entrypoints: ["src/main.ts"], outdir, options: { sourcemap: "external" } }))
      : compiler === "esbuild"
      ? await run(Esbuild.buildToDirectory({ absWorkingDir: root, entryPoints: ["src/main.ts"], outdir, bundle: true, sourcemap: "external", sourcesContent: false }))
      : await run(Rolldown.buildToDirectory({ cwd: root, input: "src/main.ts", outdir, output: { sourcemap: true, sourcemapExcludeSources: true } }));
    const maps = (await readdir(artifact.path)).filter((name) => name.endsWith(".map"));
    expect(maps.length).toBeGreaterThan(0);
    for (const name of maps) {
      const path = join(artifact.path, name);
      const map = JSON.parse(await readFile(path, "utf8")) as { sources: string[]; sourceRoot?: string };
      expect(map.sources.length).toBeGreaterThan(0);
      for (const source of map.sources) {
        const location = resolve(dirname(path), map.sourceRoot ?? "", source);
        expect(await readFile(location, "utf8")).toMatch(/answer/);
      }
    }
  });
});

describe("forwarded commit options", () => {
  it.each(["bun", "esbuild", "rolldown"])("passes commit options through %s without reaching the native options", async (compiler) => {
    const build = (options: Commit.ProducerOptions): Effect.Effect<Artifact.Directory, unknown, NodeServices.NodeServices | Bun.Bun> => compiler === "bun"
      ? Bun.bundle({ cwd: root, entrypoints: ["src/main.ts"], outdir: "dist", ...options })
      : compiler === "esbuild"
      ? Esbuild.buildToDirectory({ absWorkingDir: root, entryPoints: ["src/main.ts"], outdir: "dist", bundle: true, ...options })
      : Rolldown.buildToDirectory({ cwd: root, input: "src/main.ts", outdir: "dist", ...options });
    const artifact = await run(build({ prefix: ".staged-" }));
    expect(artifact.path).toBe(join(root, "dist"));
    // Directories have no exclusive rename, so a forwarded onExists surfaces as the core's refusal.
    expect(await run(Effect.flip(build({ onExists: "fail" })))).toMatchObject({ _tag: "CommitError", reason: "directory-no-replace-unsupported" });
    expect((await readdir(root)).sort()).toEqual(["dist", "package.json", "src"]);
  });
});
