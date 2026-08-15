import { NodeServices } from "@effect/platform-node";
import { Effect, Result } from "effect";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { definition, targetEntries } from "../../packages/effect-build-deno/src/Adapter.js";
import * as Deno from "../../packages/effect-build-deno/src/index.js";
import { describeStandaloneDriverContract } from "../testkit/standaloneDriverContract.js";

describeStandaloneDriverContract<Deno.Compiler, Deno.Options, Deno.Target, Deno.Artifact>({
  tool: "deno",
  layer: Deno.layer,
  compileExecutable: Deno.compileExecutable,
  compileExecutableMatrix: Deno.compileExecutableMatrix,
  matrixTarget: "macos-aarch64",
  probeFirstArg: "eval",
  compileFirstArg: "compile",
  invalidOptions: { rawArgs: ["--x"] } as never,
  unsupportedTarget: "linux-x64-musl",
});

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/driver/fake-tool.mjs", import.meta.url));
const denoAdapter = {
  targetTable: { Target: Deno.Target },
  validateOptions: definition.validateOptions,
  renderArgv: (input: {
    readonly entrypoint: string;
    readonly target?: Deno.Target;
    readonly options: Parameters<typeof definition.renderArgv>[0]["input"]["options"];
    readonly stagedOutfile: string;
  }) =>
    definition.renderArgv({
      input: {
        entrypoint: input.entrypoint,
        ...(input.target === undefined ? {} : { target: input.target }),
        options: input.options,
      },
      ...(input.target === undefined
        ? {}
        : { nativeTarget: targetEntries.find(([target]) => target === input.target)![1] }),
      stagedOutfile: input.stagedOutfile,
    }),
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fakeTool = (reportedPath: "self" | "other" = "self"): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "deno");
  const reportedExecutable = reportedPath === "self" ? executable : join(root, "different-deno");
  if (reportedPath === "other") {
    writeFileSync(reportedExecutable, "different executable\n");
    chmodSync(reportedExecutable, 0o755);
  }
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '{"path":"${reportedExecutable}","version":"8.8.8"}'\n`,
  );
  chmodSync(executable, 0o755);
  return executable;
};

const fakeCompileTool = (): { readonly executable: string; readonly log: string } => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "deno");
  const log = join(root, "spawns.log");
  writeFileSync(log, "");
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf 'cwd:%s\\n' "$PWD" >> "${log}"\nEFFECT_BUILD_FAKE_TOOL_PATH="$0" exec "${process.execPath}" "${fixture}" deno "${log}" "$@"\n`,
  );
  chmodSync(executable, 0o755);
  return { executable, log };
};

describe("standalone Deno driver", () => {
  it("publishes the exact evidence-backed target literals", () => {
    expect(Deno.Target.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-aarch64-gnu",
      "windows-x64",
      "windows-aarch64",
    ]);
  });

  it("renders bundle, minify, permissions, target, and output exactly", () => {
    const options = denoAdapter.validateOptions({
      bundle: true,
      minify: true,
      permissions: { read: true, net: ["example.com:443"], env: ["PORT"] },
    });
    expect(Result.isSuccess(options)).toBe(true);
    if (Result.isFailure(options)) throw new Error(options.failure);
    expect(denoAdapter.renderArgv({
      entrypoint: "src/main.ts",
      target: "windows-x64",
      options: options.success,
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
      _tag: "Failure",
      failure: "minify requires bundle",
    });
    expect(denoAdapter.targetTable.Target.literals).not.toContain("linux-x64-musl");
    expect(denoAdapter.targetTable.Target.literals).not.toContain("linux-aarch64-musl");
  });

  it("rejects a non-boolean allow-all permission at scalar option preflight", () => {
    expect(denoAdapter.validateOptions({ permissions: { all: "yes" } })).toMatchObject({
      _tag: "Failure",
      failure: "all permission must be boolean",
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
    expect(Result.isSuccess(validated)).toBe(true);
    if (Result.isFailure(validated)) throw new Error(validated.failure);
    hosts[0] = "mutated.example:443";
    source.minify = false;
    expect(denoAdapter.renderArgv({
      entrypoint: "a.ts",
      target: "macos-x64",
      options: validated.success,
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

  it("retains scalar typed-field trust and provider CLI pass-through", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "effect-build-deno-cwd-"));
    roots.push(cwd);
    writeFileSync(join(cwd, "deno.json"), "{}\n");
    const { executable, log } = fakeCompileTool();
    const previous = process.env.EFFECT_BUILD_CONTRACT_ENV;
    process.env.EFFECT_BUILD_CONTRACT_ENV = "provider-local-deno";
    try {
      const artifact = await Effect.runPromise(
        Deno.compileExecutable({
          entrypoint: "src/provider-entry.ts",
          outfile: "dist/app",
          cwd,
          // Scalar retains the typed-only boundary: only literal true hashes.
          digest: "yes" as never,
        }).pipe(
          Effect.provide(Deno.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
      const lines = readFileSync(log, "utf8").trim().split("\n");
      const compileArgv = JSON.parse(lines.find((line) => line.startsWith('["compile"')) ?? "[]") as string[];
      expect(artifact.path).toBe(join(cwd, "dist", "app"));
      expect(artifact.digest).toBeUndefined();
      expect(lines).toContain(`cwd:${realpathSync(cwd)}`);
      expect(lines).toContain("env:provider-local-deno");
      expect(compileArgv.at(-1)).toBe("src/provider-entry.ts");
      expect(compileArgv.some((arg) => arg.includes("deno.json") || arg === "--config")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.EFFECT_BUILD_CONTRACT_ENV;
      else process.env.EFFECT_BUILD_CONTRACT_ENV = previous;
    }
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
    expect(service.compileExecutableMatrix).toBeTypeOf("function");
    await expect(Effect.runPromise(
      Deno.Compiler.pipe(
        Effect.provide(Deno.layer({ executable: "relative/deno" })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });

  it("rejects an explicit executable whose probe reports a different canonical file", async () => {
    const executable = fakeTool("other");
    await expect(Effect.runPromise(
      Deno.Compiler.pipe(
        Effect.provide(Deno.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    )).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
  });
});
