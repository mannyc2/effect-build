import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const docs = ["README.md", "api.md", "architecture.md", "drivers.md", "errors.md", "release-security.md"];
const examples = [
  "README.md",
  "bun/package.json",
  "bun/src/compile.ts",
  "bun/src/matrix.ts",
  "bun/tsconfig.json",
  "deno/package.json",
  "deno/src/compile.ts",
  "deno/tsconfig.json",
  "esbuild/package.json",
  "esbuild/src/bundle.ts",
  "esbuild/tsconfig.json",
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

  it("documents direct installs, the exact Effect interval, and five packages", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    expect(readme).toContain(
      "bun add effect-build effect-build-bun effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108",
    );
    expect(readme).toContain(
      "bun add effect-build effect-build-esbuild effect-build-node-sea effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108",
    );
    expect(readme).toContain("`>=4.0.0-beta.104 <4.1.0-0`");
    expect(readme).not.toContain("4.0.0-beta.107");
    for (
      const name of [
        "effect-build",
        "effect-build-bun",
        "effect-build-deno",
        "effect-build-esbuild",
        "effect-build-node-sea",
      ]
    ) {
      expect(`${readme}\n${await readFile(resolve(root, `packages/${name}/README.md`), "utf8")}`).toContain(name);
    }
  });

  it("documents command compilers separately from granular integrations", async () => {
    const agents = await readFile(resolve(root, "AGENTS.md"), "utf8");
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    const index = await readFile(resolve(root, "docs/README.md"), "utf8");
    for (const text of [api, index]) {
      expect(text).toContain("compileExecutable");
      expect(text).toContain("compileExecutableMatrix");
      expect(text).toContain("withJavaScriptBundle");
      expect(text).toContain("createExecutable");
    }
    expect(agents).toContain("compileExecutable");
    expect(agents).toContain("compileExecutableMatrix");
    expect(agents).toContain("Architecture generation: `completion-release-program-v1`");
    expect(agents).toContain("Bun additionally exposes one scoped Node-resolution JavaScript-bundle continuation");
    expect(agents).toContain("Esbuild and Bun independently produce the core scoped JavaScript-bundle capability");
    expect(agents).not.toContain("granular-integration-migration-v2");
    expect(api).toContain("five packages with seven public entry points");
    expect(api).toContain("There is no root compile");
    expect(api).toContain("effect-build/Integration");
    expect(api).toContain("continuation-scoped capability");
    expect(api).toContain('import * as Esbuild from "effect-build-esbuild"');
    expect(api).toContain('import * as NodeSea from "effect-build-node-sea"');
    expect(api).toContain("cannot select Node 26.7 or a syntax-lowering level");
    expect(api).toContain("not a complete import closure");
  });

  it("documents the neutral Artifact and exact granular stage behavior", async () => {
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    expect(api).toContain("provider-neutral");
    expect(api).toContain("the main's exact stage prefix");
    expect(api).toContain("Esbuild 0.28.2");
    expect(api).toContain("Node 26.7.0");
    expect(api).toMatch(/not provenance, receipts, or\s+reproducibility claims/);
    expect(api).not.toMatch(/Artifact\.Artifact|Target\.Target/);
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
    expect(text).toMatch(/Malformed\s+untyped scalar inputs now fail/);
    expect(text).toMatch(/Valid TypeScript callers remain\s+source-compatible/);
    expect(text).toMatch(/freshly provided Layer still selects and probes[\s\S]*before scalar\s+request preflight/);
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
    expect(text).toContain("Esbuild 0.28.2");
    expect(text).toContain("Node 26.7.0");
    expect(text).toContain("Bun");
    expect(text).toMatch(/never\s+uses\s+postject/i);
    expect(text).toMatch(/never downloads|never downloads or installs/i);
    expect(architecture).toMatch(/four separate choices/i);
    expect(architecture).toMatch(/rejects inspection products, public receipts, semantic plans/);
    expect(text).toMatch(/private (?:operation directory|copy)/i);
    expect(text).toMatch(/resolution and builtins|resolution and builtin handling/i);
  });

  it("documents exact-source workflow authority and locked candidate evidence", async () => {
    const release = await readFile(resolve(root, "docs/release-security.md"), "utf8");
    expect(release).toMatch(/lowercase 40-hex/i);
    expect(release).toMatch(/before\s+repository-controlled code/i);
    expect(release).toContain("persist-credentials: false");
    expect(release).toMatch(/lock-only.*validate.*frozen install/is);
    expect(release).toMatch(/exact direct candidate tarball/i);
    expect(release).toMatch(/workspace.*link.*other file/is);
    expect(release).toContain("14");
    expect(release).toMatch(/manifest v2/i);
    expect(release).toMatch(/not\s+(?:a\s+)?hermeticity|does not claim hermeticity/i);
    expect(release).toMatch(/same exact tarball bytes/i);
    expect(release).not.toMatch(/npm publish|id-token:\s*write|NODE_AUTH_TOKEN/i);
  });

  it("rejects legacy package and release language in user-facing material", async () => {
    const text = [
      await readFile(resolve(root, "README.md"), "utf8"),
      await readFile(resolve(root, "AGENTS.md"), "utf8"),
      await readAll(docs, "docs"),
      await readAll(examples, "examples"),
    ].join("\n");
    expect(text).not.toMatch(
      /exactly three lockstep public packages|four public packages|publishes three packages|pnpm add|pnpm run|pnpm verify/i,
    );
    expect(text).not.toMatch(/one public operation|combined Node SEA provider|Effect\.all\(\[mac, linux\]/i);
    expect(text).not.toMatch(/(?:guarantees|provides) (?:hermeticity|reproducibility|provenance)/i);
    expect(text).toContain("effect-build/bun  -> effect-build-bun");
    expect(text).toContain("effect-build/deno -> effect-build-deno");
  });
});
