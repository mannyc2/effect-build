import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Deno from "../../src/Deno.js";
import { denoAdapter } from "../../src/standalone/internal/DenoAdapter.js";
import { describeStandaloneDriverContract } from "../testkit/standaloneDriverContract.js";

describeStandaloneDriverContract({
  tool: "deno",
  layer: Deno.layer,
  compileExecutable: Deno.compileExecutable,
  probeFirstArg: "eval",
  compileFirstArg: "compile",
  invalidOptions: { rawArgs: ["--x"] } as never,
  unsupportedTarget: "linux-x64-musl",
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fakeTool = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "deno");
  writeFileSync(executable, `#!/bin/sh\nprintf '{"path":"${executable}","version":"8.8.8"}'\n`);
  chmodSync(executable, 0o755);
  return executable;
};

describe("standalone Deno driver", () => {
  it("renders bundle, minify, permissions, target, and output exactly", () => {
    expect(denoAdapter.renderArgv({
      input: {
        entrypoint: "src/main.ts",
        outfile: "dist/app",
        target: "windows-x64",
        options: {
          bundle: true,
          minify: true,
          permissions: { read: true, net: ["example.com:443"], env: ["PORT"] },
        },
      },
      stagedOutfile: "/tmp/.effect-build/app.exe",
    })).toEqual([
      "compile",
      "--target",
      "x86_64-pc-windows-msvc",
      "--bundle",
      "--minify",
      "--allow-read",
      "--allow-net=example.com:443",
      "--allow-env=PORT",
      "--output",
      "/tmp/.effect-build/app.exe",
      "src/main.ts",
    ]);
  });

  it("rejects invalid option combinations and omits Deno musl targets", () => {
    expect(() =>
      denoAdapter.renderArgv({
        input: { entrypoint: "a.ts", outfile: "app", options: { bundle: false, minify: true } as never },
        stagedOutfile: "/tmp/app",
      })
    ).toThrowError(expect.objectContaining({ _tag: "InvalidDriverOptions" }));
    expect(denoAdapter.supportedTargets).not.toContain("linux-x64-musl");
    expect(denoAdapter.supportedTargets).not.toContain("linux-aarch64-musl");
  });

  it("probes an explicit absolute executable while constructing the Layer", async () => {
    const executable = fakeTool();
    const service = await Effect.runPromise(
      Deno.Compiler.pipe(
        Effect.provide(Deno.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(service.compileExecutable).toBeTypeOf("function");
    await expect(Effect.runPromise(
      Deno.Compiler.pipe(
        Effect.provide(Deno.layer({ executable: "relative/deno" })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });
});
