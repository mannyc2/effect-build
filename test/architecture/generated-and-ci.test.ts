import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);
const publicPackages = ["effect-build", "effect-build-bun", "effect-build-deno", "effect-build-node-sea"] as const;
const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];

interface WorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  if?: string;
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  "continue-on-error"?: unknown;
  "runs-on"?: string;
  steps?: WorkflowStep[];
  strategy?: { "fail-fast"?: boolean; matrix?: { runner?: string[]; compiler?: string[]; effect?: string[] } };
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

interface SupportCell {
  orchestrator: string;
  runner: string;
  target: string;
  compiler: string;
}

interface SupportMatrix {
  publicationHosts: string[];
  supportedCells: SupportCell[];
}

const loadScript = async <T>(name: string): Promise<T> =>
  await import(pathToFileURL(resolve(root, "scripts", name)).href) as T;

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<string, unknown>;

const jobRuns = (workflow: Workflow, name: string): string =>
  (workflow.jobs[name]?.steps ?? []).map((step) => step.run ?? "").join("\n");

const expectPinnedActionsWithoutEscapes = (workflow: Workflow): void => {
  for (const job of Object.values(workflow.jobs)) {
    expect(job.if).toBeUndefined();
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps ?? []) {
      if (step.uses !== undefined) {
        expect(step.uses).toMatch(
          /^(?:actions\/(?:checkout|setup-node|upload-artifact)|oven-sh\/setup-bun)@[0-9a-f]{40}$/,
        );
      }
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.if).toBeUndefined();
    }
  }
};

