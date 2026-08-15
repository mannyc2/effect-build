import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Fiber, Latch } from "effect";
import type * as Core from "effect-build";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as Esbuild from "../../packages/effect-build-esbuild/src/index.js";
import * as NodeSea from "../../packages/effect-build-node-sea/src/index.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/esbuild/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-public-pipeline-"));
  roots.push(root);
  return root;
};

const nodeStage: NodeSea.NodeSeaStage = {
  operation: "assemble-node-sea",
  tool: { name: "node", version: "26.7.0", path: "/tools/node-26.7.0" },
};

const successfulNodeService = (
  observe: (main: Core.JavaScriptBundle.Artifact) => void = () => undefined,
): NodeSea.Service => ({
  createExecutable: <const MainStages extends readonly Core.Artifact.StageObservation[]>(
    input: NodeSea.CreateExecutableInput<MainStages>,
  ) =>
    Effect.sync(() => {
      observe(input.main);
      expect(existsSync(input.main.path)).toBe(true);
      return Object.freeze({
        path: input.outfile as Core.Artifact.AbsolutePath,
        bytes: 1 as Core.Artifact.ByteCount,
        provider: "node-sea" as const,
        target: "linux-x64-gnu" as const,
        stages: Object.freeze([...input.main.stages, nodeStage]) as readonly [...MainStages, NodeSea.NodeSeaStage],
      });
    }),
});

const pipeline = (
  service: NodeSea.Service,
  input: {
    readonly entrypoint: string;
    readonly format: "esm" | "cjs";
    readonly outfile: string;
  },
) =>
  Esbuild.withJavaScriptBundle(
    { entrypoint: input.entrypoint, format: input.format, cwd: fixtureRoot },
    (main) => NodeSea.createExecutable({ main, outfile: input.outfile }),
  ).pipe(
    Effect.provideService(NodeSea.NodeSea, service),
    Effect.provide(Esbuild.layer),
    Effect.provide(NodeServices.layer),
  );

describe("public Esbuild to Node SEA composition", () => {
  it.each(
    [
      ["esm", "valid.ts"],
      ["cjs", "valid.cjs"],
    ] as const,
  )("preserves the exact %s bundle format and ordered stage tuple", async (format, entrypoint) => {
    let bundlePath = "";
    let observedFormat = "";
    const artifact = await Effect.runPromise(pipeline(
      successfulNodeService((main) => {
        bundlePath = main.path;
        observedFormat = main.format;
      }),
      { entrypoint, format, outfile: join(makeRoot(), "app") },
    ));

    expect(observedFormat).toBe(format);
    expect(artifact.stages).toEqual([
      { operation: "bundle", tool: { name: "esbuild", version: "0.28.2" } },
      nodeStage,
    ]);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it("does not invoke Node SEA when Esbuild rejects the entrypoint", async () => {
    let calls = 0;
    const exit = await Effect.runPromise(Effect.exit(pipeline(
      successfulNodeService(() => calls += 1),
      { entrypoint: "missing.js", format: "esm", outfile: join(makeRoot(), "app") },
    )));
    expect(Exit.isFailure(exit) && Exit.hasFails(exit)).toBe(true);
    expect(calls).toBe(0);
  });

  it("closes the Esbuild bundle when Node SEA returns a typed input failure", async () => {
    let bundlePath = "";
    const service: NodeSea.Service = {
      createExecutable: (input) =>
        Effect.sync(() => {
          bundlePath = input.main.path;
          expect(existsSync(bundlePath)).toBe(true);
        }).pipe(
          Effect.andThen(Effect.fail(new NodeSea.InvalidNodeSeaInput({ reason: "invalid-outfile" }))),
        ),
    };
    const exit = await Effect.runPromise(Effect.exit(pipeline(service, {
      entrypoint: "valid.ts",
      format: "esm",
      outfile: join(makeRoot(), "app"),
    })));
    expect(Exit.isFailure(exit) && Exit.hasFails(exit)).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it("interrupts Node SEA without leaking the scoped Esbuild bundle", async () => {
    const started = Latch.makeUnsafe();
    let bundlePath = "";
    let interrupted = false;
    const service: NodeSea.Service = {
      createExecutable: (input) =>
        Effect.sync(() => {
          bundlePath = input.main.path;
        }).pipe(
          Effect.andThen(started.open),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Effect.sync(() => interrupted = true)),
        ),
    };
    const fiber = Effect.runFork(pipeline(service, {
      entrypoint: "valid.ts",
      format: "esm",
      outfile: join(makeRoot(), "app"),
    }));
    await Effect.runPromise(started.await);
    expect(existsSync(bundlePath)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(Exit.hasInterrupts(await Effect.runPromise(Fiber.await(fiber)))).toBe(true);
    expect(interrupted).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
  });
});
