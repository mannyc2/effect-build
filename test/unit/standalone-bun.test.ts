import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Bun from "../../src/Bun.js";
import { bunAdapter } from "../../src/standalone/internal/BunAdapter.js";
import { describeStandaloneDriverContract } from "../testkit/standaloneDriverContract.js";

describeStandaloneDriverContract({
  tool: "bun",
  layer: Bun.layer,
  compileExecutable: Bun.compileExecutable,
  probeFirstArg: "-e",
  compileFirstArg: "build",
  invalidOptions: { rawArgs: ["--x"] } as never,
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fakeTool = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "bun");
  writeFileSync(executable, `#!/bin/sh\nprintf '{"path":"${executable}","version":"9.9.9"}'\n`);
  chmodSync(executable, 0o755);
  return executable;
};

describe("standalone Bun driver", () => {
  it("renders only requested native flags and exact target mapping", () => {
    expect(bunAdapter.renderArgv({
      input: {
        entrypoint: "src/main.ts",
        outfile: "dist/app",
        target: "linux-aarch64-musl",
        options: { minify: true, sourcemap: "inline", bytecode: true },
      },
      stagedOutfile: "/tmp/.effect-build/app",
    })).toEqual([
      "build",
      "--compile",
      "--target=bun-linux-arm64-musl",
      "--minify",
      "--sourcemap=inline",
      "--bytecode",
      "--outfile=/tmp/.effect-build/app",
      "src/main.ts",
    ]);
  });

  it("rejects unknown runtime options", () => {
    expect(() =>
      bunAdapter.renderArgv({
        input: { entrypoint: "a.ts", outfile: "app", options: { rawArgs: ["--x"] } as never },
        stagedOutfile: "/tmp/app",
      })
    ).toThrowError(expect.objectContaining({ _tag: "InvalidDriverOptions" }));
  });

  it("probes an explicit absolute executable while constructing the Layer", async () => {
    const executable = fakeTool();
    const service = await Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(service.compileExecutable).toBeTypeOf("function");
    await expect(Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable: "relative/bun" })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });
});