describe("tooling pins and workflow contracts", () => {
  it("validates the authored 12-cell Bun/Deno support matrix against core authority", async () => {
    const support = await readJson("tooling/support-matrix.json") as unknown as SupportMatrix;
    const { validateSupportMatrix } = await loadScript<{ validateSupportMatrix: (value: unknown) => unknown }>(
      "read-tooling.mjs",
    );
    expect(() => validateSupportMatrix(support)).not.toThrow();
    expect(support.supportedCells).toHaveLength(12);

    const { ProviderContracts } = await import(
      pathToFileURL(resolve(root, "packages/effect-build/dist/internal/ProviderContracts.js")).href
    ) as { ProviderContracts: Record<string, readonly string[]> };
    for (const compiler of ["bun", "deno"]) {
      expect(support.supportedCells.filter((cell) => cell.compiler === compiler).map((cell) => cell.target)).toEqual(
        ProviderContracts[compiler],
      );
    }
    expect(ProviderContracts["node-sea"]).toEqual(["linux-x64-gnu"]);

    const malformed = structuredClone(support);
    malformed.supportedCells[0]!.compiler = "other";
    expect(() => validateSupportMatrix(malformed)).toThrow(/unknown compiler/);
    const duplicate = structuredClone(support);
    duplicate.supportedCells.push({ ...duplicate.supportedCells[0]! });
    expect(() => validateSupportMatrix(duplicate)).toThrow(/duplicate/);
    const unordered = structuredClone(support);
    unordered.supportedCells.reverse();
    expect(() => validateSupportMatrix(unordered)).toThrow(/ordered bun then deno|canonical target order/);
  });

  it("keeps provisioned compiler fixtures selected, checksummed, and closed", async () => {
    const provisioner = await loadScript<{
      selectedToolNames: (argv: readonly string[]) => readonly string[];
      provisionToolAssets: (
        argv: readonly string[],
        dependencies: Record<string, unknown>,
      ) => Promise<Map<string, string>>;
    }>("provision-tool-assets.mjs");
    expect(provisioner.selectedToolNames([])).toEqual(["bun", "deno", "denort"]);
    expect(provisioner.selectedToolNames(["--only", "bun"])).toEqual(["bun"]);
    expect(provisioner.selectedToolNames(["--only", "deno"])).toEqual(["deno"]);
    for (const argv of [["--only"], ["--only", "node-sea"], ["--url", "x"]]) {
      expect(() => provisioner.selectedToolNames(argv)).toThrow(/usage/);
    }

    const bytes = new TextEncoder().encode("fixture");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const pins = ["bun", "deno", "denort"].map((tool) => ({
      tool,
      version: "1.0.0",
      url: `https://fixtures.invalid/${tool}.zip`,
      sha256,
      member: tool,
    }));
    const stored = new Map<string, Uint8Array>();
    const result = await provisioner.provisionToolAssets(["--only", "bun"], {
      environment: { EFFECT_BUILD_TOOL_DIR: "/tmp/effect-build-provision-fixture" },
      loadTooling: async () => ({ pins: { tools: pins } }),
      fetchAsset: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }),
      execute: async (_command: string, argv: readonly string[]) => ({
        stdout: argv.includes("-Z1") ? "bun\n" : "",
        stderr: "",
      }),
      makeDirectory: async () => undefined,
      writeAsset: async (path: string, value: Uint8Array) => void stored.set(path, value),
      readAsset: async (path: string) => stored.get(path),
      makeExecutable: async () => undefined,
      output: () => undefined,
    });
    expect([...result.keys()]).toEqual(["bun"]);
    const authored = await readJson("tooling/tool-pins.json") as { tools: Array<Record<string, string>> };
    expect(authored.tools.map((pin) => pin.tool)).toEqual(["bun", "deno", "denort"]);
    for (const pin of authored.tools) expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("runs all target cells through exact Bun 1.3.14 and cleans isolated tool state", async () => {
    const verifier = await loadScript<{
      parseCompiler: (argv: readonly string[]) => string | undefined;
      packageManagerInvocation: (
        environment: Record<string, string | undefined>,
        access?: (path: string, mode: number) => Promise<void>,
        probe?: (path: string) => Promise<{ stdout: string }>,
      ) => Promise<{ executable: string }>;
      verifyTargetSupport: (options: Record<string, unknown>) => Promise<{ attempted: number; failures: string[] }>;
    }>("verify-target-support.mjs");
    expect(verifier.parseCompiler([])).toBeUndefined();
    expect(verifier.parseCompiler(["--compiler", "bun"])).toBe("bun");
    expect(() => verifier.parseCompiler(["--compiler", "node-sea"])).toThrow(/usage/);
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/bun" },
      async () => undefined,
      async () => ({ stdout: "1.3.14\n" }),
    )).resolves.toEqual({ executable: "/tools/bun" });
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/pnpm" },
      async () => undefined,
      async () => ({ stdout: "1.3.14\n" }),
    )).rejects.toThrow(/identify Bun/);

    const calls: Array<{ executable: string; argv: readonly string[]; env: Record<string, string> }> = [];
    let cleaned = "";
    const result = await verifier.verifyTargetSupport({
      platform: "linux",
      architecture: "x64",
      environment: { PATH: "/tools" },
      packageManager: { executable: "/tools/bun" },
      execute: async (executable: string, argv: readonly string[], options: { env: Record<string, string> }) => {
        calls.push({ executable, argv, env: options.env });
        if (argv[0]?.endsWith("provision-tool-assets.mjs")) {
          return { stdout: `${argv.at(-1)}=/tmp/${argv.at(-1)}\n`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      makeTemporaryDirectory: async () => "/tmp/effect-build-target-verifier-fixture",
      removeDirectory: async (path: string) => void (cleaned = path),
      log: () => undefined,
    });
    expect(result).toEqual({ attempted: 12, failures: [] });
    const cells = calls.filter(({ argv }) => argv.includes("test:integration:target"));
    expect(cells).toHaveLength(12);
    expect(cells.every(({ executable, argv }) => executable === "/tools/bun" && argv[0] === "run")).toBe(true);
    expect(cleaned).toBe("/tmp/effect-build-target-verifier-fixture");
  });

  it("pins the exact Effect family and every public package contract", async () => {
    const rootManifest = await readJson("package.json") as {
      private: boolean;
      packageManager: string;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(rootManifest.private).toBe(true);
    expect(rootManifest.packageManager).toBe("bun@1.3.14");
    for (const dependency of ["effect", "@effect/platform-bun", "@effect/platform-deno", "@effect/platform-node"]) {
      expect(rootManifest.devDependencies[dependency]).toBe("4.0.0-rc.108");
    }
    expect(rootManifest.scripts["verify:effect"]).toBe("node scripts/verify-effect-compatibility.mjs --all");
    expect(rootManifest.scripts["test:integration:node-sea"]).toBe("vitest run test/integration/node-sea.test.ts");

    for (const name of publicPackages) {
      const manifest = await readJson(`packages/${name}/package.json`) as {
        version: string;
        peerDependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(manifest.version).toBe("0.3.0");
      expect(manifest.peerDependencies).toEqual({ effect: ">=4.0.0-beta.104 <4.1.0-0" });
      expect(manifest.devDependencies.effect).toBe("4.0.0-rc.108");
    }
    const nodeSea = await readJson("packages/effect-build-node-sea/package.json") as {
      dependencies: Record<string, string>;
    };
    expect(nodeSea.dependencies).toEqual({ "effect-build": "workspace:^", esbuild: "0.28.2" });
  });

  it("keeps Node SEA a public provider with exact producer and bundle literals", async () => {
    const nodeSea = await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/NodeSea.ts"), "utf8");
    const esbuild = await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/Esbuild.ts"), "utf8");
    const adapter = await readFile(resolve(root, "packages/effect-build-node-sea/src/Adapter.ts"), "utf8");
    expect(nodeSea).toMatch(/nodeSeaVersion\s*=\s*"26\.7\.0"\s+as const/);
    expect(nodeSea).toMatch(/nodeSeaSyntaxTarget\s*=\s*"node26\.7"\s+as const/);
    expect(nodeSea).toMatch(/nodeSeaTarget\s*=\s*"linux-x64-gnu"\s+as const/);
    expect(esbuild).toMatch(/expectedVersion\s*=\s*"0\.28\.2"\s+as const/);
    expect(esbuild).toMatch(/nodeSyntaxTarget\s*=\s*"node26\.7"\s+as const/);
    expect(adapter).toContain('kind: "composed"');
    expect(adapter).toContain('defaultTarget: "linux-x64-gnu"');
    expect(`${nodeSea}\n${esbuild}`).not.toMatch(/postject|download|curl|wget|https?:\/\//i);
  });

  it("keeps Effect endpoint verification exact, Bun-only, and isolated", async () => {
    const verifier = await loadScript<{
      effectEndpoints: readonly string[];
      parseArguments: (argv: readonly string[]) => readonly string[];
      rewriteManifest: (manifest: Record<string, unknown>, version: string) => Record<string, unknown>;
      shouldCopyRepositoryPath: (path: string) => boolean;
      verifyEffectEndpoint: (version: string, dependencies: Record<string, unknown>) => Promise<void>;
    }>("verify-effect-compatibility.mjs");
    expect(verifier.effectEndpoints).toEqual(effectEndpoints);
    expect(verifier.parseArguments(["--all"])).toEqual(effectEndpoints);
    for (const endpoint of effectEndpoints) {
      expect(verifier.parseArguments(["--effect-version", endpoint])).toEqual([endpoint]);
    }
    for (const argv of [[], ["--effect-version", "4.0.0-beta.103"], ["--all", "extra"]]) {
      expect(() => verifier.parseArguments(argv)).toThrow(/exact Effect endpoints/);
    }
    const manifest = {
      peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
      devDependencies: { effect: "old", typescript: "6.0.3" },
    };
    const rewritten = verifier.rewriteManifest(manifest, effectEndpoints[0]!) as typeof manifest;
    expect(rewritten.peerDependencies).toEqual(manifest.peerDependencies);
    expect(rewritten.devDependencies).toEqual({ effect: effectEndpoints[0], typescript: "6.0.3" });
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "node_modules/effect"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "packages/effect-build/src/index.ts"))).toBe(true);

    const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-effect-compatibility-"));
    const calls: Array<{ executable: string; argv: readonly string[]; cwd: string; env: Record<string, string> }> = [];
    await verifier.verifyEffectEndpoint(effectEndpoints[0]!, {
      makeTemporaryDirectory: async () => temporaryRoot,
      copyRepository: async (destination: string) => {
        for (
          const path of [
            "packages/effect-build/package.json",
            "packages/effect-build-bun/package.json",
            "packages/effect-build-deno/package.json",
            "packages/effect-build-node-sea/package.json",
            "examples/bun/package.json",
            "examples/deno/package.json",
            "examples/node-sea/package.json",
          ]
        ) {
          await mkdir(resolve(destination, path, ".."), { recursive: true });
          await writeFile(resolve(destination, path), `${JSON.stringify(manifest)}\n`);
        }
        await writeFile(resolve(destination, "package.json"), `${JSON.stringify(manifest)}\n`);
      },
      packageManager: { executable: "/fixture/bun" },
      environment: { PATH: "/fixture", SENTINEL: "preserved" },
      execute: async (
        executable: string,
        argv: readonly string[],
        options: { cwd: string; env: Record<string, string> },
      ) => {
        calls.push({ executable, argv, cwd: options.cwd, env: options.env });
      },
      removeDirectory: async (path: string) => rm(path, { recursive: true, force: true }),
    });
    expect(calls.map(({ argv }) => argv)).toEqual([
      ["install", "--cache-dir", resolve(temporaryRoot, "cache/bun")],
      ["run", "build"],
      ["run", "check"],
      ["run", "test:types"],
      ["run", "test:unit"],
      ["run", "test:consumer:fresh"],
    ]);
    expect(calls.every(({ executable, cwd, env }) =>
      executable === "/fixture/bun"
      && cwd === resolve(temporaryRoot, "repository")
      && env.SENTINEL === "preserved"
      && env.BUN_INSTALL_CACHE_DIR === resolve(temporaryRoot, "cache/bun")
    )).toBe(true);
  });

  it("requires every independent CI axis with exact Bun setup and no escape hatches", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual([
      "quality",
      "node-sea",
      "real-tools",
      "target-support",
      "effect-compatibility",
      "publication-hosts",
    ]);
    expectPinnedActionsWithoutEscapes(workflow);
    for (const job of Object.keys(workflow.jobs)) {
      expect(JSON.stringify(workflow.jobs[job])).not.toMatch(/pnpm|yarn|continue-on-error/i);
    }
    expect(jobRuns(workflow, "quality")).toContain("bun run verify");
    expect(jobRuns(workflow, "real-tools")).toContain("bun run verify:real");
    expect(workflow.jobs["target-support"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { compiler: ["bun", "deno"] },
    });
    expect(workflow.jobs["effect-compatibility"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { effect: effectEndpoints },
    });
    const support = await readJson("tooling/support-matrix.json") as unknown as SupportMatrix;
    expect(workflow.jobs["publication-hosts"]?.strategy?.matrix?.runner).toEqual(support.publicationHosts);
    expect(jobRuns(workflow, "node-sea")).toContain('test "$(node --version)" = "v26.7.0"');
    expect(jobRuns(workflow, "node-sea")).toContain("bun run test:integration:node-sea");
    expect(workflow.jobs["node-sea"]?.steps?.find((step) => step.run === "bun run test:integration:node-sea")?.env)
      .toEqual({ EFFECT_BUILD_NODE_SEA_BIN: "${{ steps.node26.outputs.path }}" });
  });

  it("keeps release preparation non-mutating and emits one four-package candidate", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    expect(workflow.on).toEqual({
      workflow_dispatch: {
        inputs: {
          commit: { description: "Exact 40-character source commit", required: true, type: "string" },
        },
      },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["node-sea", "candidate"]);
    expect(workflow.jobs.candidate?.needs).toBe("node-sea");
    expectPinnedActionsWithoutEscapes(workflow);
    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(source).toContain("node scripts/test-built-consumer.mjs --candidate-dir");
    expect(source).toContain("effect-build-0.3.0-candidate");
    expect(source).toContain("bun run verify:effect");
    expect(source).not.toMatch(/npm publish|gh release|git tag|ts-release|NODE_AUTH_TOKEN|id-token:\s*write/i);
    const consumer = await readFile(resolve(root, "scripts/test-built-consumer.mjs"), "utf8");
    for (const name of publicPackages) expect(consumer).toContain(JSON.stringify(name));
    expect(consumer).toContain('console.log("packed consumers verified: 8/8")');
  });
});
