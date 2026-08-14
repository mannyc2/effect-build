import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const docs = ["README.md", "api.md", "architecture.md", "drivers.md", "errors.md"];
const examples = [
  "README.md",
  "bun/package.json",
  "bun/src/compile.ts",
  "bun/src/matrix.ts",
  "bun/tsconfig.json",
  "deno/package.json",
  "deno/src/compile.ts",
  "deno/tsconfig.json",
  "node-sea/package.json",
  "node-sea/src/compile.ts",
  "node-sea/tsconfig.json",
];

const readAll = async (paths: readonly string[], directory: string): Promise<string> =>
  (await Promise.all(paths.map((path) => readFile(resolve(root, directory, path), "utf8")))).join("\n");

describe("documentation contract", () => {
  it("keeps the exact documentation and workspace-example inventory", async () => {
    expect((await readdir(resolve(root, "docs"))).sort()).toEqual(
      [...docs.filter((path) => path !== "README.md"), "README.md"].sort(),
    );
    const actualExamples = (await readdir(resolve(root, "examples"), { recursive: true }))
      .filter((path) =>
        !path.includes("node_modules/") && !path.endsWith("/node_modules") && !path.endsWith("/src")
        && /\.[^/]+$/.test(path)
      )
      .sort();
    expect(actualExamples).toEqual([...examples].sort());
  });

  it("documents Bun installation, the exact Effect interval, and four packages", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    expect(readme).toContain(
      "bun add effect-build effect-build-bun effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108",
    );
    expect(readme).toContain("`>=4.0.0-beta.104 <4.1.0-0`");
    expect(readme).not.toContain("4.0.0-beta.107");
    for (const name of ["effect-build", "effect-build-bun", "effect-build-deno", "effect-build-node-sea"]) {
      expect(`${readme}\n${await readFile(resolve(root, `packages/${name}/README.md`), "utf8")}`).toContain(name);
    }
  });

  it("documents exactly two operation names on all three providers", async () => {
    const agents = await readFile(resolve(root, "AGENTS.md"), "utf8");
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    const index = await readFile(resolve(root, "docs/README.md"), "utf8");
    for (const text of [agents, api, index]) {
      expect(text).toContain("compileExecutable");
      expect(text).toContain("compileExecutableMatrix");
    }
    expect(agents).toContain("exactly two public operations");
    expect(api).toContain("four packages with five public entry points");
    expect(api).toContain("exactly five runtime keys");
    expect(api).toContain("There is no root compile");
    expect(api).toContain('import * as NodeSea from "effect-build-node-sea"');
  });

  it("documents the provider-correlated stage hard cut", async () => {
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    expect(api).toContain('readonly provider: "bun" | "deno" | "node-sea"');
    expect(api).toContain("readonly stages: readonly [ObservedStage, ...ObservedStage[]]");
    expect(api).toContain("`compile-executable` stage");
    expect(api).toContain("esbuild 0.28.2");
    expect(api).toContain("Node 26.7.0");
    const artifact = api.match(/interface Artifact \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(artifact).not.toMatch(/readonly tools?:/);
    expect(api).not.toContain("tool pairs present");
    expect(api).toMatch(/not provenance, receipts, or reproducibility claims/);
  });

  it("documents homogeneous matrix invariants and one composition boundary", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const example = await readFile(resolve(root, "examples/bun/src/matrix.ts"), "utf8");
    const text = `${readme}\n${example}`;
    expect(text).toContain("Bun.compileExecutableMatrix({");
    expect(text).toContain('targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"]');
    expect(text).toContain("concurrency: 2");
    expect(example.match(/Effect\.provide\(compiler\)/g)).toHaveLength(1);
    expect(example.match(/Effect\.provide\(NodeServices\.layer\)/g)).toHaveLength(1);
    expect(example).not.toContain("Deno");
  });

  it("documents total preflight, collect-all, atomic publication, and interruption", async () => {
    const text = await readAll(docs, "docs");
    expect(text).toMatch(/total preflight/i);
    expect(text).toMatch(/before (?:any )?filesystem/i);
    expect(text).toMatch(/positive safe integer/i);
    expect(text).toMatch(/collect-all/i);
    expect(text).toMatch(/target input order/i);
    expect(text).toMatch(/already committed Artifacts/i);
    expect(text).toMatch(/no matrix-wide rollback|does not roll them back/i);
    expect(text).toMatch(/queued cells do not start|skips queued cells/i);
    expect(text).toMatch(/exact interruption Cause/i);
    expect(text).toMatch(/atomic rename is the publication\s+linearization point and point of no return/i);
  });

  it("documents exact Node SEA product behavior without promoting rejected products", async () => {
    const architecture = await readFile(resolve(root, "docs/architecture.md"), "utf8");
    const drivers = await readFile(resolve(root, "docs/drivers.md"), "utf8");
    const nodeReadme = await readFile(resolve(root, "packages/effect-build-node-sea/README.md"), "utf8");
    const text = `${architecture}\n${drivers}\n${nodeReadme}`;
    expect(text).toContain("effect-build-node-sea");
    expect(text).toContain("linux-x64-gnu");
    expect(text).toContain("esbuild 0.28.2");
    expect(text).toContain("Node 26.7.0");
    expect(text).toMatch(/never\s+uses\s+postject/i);
    expect(text).toMatch(/never downloads|never downloads or installs/i);
    expect(architecture).toMatch(/four separate choices/i);
    expect(architecture).toMatch(/rejected inspection, receipt, semantic-plan/);
  });

  it("rejects legacy package and release language in user-facing material", async () => {
    const text = [
      await readFile(resolve(root, "README.md"), "utf8"),
      await readFile(resolve(root, "AGENTS.md"), "utf8"),
      await readAll(docs, "docs"),
      await readAll(examples, "examples"),
    ].join("\n");
    expect(text).not.toMatch(
      /exactly three lockstep public packages|publishes three packages|pnpm add|pnpm run|pnpm verify/i,
    );
    expect(text).not.toMatch(/one public operation|Effect\.all\(\[mac, linux\]/i);
    expect(text).not.toMatch(/(?:guarantees|provides) (?:hermeticity|reproducibility|provenance)/i);
  });
});
