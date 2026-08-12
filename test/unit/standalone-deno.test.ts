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
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '{"path":"${executable}","version":"8.8.8","hostOs":"macos"}'\n`,
  );
  chmodSync(executable, 0o755);
  return executable;
};

describe("standalone Deno driver", () => {
  it("renders bundle, minify, permissions, target, and output exactly", () => {
    const options = denoAdapter.validateOptions({
      bundle: true,
      minify: true,
      permissions: { read: true, net: ["example.com:443"], env: ["PORT"] },
    });
    expect(options._tag).toBe("Valid");
    if (options._tag !== "Valid") throw options.error;
    expect(denoAdapter.renderArgv({
      input: {
        entrypoint: "src/main.ts",
        outfile: "dist/app",
        target: "windows-x64",
        options: options.value,
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
    expect(denoAdapter.validateOptions({ bundle: false, minify: true })).toMatchObject({
      _tag: "Invalid",
      error: { _tag: "InvalidDriverOptions" },
    });
    expect(denoAdapter.targetTable.Target.literals).not.toContain("linux-x64-musl");
    expect(denoAdapter.targetTable.Target.literals).not.toContain("linux-aarch64-musl");
  });

  it("rejects a non-boolean allow-all permission at scalar option preflight", () => {
    expect(denoAdapter.validateOptions({ permissions: { all: "yes" } })).toMatchObject({
      _tag: "Invalid",
      error: { _tag: "InvalidDriverOptions", reason: "all permission must be boolean" },
    });
  });

  it("captures rendered permissions during validation instead of retaining mutable caller arrays", () => {
    const hosts = ["one.example:443"];
    let permissionReads = 0;
    const permissions = {
      get net() {
        permissionReads += 1;
        return hosts;
      },
    };
    const source = { bundle: true as const, minify: true, permissions };
    const validated = denoAdapter.validateOptions(source);
    expect(validated._tag).toBe("Valid");
    if (validated._tag !== "Valid") throw validated.error;
    hosts[0] = "mutated.example:443";
    source.minify = false;
    expect(denoAdapter.renderArgv({
      input: { entrypoint: "a.ts", outfile: "app", target: "macos-x64", options: validated.value },
      stagedOutfile: "/tmp/app",
    })).toEqual([
      "compile",
      "--target",
      "x86_64-apple-darwin",
      "--bundle",
      "--minify",
      "--allow-net=one.example:443",
      "--output",
      "/tmp/app",
      "a.ts",
    ]);
    expect(permissionReads).toBe(1);
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
