import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";
import { Tool } from "effect-build";
import { TestArtifact, TestSpawner } from "effect-build/testing";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as NodeSea from "effect-build-node-sea";
import { describe, expect, it } from "vitest";

const tool = (name: string, version: string): Tool.Resolved => ({ name, version, path: "/not-a-tool", bytes: 0 });
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) => Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

describe("version policy and operation capabilities", () => {
  it("rejects a different Node SEA base version as an operation version failure", () => run(Effect.scoped(Effect.gen(function*() {
    const builder = yield* TestArtifact.file("builder");
    const base = yield* TestArtifact.file("base");
    const basePath = yield* FileSystem.FileSystem.use((fs) => fs.realPath(base.path));
    const failure = yield* NodeSea.resolved.pipe(
      Effect.provide(NodeSea.layer({ executable: builder.path, baseExecutable: base.path })),
      Effect.provide(TestSpawner.layer((call) => Effect.succeed({ stdout: call.command === basePath ? "v23.0.0\n" : "v22.0.0\n" }))),
      Effect.flip,
    );
    expect(failure).toMatchObject({ _tag: "ToolVersionUnsupported", operation: "NodeSea.layer", version: "22.0.0", supported: "23.0.0" });
  }))));

  it("records Deno's runtime bytes without executing the runtime", () => run(Effect.scoped(Effect.gen(function*() {
    const binary = yield* TestArtifact.file("deno");
    const runtime = yield* TestArtifact.file("target denort bytes");
    const calls: string[] = [];
    const service = yield* Deno.Deno.pipe(
      Effect.provide(Deno.layer({ executable: binary.path, runtime: runtime.path })),
      Effect.provide(TestSpawner.layer((call) => Effect.sync(() => { calls.push(call.command); return { stdout: "deno 2.9.5\n" }; }))),
    );
    expect(calls).toEqual([service.tool.path]);
    expect(service.runtime).toMatchObject({ path: runtime.path, bytes: runtime.bytes, kind: "file" });
    expect(service.runtime).not.toHaveProperty("sha256");
  }))));

  it("accepts unreviewed compatible Bun versions and rejects only the defective build operation", async () => {
    const unreviewed = tool("bun", "1.4.0");
    expect(await Effect.runPromise(Effect.succeed(unreviewed).pipe(Tool.requireVersion(Bun.supported)))).toBe(unreviewed);
    const defective = tool("bun", "1.4.1");
    expect(await Effect.runPromise(Effect.succeed(defective).pipe(Tool.requireVersion(Bun.supported)))).toBe(defective);
    const input = { entrypoints: ["input.ts"] as const, outfile: "output.exe", outdir: "output" };
    const builds: readonly [string, Effect.Effect<unknown, Bun.CompileError, NodeServices.NodeServices | Bun.Bun>][] = [
      ["Bun.build", Bun.build(input)],
      ["Bun.compile", Bun.compile(input)],
      ["Bun.bundle", Bun.bundle(input)],
      ["Bun.watch", Effect.scoped(Bun.watch(input))],
    ];
    for (const [operation, effect] of builds) {
      const failure = await run(effect.pipe(Effect.provideService(Bun.Bun, { tool: defective }), Effect.flip));
      expect(failure).toMatchObject({ _tag: "ToolVersionUnsupported", operation, reason: expect.stringContaining("variable-collision") });
    }
  });

  it("accepts Deno2.9.6 and reports removed flags at the operations using them", async () => {
    const resolved = tool("deno", "2.9.6");
    expect(await Effect.runPromise(Effect.succeed(resolved).pipe(Tool.requireVersion(Deno.supported)))).toBe(resolved);
    const compile = await run(Deno.compile({ entrypoint: "input.ts", outfile: "output.exe", options: { allowScripts: true } }).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(compile).toMatchObject({ _tag: "ToolVersionUnsupported", operation: "Deno.compile", reason: expect.stringContaining("--allow-scripts") });
    const watch = await run(Effect.scoped(Deno.watch({ entrypoint: "input.ts", outfile: "output.exe", options: { allowScripts: true } })).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(watch).toMatchObject({ _tag: "ToolVersionUnsupported", operation: "Deno.watch", reason: expect.stringContaining("--allow-scripts") });
    const transpile = await run(Deno.transpile({ files: ["input.ts"], outdir: "output", options: { conditions: ["custom"] } }).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(transpile).toMatchObject({ _tag: "ToolVersionUnsupported", operation: "Deno.transpile", reason: expect.stringContaining("--conditions") });
  });
});
