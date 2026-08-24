import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../..");

describe("v0.5 target surface", () => {
  it("hard-cuts the transitional core Toolchain surface", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages/effect-build/package.json"), "utf8"),
    ) as { readonly exports: Readonly<Record<string, unknown>> };

    expect(Object.keys(manifest.exports).sort()).toEqual([
      ".",
      "./Artifact",
      "./Author/BorrowedContent",
      "./Author/Generation",
      "./Author/NodeMain",
      "./Author/Tool",
      "./Author/TreeSnapshot",
      "./BuildError",
      "./Profile/StaticBrowserApplication",
      "./Target",
    ]);

    const rootSource = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    expect(rootSource).not.toContain("Toolchain");
    expect(rootSource).not.toContain("Author");
    expect(rootSource).not.toContain("Profile");

    const vitestConfig = await readFile(resolve(root, "vitest.config.ts"), "utf8");
    for (const subpath of Object.keys(manifest.exports).filter((subpath) => subpath !== ".")) {
      expect(vitestConfig, `missing source alias for ${subpath}`).toContain(
        `"effect-build/${subpath.slice(2)}"`,
      );
    }
    expect(vitestConfig).not.toContain("effect-build/Toolchain");
  });

  it("removes bundle and tool authority from the public artifact model", async () => {
    const artifactSource = await readFile(resolve(root, "packages/effect-build/src/Artifact.ts"), "utf8");
    expect(artifactSource).not.toMatch(/export interface (?:Bundle|BundleFile|Tool)\b/);
  });

  it("does not mint target identity from the orchestrator host", async () => {
    const targetSource = await readFile(resolve(root, "packages/effect-build/src/Target.ts"), "utf8");
    expect(targetSource).not.toMatch(/export const host\b/);
    expect(targetSource).not.toContain("globalThis");
  });

  it("exercises the packed external-author boundary through public subpaths", async () => {
    const fixture = await readFile(resolve(root, "test/fixtures/external-author-v05/index.js"), "utf8");
    const imports = [...fixture.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]!);
    expect(imports.filter((specifier) => specifier.startsWith("effect-build"))).toEqual([
      "effect-build/Author/NodeMain",
      "effect-build/Profile/StaticBrowserApplication",
    ]);
    expect(fixture).not.toContain("/src/");
    expect(fixture).not.toContain("/internal/");

    const consumer = await readFile(resolve(root, "scripts/test-built-consumer.mjs"), "utf8");
    expect(consumer).toContain('"--strict-peer-deps"');
    expect(consumer).toContain('"--install-strategy=nested"');
    expect(consumer).toContain("adapterProducerTag === NodeMain.Producer");
    expect(consumer).toContain("unknown portable protocol reached the external provider");
  });

  it("hard-cuts Node SEA into truthful Raw and evidence-only portable modules", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages/effect-build-node-sea/package.json"), "utf8"),
    ) as { readonly exports: Readonly<Record<string, unknown>> };
    expect(Object.keys(manifest.exports).sort()).toEqual([".", "./NodeMainExecutable", "./Raw"]);
    expect(await readFile(resolve(root, "packages/effect-build-node-sea/src/index.ts"), "utf8")).not.toContain(
      "AssembleExecutable",
    );
    const portable = await readFile(
      resolve(root, "packages/effect-build-node-sea/src/NodeMainExecutable.ts"),
      "utf8",
    );
    expect(portable).not.toContain("Context.Service");
    expect(portable).not.toContain("Layer.Layer");
    expect(portable).not.toContain("finalize:");
  });

  it("keeps the 108-cell target finalizer private, exact, and manually admitted", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as {
      readonly permissions: Readonly<Record<string, string>>;
      readonly jobs: Readonly<
        Record<string, {
          readonly if?: string;
          readonly needs?: string;
          readonly strategy?: { readonly matrix?: Readonly<Record<string, readonly unknown[]>> };
        }>
      >;
    };
    expect(workflow.permissions.actions).toBe("read");
    const construct = workflow.jobs["node-main-construct"]!;
    const finalize = workflow.jobs["node-main-finalize"]!;
    const product = (matrix: Readonly<Record<string, readonly unknown[]>> | undefined): number =>
      Object.values(matrix ?? {}).reduce((count, axis) => count * axis.length, 1);
    expect(product(construct.strategy?.matrix)).toBe(108);
    expect(product(finalize.strategy?.matrix)).toBe(108);
    expect(construct.if).toContain("workflow_dispatch");
    expect(finalize.needs).toBe("node-main-construct");
    expect(workflow.jobs["node-main-aggregate"]?.needs).toBe("node-main-finalize");

    const packageManifest = await readFile(resolve(root, "packages/effect-build-node-sea/package.json"), "utf8");
    expect(packageManifest).not.toContain("node-target-finalizer");
  });
});
