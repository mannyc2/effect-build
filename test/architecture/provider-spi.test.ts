import { Schema } from "effect";
import * as Core from "effect-build";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const targets = {
  bun: ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl", "linux-aarch64-gnu", "windows-x64"],
  deno: ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-aarch64-gnu", "windows-x64", "windows-aarch64"],
} as const;

const artifact = (tool: "bun" | "deno", target: string) => ({
  path: "/tmp/effect-build-artifact",
  bytes: 1,
  target,
  tool: { name: tool, path: "/tmp/compiler", version: "1.0.0" },
});

const matrixFailure = (tool: "bun" | "deno", target: string): Core.MatrixError.MatrixFailed =>
  new Core.MatrixError.MatrixFailed({
    artifacts: [],
    failures: [{
      tool,
      target,
      path: "/tmp/effect-build-artifact",
      error: new Core.BuildError.ToolFailed({ tool, exitCode: 1, diagnostics: [] }),
    }] as never,
  });

describe("closed provider SPI", () => {
  it("derives both provider Target schemas from the exact closed correlations", () => {
    expect(Bun.Target.literals).toEqual(targets.bun);
    expect(Deno.Target.literals).toEqual(targets.deno);
  });

  it("accepts all 12 correlated artifacts and rejects every cross-provider-invalid pair", () => {
    const isArtifact = Schema.is(Core.Artifact.Artifact);
    for (const target of targets.bun) expect(isArtifact(artifact("bun", target)), `bun/${target}`).toBe(true);
    for (const target of targets.deno) expect(isArtifact(artifact("deno", target)), `deno/${target}`).toBe(true);
    expect(isArtifact(artifact("bun", "windows-aarch64"))).toBe(false);
    expect(isArtifact(artifact("deno", "linux-x64-musl"))).toBe(false);
  });

  it("accepts all 12 correlated matrix failures and rejects cross-provider-invalid pairs", () => {
    const isMatrixError = Schema.is(Core.MatrixError.MatrixError);
    for (const target of targets.bun) expect(isMatrixError(matrixFailure("bun", target)), `bun/${target}`).toBe(true);
    for (const target of targets.deno) {
      expect(isMatrixError(matrixFailure("deno", target)), `deno/${target}`).toBe(true);
    }
    expect(() => matrixFailure("bun", "windows-aarch64")).toThrow(/Schema validation failed/);
    expect(() => matrixFailure("deno", "linux-x64-musl")).toThrow(/Schema validation failed/);
  });

  it("keeps one core correlation value and one define call per provider", async () => {
    const contract = await readFile(resolve(root, "packages/effect-build/src/internal/ProviderContracts.ts"), "utf8");
    expect(contract.match(/export const ProviderContracts\b/g)).toHaveLength(1);
    expect(contract).toContain('"linux-x64-musl"');
    expect(contract).toContain('"windows-aarch64"');
    for (const provider of ["effect-build-bun", "effect-build-deno"]) {
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
    const internals = await readdir(resolve(root, "packages/effect-build/src/standalone/internal"));
    expect(internals).toContain("Process.ts");
  });
});
