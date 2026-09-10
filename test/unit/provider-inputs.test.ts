import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as Nfpm from "effect-build-nfpm";
import * as NodeSea from "effect-build-node-sea";
import * as Python from "effect-build-python";
import * as Rolldown from "effect-build-rolldown";
import * as Sbom from "effect-build-sbom";
import * as Windows from "effect-build-windows";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const tool = (name: string, version: string): Tool.Resolved => ({
  name,
  version,
  path: "/not-a-tool",
  bytes: 0,
  sha256: "0".repeat(64),
});
type Env = NodeServices.NodeServices | Bun.Bun | Deno.Deno | NodeSea.NodeSea;
const run = <A, E>(effect: Effect.Effect<A, E, Env>) =>
  Effect.runPromise(effect.pipe(
    Effect.provideService(Bun.Bun, { tool: tool("bun", "1.3.14") }),
    Effect.provideService(Deno.Deno, { tool: tool("deno", "2.9.5") }),
    Effect.provideService(NodeSea.NodeSea, { builder: tool("node", "22.0.0"), base: tool("node", "22.0.0") }),
    Effect.provide(NodeServices.layer),
  ));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-inputs-"));
  await writeFile(join(root, "keep.txt"), "original output\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("provider input errors", () => {
  it.each([
    ["Apple", new Apple.InputInvalid({ reason: "outfile is empty" })],
    ["Archive", new Archive.InputInvalid({ reason: "outfile is empty" })],
    ["Bun", new Bun.InputInvalid({ reason: "outfile is empty" })],
    ["Deno", new Deno.InputInvalid({ reason: "outfile is empty" })],
    ["Esbuild", new Esbuild.InputInvalid({ reason: "outfile is empty" })],
    ["Nfpm", new Nfpm.InputInvalid({ reason: "outfile is empty" })],
    ["NodeSea", new NodeSea.InputInvalid({ reason: "outfile is empty" })],
    ["Python", new Python.InputInvalid({ reason: "outfile is empty" })],
    ["Rolldown", new Rolldown.InputInvalid({ reason: "outfile is empty" })],
    ["Sbom", new Sbom.InputInvalid({ reason: "outfile is empty" })],
    ["Windows", new Windows.InputInvalid({ reason: "outfile is empty" })],
  ])("%s prints an unhandled InputInvalid as its tag and reason", (name, failure) => {
    expect(failure._tag).toBe(`${name}InputInvalid`);
    expect(String(failure)).toBe(`${name}InputInvalid: outfile is empty`);
  });
});

describe("provider input preparation", () => {
  it.each(["compile", "watch"] as const)(
    "rejects a raw empty Deno %s outfile before it can resolve to cwd",
    async (operation) => {
      const input = { entrypoint: "input.ts", outfile: "", cwd: root };
      const effect: Effect.Effect<unknown, Deno.CompileError, Env> = operation === "compile"
        ? Deno.compile(input)
        : Effect.scoped(Deno.watch(input));
      const failure = await run(effect.pipe(Effect.flip));
      expect(failure).toMatchObject({
        _tag: "DenoInputInvalid",
        operation,
        reason: expect.stringContaining("outfile"),
      });
      expect(await readdir(root)).toEqual(["keep.txt"]);
      expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("original output\n");
    },
  );

  it.each(["compile", "watch"] as const)(
    "keeps the lowercase .exe requirement in Deno %s preparation",
    async (operation) => {
      const input = { entrypoint: "input.ts", outfile: "OUTPUT.EXE", target: "windows-x64" as const, cwd: root };
      const effect: Effect.Effect<unknown, Deno.CompileError, Env> = operation === "compile"
        ? Deno.compile(input)
        : Effect.scoped(Deno.watch(input));
      const failure = await run(effect.pipe(Effect.flip));
      expect(failure).toMatchObject({
        _tag: "DenoInputInvalid",
        operation,
        reason: "Windows outfile must end in .exe",
      });
      expect(await readdir(root)).toEqual(["keep.txt"]);
    },
  );

  it.each(["build", "compile", "bundle", "watch"] as const)(
    "rejects NUL in Bun %s cwd before launching",
    async (operation) => {
      const input = { entrypoints: ["input.ts"] as const, outfile: "output.exe", outdir: "output", cwd: `${root}\0` };
      const effect: Effect.Effect<unknown, Bun.CompileError, Env> = operation === "build"
        ? Bun.build(input)
        : operation === "compile"
        ? Bun.compile(input)
        : operation === "bundle"
        ? Bun.bundle(input)
        : Effect.scoped(Bun.watch(input));
      const failure = await run(effect.pipe(Effect.flip));
      expect(failure).toMatchObject({ _tag: "BunInputInvalid", reason: "cwd must contain no NUL" });
      expect(await readdir(root)).toEqual(["keep.txt"]);
    },
  );

  it.each(["compile", "bundle", "transpile", "watch"] as const)(
    "rejects NUL in Deno %s cwd before launching",
    async (operation) => {
      const input = {
        entrypoint: "input.ts",
        entrypoints: ["input.ts"],
        files: ["input.ts"],
        outfile: "output.exe",
        outdir: "output",
        cwd: `${root}\0`,
      };
      const effect: Effect.Effect<unknown, Deno.CompileError, Env> = operation === "compile"
        ? Deno.compile(input)
        : operation === "bundle"
        ? Deno.bundle(input)
        : operation === "transpile"
        ? Deno.transpile(input)
        : Effect.scoped(Deno.watch(input));
      const failure = await run(effect.pipe(Effect.flip));
      expect(failure).toMatchObject({ _tag: "DenoInputInvalid", operation, reason: "cwd must contain no NUL" });
      expect(await readdir(root)).toEqual(["keep.txt"]);
    },
  );

  it("rejects NUL in Node SEA cwd before inspecting the base or preparing inputs", async () => {
    const main = await run(Artifact.file(join(root, "keep.txt"), { name: "fixture", version: "1" }));
    const failure = await run(NodeSea.assemble({ main, outfile: "output.exe", cwd: `${root}\0` }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "NodeSeaInputInvalid", reason: "cwd must contain no NUL" });
    expect(await readdir(root)).toEqual(["keep.txt"]);
  });

  it("preserves empty cwd as a current-directory invocation", async () => {
    const bun = await run(Bun.build({ entrypoints: ["input.ts"], cwd: "" }).pipe(Effect.flip));
    const deno = await run(
      Effect.scoped(Deno.watch({ entrypoint: "input.ts", outfile: "output.exe", cwd: "" })).pipe(Effect.flip),
    );
    // The deliberately absent tool establishes that preparation reached launch.
    expect(bun).toBeInstanceOf(Tool.SpawnFailed);
    expect(deno).toBeInstanceOf(Tool.SpawnFailed);
    expect(await readdir(root)).toEqual(["keep.txt"]);
  });
});
