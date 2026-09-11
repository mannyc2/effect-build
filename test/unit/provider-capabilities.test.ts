import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Tool } from "effect-build";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import { describe, expect, it } from "vitest";

const tool = (name: string, version: string): Tool.Resolved => ({ name, version, path: "/not-a-tool", bytes: 0, sha256: "0".repeat(64) });
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) => Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

describe("version policy and operation capabilities", () => {
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
      expect(failure).toMatchObject({ _tag: "InputInvalid", operation, reason: expect.stringContaining("variable-collision") });
    }
  });

  it("accepts Deno2.9.6 and reports removed flags at the operations using them", async () => {
    const resolved = tool("deno", "2.9.6");
    expect(await Effect.runPromise(Effect.succeed(resolved).pipe(Tool.requireVersion(Deno.supported)))).toBe(resolved);
    const compile = await run(Deno.compile({ entrypoint: "input.ts", outfile: "output.exe", options: { allowScripts: true } }).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(compile).toMatchObject({ _tag: "InputInvalid", operation: "Deno.compile", reason: expect.stringContaining("--allow-scripts") });
    const watch = await run(Effect.scoped(Deno.watch({ entrypoint: "input.ts", outfile: "output.exe", options: { allowScripts: true } })).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(watch).toMatchObject({ _tag: "InputInvalid", operation: "Deno.watch", reason: expect.stringContaining("--allow-scripts") });
    const transpile = await run(Deno.transpile({ files: ["input.ts"], outdir: "output", options: { conditions: ["custom"] } }).pipe(
      Effect.provideService(Deno.Deno, { tool: resolved }), Effect.flip,
    ));
    expect(transpile).toMatchObject({ _tag: "InputInvalid", operation: "Deno.transpile", reason: expect.stringContaining("--conditions") });
  });
});
