import { NodeServices } from "@effect/platform-node";
import { Effect, Result } from "effect";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { definition, targetEntries } from "../../packages/effect-build-bun/src/Adapter.js";
import * as Bun from "../../packages/effect-build-bun/src/index.js";
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
const fixture = fileURLToPath(new URL("../fixtures/driver/fake-tool.mjs", import.meta.url));
const bunAdapter = {
  validateOptions: definition.validateOptions,
  renderArgv: (input: {
    readonly entrypoint: string;
    readonly target?: Bun.Target;
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

const fakeCompileTool = (): { readonly executable: string; readonly log: string } => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-tool-"));
  roots.push(root);
  const executable = join(root, "bun");
  const log = join(root, "spawns.log");
  writeFileSync(log, "");
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf 'cwd:%s\\n' "$PWD" >> "${log}"\nEFFECT_BUILD_FAKE_HOST_OS=macos EFFECT_BUILD_FAKE_TOOL_PATH="$0" exec "${process.execPath}" "${fixture}" bun "${log}" "$@"\n`,
  );
  chmodSync(executable, 0o755);
  return { executable, log };
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
    expect(Result.isSuccess(options)).toBe(true);
    if (Result.isFailure(options)) throw new Error(options.failure);
    expect(bunAdapter.renderArgv({
      entrypoint: "src/main.ts",
      target: "linux-aarch64-gnu",
      options: options.success,
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
      _tag: "Failure",
      failure: "unknown Bun option",
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
    expect(Result.isSuccess(validated)).toBe(true);
    if (Result.isFailure(validated)) throw new Error(validated.failure);
    expect(bunAdapter.renderArgv({
      entrypoint: "a.ts",
      target: "macos-x64",
      options: validated.success,
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

  it("retains scalar typed-field trust and provider CLI pass-through", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "effect-build-bun-cwd-"));
    roots.push(cwd);
    writeFileSync(join(cwd, "bunfig.toml"), "# compiler-owned project configuration\n");
    const { executable, log } = fakeCompileTool();
    const previous = process.env.EFFECT_BUILD_CONTRACT_ENV;
    process.env.EFFECT_BUILD_CONTRACT_ENV = "provider-local-bun";
    try {
      const artifact = await Effect.runPromise(
        Bun.compileExecutable({
          entrypoint: "src/provider-entry.ts",
          outfile: "dist/app",
          cwd,
          // Scalar retains the typed-only boundary: only literal true hashes.
          digest: "yes" as never,
        }).pipe(
          Effect.provide(Bun.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
      const lines = readFileSync(log, "utf8").trim().split("\n");
      const compileArgv = JSON.parse(lines.find((line) => line.startsWith('["build"')) ?? "[]") as string[];
      expect(artifact.path).toBe(join(cwd, "dist", "app"));
      expect(artifact.digest).toBeUndefined();
      expect(lines).toContain(`cwd:${realpathSync(cwd)}`);
      expect(lines).toContain("env:provider-local-bun");
      expect(compileArgv.at(-1)).toBe("src/provider-entry.ts");
      expect(compileArgv.some((arg) => arg.includes("bunfig") || arg === "--config")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.EFFECT_BUILD_CONTRACT_ENV;
      else process.env.EFFECT_BUILD_CONTRACT_ENV = previous;
    }
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
