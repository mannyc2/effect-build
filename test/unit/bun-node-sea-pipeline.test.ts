import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Fiber, Latch } from "effect";
import type * as Core from "effect-build";
import type * as Provider from "effect-build/Provider";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Options, Stages, targetEntries } from "../../packages/effect-build-bun/src/Adapter.js";
import { makeService as makeBunService } from "../../packages/effect-build-bun/src/Bundle.js";
import * as Bun from "../../packages/effect-build-bun/src/index.js";
import * as NodeSea from "../../packages/effect-build-node-sea/src/index.js";

type Target = (typeof targetEntries)[number][0];
type ExecutableStages = typeof Stages.Type;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-bun-node-pipeline-"));
  roots.push(root);
  return root;
};

const bunService = () => {
  const context = {
    compileExecutable: () => Effect.die("unused compileExecutable"),
    compileExecutableMatrix: () => Effect.die("unused compileExecutableMatrix"),
    command: {
      tool: { name: "bun", version: "1.3.9", path: "/tools/bun-1.3.9" },
      execute: (argv: readonly string[]) =>
        Effect.sync(() => {
          const outfile = argv.find((value) => value.startsWith("--outfile="))!.slice("--outfile=".length);
          const metafile = argv.find((value) => value.startsWith("--metafile="))!.slice("--metafile=".length);
          const entrypoint = argv.at(-1)!;
          mkdirSync(dirname(outfile), { recursive: true });
          writeFileSync(outfile, "console.log('bun pipeline')\n");
          writeFileSync(
            metafile,
            JSON.stringify({
              inputs: {
                [entrypoint]: { imports: [{ path: "node:fs", kind: "import-statement", external: true }] },
              },
              outputs: {
                [outfile.endsWith(".mjs") ? "./main.mjs" : "./main.cjs"]: {
                  entryPoint: entrypoint,
                  imports: [],
                },
              },
            }),
          );
          return {
            exitCode: 0,
            stdout: { text: "", truncated: false },
            stderr: { text: "", truncated: false },
          };
        }),
    },
  } as Provider.CommandServiceContext<"bun", Options, Target, ExecutableStages>;
  return makeBunService(context);
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
  input: { readonly entrypoint: string; readonly format: "esm" | "cjs"; readonly outfile: string },
) =>
  Bun.withJavaScriptBundle(
    { entrypoint: input.entrypoint, format: input.format },
    (main) => NodeSea.createExecutable({ main, outfile: input.outfile }),
  ).pipe(
    Effect.provideService(NodeSea.NodeSea, service),
    Effect.provideService(Bun.Compiler, bunService()),
    Effect.provide(NodeServices.layer),
  );

describe("public Bun to Node SEA composition", () => {
  it.each(["esm", "cjs"] as const)("preserves the exact %s format and ordered stage tuple", async (format) => {
    const root = makeRoot();
    const entrypoint = join(root, format === "esm" ? "entry.ts" : "entry.cjs");
    writeFileSync(entrypoint, "console.log('entry')\n");
    let bundlePath = "";
    const artifact = await Effect.runPromise(pipeline(
      successfulNodeService((main) => bundlePath = main.path),
      { entrypoint, format, outfile: join(root, "app") },
    ));
    expect(artifact.stages).toEqual([
      {
        operation: "bundle-javascript",
        tool: { name: "bun", version: "1.3.9", path: "/tools/bun-1.3.9" },
      },
      nodeStage,
    ]);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it("closes the Bun root when Node SEA returns a typed failure", async () => {
    const root = makeRoot();
    const entrypoint = join(root, "entry.ts");
    writeFileSync(entrypoint, "console.log('entry')\n");
    let bundlePath = "";
    const service: NodeSea.Service = {
      createExecutable: (input) =>
        Effect.sync(() => bundlePath = input.main.path).pipe(
          Effect.andThen(Effect.fail(new NodeSea.InvalidNodeSeaInput({ reason: "invalid-outfile" }))),
        ),
    };
    const exit = await Effect.runPromise(Effect.exit(pipeline(service, {
      entrypoint,
      format: "esm",
      outfile: join(root, "app"),
    })));
    expect(Exit.isFailure(exit) && Exit.hasFails(exit)).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it("preserves Node SEA interruption and closes the Bun root", async () => {
    const root = makeRoot();
    const entrypoint = join(root, "entry.ts");
    writeFileSync(entrypoint, "console.log('entry')\n");
    const started = Latch.makeUnsafe();
    let bundlePath = "";
    let interrupted = false;
    const service: NodeSea.Service = {
      createExecutable: (input) =>
        Effect.sync(() => bundlePath = input.main.path).pipe(
          Effect.andThen(started.open),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Effect.sync(() => interrupted = true)),
        ),
    };
    const fiber = Effect.runFork(pipeline(service, {
      entrypoint,
      format: "esm",
      outfile: join(root, "app"),
    }));
    await Effect.runPromise(started.await);
    expect(existsSync(bundlePath)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(Exit.hasInterrupts(await Effect.runPromise(Fiber.await(fiber)))).toBe(true);
    expect(interrupted).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
  });
});
