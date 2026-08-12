import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Bun from "../../src/Bun.js";
import { bunAdapter } from "../../src/standalone/internal/BunAdapter.js";
import { describeStandaloneDriverContract } from "../testkit/standaloneDriverContract.js";

describeStandaloneDriverContract<Bun.Compiler, Bun.Options, Bun.Target, Bun.Artifact>({
  tool: "bun",
  layer: Bun.layer,
  compileExecutable: Bun.compileExecutable,
  compileExecutableMatrix: Bun.compileExecutableMatrix,
  matrixTarget: "macos-aarch64",
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
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '{"path":"${executable}","version":"9.9.9","hostOs":"macos"}'\n`,
  );
  chmodSync(executable, 0o755);
  return executable;
};

describe("standalone Bun driver", () => {
  it("publishes the exact evidence-backed target literals", () => {
    expect(Bun.Target.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ]);
  });

  it("renders only requested native flags and exact target mapping", () => {
    const options = bunAdapter.validateOptions({ minify: true, sourcemap: "inline", bytecode: true });
    expect(options._tag).toBe("Valid");
    if (options._tag !== "Valid") throw options.error;
    expect(bunAdapter.renderArgv({
      input: {
        entrypoint: "src/main.ts",
        outfile: "dist/app",
        target: "linux-aarch64-gnu",
        options: options.value,
      },
      stagedOutfile: "/tmp/.effect-build/app",
    })).toEqual([
      "build",
      "--compile",
      "--target=bun-linux-arm64",
      "--minify",
      "--sourcemap=inline",
      "--bytecode",
      "--outfile=/tmp/.effect-build/app",
      "src/main.ts",
    ]);
  });

  it("rejects unknown runtime options", () => {
    expect(bunAdapter.validateOptions({ rawArgs: ["--x"] })).toMatchObject({
      _tag: "Invalid",
      error: { _tag: "InvalidDriverOptions" },
    });
  });

  it("copies validated options so rendering cannot observe later caller mutation", () => {
    let minifyReads = 0;
    let sourcemapReads = 0;
    const source: { minify?: boolean; sourcemap?: string } = {
      get minify() {
        minifyReads += 1;
        return true;
      },
      get sourcemap() {
        sourcemapReads += 1;
        return "inline";
      },
    };
    const validated = bunAdapter.validateOptions(source);
    expect(validated._tag).toBe("Valid");
    if (validated._tag !== "Valid") throw validated.error;
    expect(bunAdapter.renderArgv({
      input: { entrypoint: "a.ts", outfile: "app", target: "macos-x64", options: validated.value },
      stagedOutfile: "/tmp/app",
    })).toEqual([
      "build",
      "--compile",
      "--target=bun-darwin-x64",
      "--minify",
      "--sourcemap=inline",
      "--outfile=/tmp/app",
      "a.ts",
    ]);
    expect({ minifyReads, sourcemapReads }).toEqual({ minifyReads: 1, sourcemapReads: 1 });
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
    expect(service.compileExecutableMatrix).toBeTypeOf("function");
    await expect(Effect.runPromise(
      Bun.Compiler.pipe(
        Effect.provide(Bun.layer({ executable: "relative/bun" })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });
});
