import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Schema } from "effect";
import * as Core from "effect-build";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as NodeSea from "effect-build-node-sea";
import * as Provider from "effect-build/Provider";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const targets = {
  bun: ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl", "linux-aarch64-gnu", "windows-x64"],
  deno: ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-aarch64-gnu", "windows-x64", "windows-aarch64"],
  "node-sea": ["linux-x64-gnu"],
} as const;

const artifact = (provider: "bun" | "deno" | "node-sea", target: string) => ({
  path: "/tmp/effect-build-artifact",
  bytes: 1,
  target,
  provider,
  stages: provider === "node-sea"
    ? [
      { operation: "bundle", tool: { name: "esbuild", version: "0.28.2" } },
      { operation: "assemble-node-sea", tool: { name: "node", version: "26.7.0", path: "/tmp/node" } },
    ]
    : [{ operation: "compile-executable", tool: { name: provider, path: "/tmp/compiler", version: "1.0.0" } }],
});

const matrixFailure = (provider: "bun" | "deno" | "node-sea", target: string): Core.MatrixError.MatrixFailed =>
  new Core.MatrixError.MatrixFailed({
    artifacts: [],
    failures: [{
      provider,
      target,
      path: "/tmp/effect-build-artifact",
      error: new Core.BuildError.ToolFailed({ tool: provider, exitCode: 1, diagnostics: [] }),
    }] as never,
  });

class InvalidStagesCompiler extends Context.Service<
  InvalidStagesCompiler,
  Provider.CompilerService<"node-sea", Record<string, never>>
>()("test/InvalidStagesCompiler") {}

const invalidStagesProvider = Provider.define({
  name: "node-sea",
  kind: "composed",
  service: InvalidStagesCompiler,
  defaultTarget: "linux-x64-gnu",
  targetTokens: { "linux-x64-gnu": "linux-x64-gnu" },
  validateOptions: () => ({ _tag: "Valid" as const, value: {} }),
  makeProducer: (_options, execute) => {
    void execute;
    return Effect.succeed({
      produceCandidate: () => Effect.succeed([] as never),
    });
  },
});

describe("closed provider SPI", () => {
  it("derives all three provider Target schemas from the exact closed correlations", () => {
    expect(Bun.Target.literals).toEqual(targets.bun);
    expect(Deno.Target.literals).toEqual(targets.deno);
    expect(NodeSea.Target.literals).toEqual(targets["node-sea"]);
  });

  it("accepts all 13 correlated artifacts and rejects every cross-provider-invalid pair", () => {
    const isArtifact = Schema.is(Core.Artifact.Artifact);
    for (const target of targets.bun) expect(isArtifact(artifact("bun", target)), `bun/${target}`).toBe(true);
    for (const target of targets.deno) expect(isArtifact(artifact("deno", target)), `deno/${target}`).toBe(true);
    for (const target of targets["node-sea"]) {
      expect(isArtifact(artifact("node-sea", target)), `node-sea/${target}`).toBe(true);
    }
    expect(isArtifact(artifact("bun", "windows-aarch64"))).toBe(false);
    expect(isArtifact(artifact("deno", "linux-x64-musl"))).toBe(false);
    expect(isArtifact(artifact("node-sea", "macos-x64"))).toBe(false);
  });

  it("accepts all 13 correlated matrix failures and rejects cross-provider-invalid pairs", () => {
    const isMatrixError = Schema.is(Core.MatrixError.MatrixError);
    for (const target of targets.bun) expect(isMatrixError(matrixFailure("bun", target)), `bun/${target}`).toBe(true);
    for (const target of targets.deno) {
      expect(isMatrixError(matrixFailure("deno", target)), `deno/${target}`).toBe(true);
    }
    expect(isMatrixError(matrixFailure("node-sea", "linux-x64-gnu"))).toBe(true);
    expect(() => matrixFailure("bun", "windows-aarch64")).toThrow(/Schema validation failed/);
    expect(() => matrixFailure("deno", "linux-x64-musl")).toThrow(/Schema validation failed/);
    expect(() => matrixFailure("node-sea", "macos-x64")).toThrow(/Schema validation failed/);
  });

  it("rejects malformed composed stages before candidate validation or publication", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-invalid-stages-"));
    const outfile = join(directory, "app");
    await writeFile(outfile, "old-destination");
    try {
      const result = await Effect.runPromise(
        invalidStagesProvider.compileExecutable({
          entrypoint: "ignored.ts",
          outfile,
          target: "linux-x64-gnu",
          options: {},
        }).pipe(
          Effect.provide(invalidStagesProvider.layer()),
          Effect.provide(NodeServices.layer),
        ),
      ).then(
        (artifact) => ({ _tag: "Artifact" as const, artifact }),
        (error: unknown) => ({ _tag: "Error" as const, error }),
      );
      expect(result).toMatchObject({
        _tag: "Error",
        error: {
          _tag: "ToolFailed",
          tool: "node-sea",
          exitCode: 1,
          diagnostics: [{
            channel: "stderr",
            text: "invalid node-sea stage tuple",
            truncated: false,
          }],
        },
      });
      expect(await readFile(outfile, "utf8")).toBe("old-destination");
      expect((await readdir(directory)).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps one core correlation value and one define call per provider", async () => {
    const contract = await readFile(resolve(root, "packages/effect-build/src/internal/ProviderContracts.ts"), "utf8");
    expect(contract.match(/export const ProviderContracts\b/g)).toHaveLength(1);
    expect(contract).toContain('"linux-x64-musl"');
    expect(contract).toContain('"windows-aarch64"');
    for (const provider of ["effect-build-bun", "effect-build-deno", "effect-build-node-sea"]) {
      const source = await readFile(resolve(root, `packages/${provider}/src/index.ts`), "utf8");
      expect(source.match(/Provider\.define\(/g), provider).toHaveLength(1);
      expect(source, provider).not.toMatch(/Schema\.Literals|makeTargetTable/);
    }
  });

  it("does not expose lifecycle or process implementation files", async () => {
    const coreManifest = JSON.parse(await readFile(resolve(root, "packages/effect-build/package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(coreManifest.exports)).toEqual([".", "./Provider"]);
    const providerDeclaration = await readFile(resolve(root, "packages/effect-build/dist/Provider.d.ts"), "utf8");
    for (
      const capability of [
        "ProcessCompletion",
        "CompilerAdapter",
        "discoverTool",
        "makeCompilerService",
        "AtomicOutput",
      ]
    ) {
      expect(providerDeclaration, capability).not.toMatch(new RegExp(`export[^;]*\\b${capability}\\b`));
    }
    expect(providerDeclaration).toContain("execute: ExecuteCommand");
    expect(providerDeclaration).toContain(
      "export type ComposedProviderRequirements = FileSystem.FileSystem | Path.Path",
    );
    const internals = await readdir(resolve(root, "packages/effect-build/src/standalone/internal"));
    expect(internals).toContain("Process.ts");
  });
});
