import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, {
    name?: string;
    if?: string;
    needs?: string | string[];
    permissions?: Record<string, string>;
    "continue-on-error"?: unknown;
    "runs-on"?: string;
    steps?: Array<{
      uses?: string;
      run?: string;
      env?: Record<string, string>;
      if?: string;
      "continue-on-error"?: boolean;
    }>;
    strategy?: {
      "fail-fast"?: boolean;
      matrix?: { runner?: string[]; compiler?: string[]; effect?: string[] };
    };
  }>;
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

const assertProviderTargets = (
  support: SupportMatrix,
  tables: Readonly<Record<string, readonly string[]>>,
): void => {
  for (const compiler of ["bun", "deno"] as const) {
    const targets = support.supportedCells
      .filter((cell) => cell.compiler === compiler)
      .map((cell) => cell.target);
    if (JSON.stringify(targets) !== JSON.stringify(tables[compiler])) {
      throw new Error(`${compiler} support cells differ from the provider target table`);
    }
  }
};

const jobRuns = (workflow: Workflow, name: string): string =>
  (workflow.jobs[name]?.steps ?? []).map((step) => step.run ?? "").join("\n");

const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];

const expectPinnedActionsWithoutEscapes = (workflow: Workflow): void => {
  for (const job of Object.values(workflow.jobs)) {
    expect(job.name).toBeUndefined();
    expect(job.if).toBeUndefined();
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps ?? []) {
      if (step.uses !== undefined) {
        expect(step.uses).toMatch(/^((actions\/checkout|actions\/setup-node|pnpm\/action-setup)@)[0-9a-f]{40}$/);
      }
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.if).toBeUndefined();
    }
  }
};

describe("tooling pins and CI contract", () => {
  it("validates the authored 12-cell manifest and its provider-table equality", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as SupportMatrix;
    const tooling = await loadScript<{
      validateSupportMatrix: (support: unknown) => unknown;
    }>("read-tooling.mjs");
    expect(() => tooling.validateSupportMatrix(manifest)).not.toThrow();

    const bun = await import(pathToFileURL(resolve(root, "dist/standalone/internal/BunTarget.js")).href) as {
      bunTargetTable: { Target: { literals: readonly string[] } };
    };
    const deno = await import(pathToFileURL(resolve(root, "dist/standalone/internal/DenoTarget.js")).href) as {
      denoTargetTable: { Target: { literals: readonly string[] } };
    };
    const tables = {
      bun: bun.bunTargetTable.Target.literals,
      deno: deno.denoTargetTable.Target.literals,
    };
    expect(tables.bun).toHaveLength(6);
    expect(tables.deno).toHaveLength(6);
    expect(() => assertProviderTargets(manifest, tables)).not.toThrow();

    const missing = structuredClone(manifest);
    missing.supportedCells.splice(0, 1);
    expect(() => assertProviderTargets(missing, tables)).toThrow(/bun support cells/);
    const extra = structuredClone(manifest);
    const firstDeno = extra.supportedCells.findIndex((cell) => cell.compiler === "deno");
    extra.supportedCells.splice(firstDeno + 3, 0, {
      orchestrator: "node",
      runner: "ubuntu-24.04",
      target: "linux-x64-musl",
      compiler: "deno",
    });
    expect(() => tooling.validateSupportMatrix(extra)).not.toThrow();
    expect(() => assertProviderTargets(extra, tables)).toThrow(/deno support cells/);
  });

  it("rejects malformed, duplicate, unknown, unordered, and widened support cells", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as SupportMatrix;
    const { validateSupportMatrix } = await loadScript<{
      validateSupportMatrix: (support: unknown) => unknown;
    }>("read-tooling.mjs");
    const rejected = (mutate: (support: SupportMatrix) => void, message: RegExp) => {
      const support = structuredClone(manifest);
      mutate(support);
      expect(() => validateSupportMatrix(support)).toThrow(message);
    };
    rejected((support) => support.supportedCells.push({ ...support.supportedCells[0]! }), /duplicate/);
    rejected((support) => support.supportedCells[0]!.compiler = "other", /unknown compiler/);
    rejected((support) => support.supportedCells[0]!.target = "linux-x64", /malformed canonical target/);
    rejected(
      (support) => Object.assign(support.supportedCells[0]!, { unexpected: true }),
      /exactly orchestrator, runner, target, and compiler/,
    );
    rejected((support) => support.supportedCells[0]!.orchestrator = "bun", /orchestrator must be node/);
    rejected((support) => support.supportedCells[0]!.runner = "macos-15", /runner must be ubuntu-24.04/);
    rejected((support) => support.supportedCells.reverse(), /ordered bun then deno|canonical target order/);
  });

  it("keeps provisioner selection closed to default, Bun-only, and Deno-only modes", async () => {
    const provisioner = await loadScript<{
      selectedToolNames: (argv: readonly string[]) => readonly string[];
      validateArchiveEntries: (stdout: string, tool: string) => readonly string[];
      provisionToolAssets: (
        argv: readonly string[],
        dependencies: Record<string, unknown>,
      ) => Promise<Map<string, string>>;
    }>("provision-tool-assets.mjs");
    expect(provisioner.selectedToolNames([])).toEqual(["bun", "deno", "denort"]);
    expect(provisioner.selectedToolNames(["--only", "bun"])).toEqual(["bun"]);
    expect(provisioner.selectedToolNames(["--only", "deno"])).toEqual(["deno"]);
    for (const argv of [["--only"], ["--only", "denort"], ["--only", "bun", "--only", "deno"], ["--url", "x"]]) {
      expect(() => provisioner.selectedToolNames(argv)).toThrow(/usage/);
    }
    expect(provisioner.validateArchiveEntries("deno\n", "deno")).toEqual(["deno"]);
    for (const listing of ["../escape\n", "/absolute\n", "nested/../../escape\n", "nested\\escape\n", ""]) {
      expect(() => provisioner.validateArchiveEntries(listing, "fixture")).toThrow(
        /unsafe archive entry|empty archive/,
      );
    }

    const asset = new TextEncoder().encode("checksummed fixture");
    const sha256 = createHash("sha256").update(asset).digest("hex");
    const pins = ["bun", "deno", "denort"].map((tool) => ({
      tool,
      version: "1.0.0",
      url: `https://fixtures.invalid/${tool}.zip`,
      sha256,
      member: tool,
    }));
    const run = async (argv: readonly string[], bytes = asset) => {
      const outputs: string[] = [];
      const extracts: Array<{ command: string; argv: readonly string[] }> = [];
      const stored = new Map<string, Uint8Array>();
      const result = await provisioner.provisionToolAssets(argv, {
        environment: { EFFECT_BUILD_TOOL_DIR: "/tmp/effect-build-provision-fixture" },
        loadTooling: async () => ({ pins: { tools: pins } }),
        fetchAsset: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }),
        execute: async (command: string, args: readonly string[]) => {
          extracts.push({ command, argv: args });
          const archiveName = args.at(-1)?.split("/").at(-1)?.replace(/\.zip$/, "") ?? "";
          return { stdout: args.includes("-Z1") ? `${archiveName}\n` : "", stderr: "" };
        },
        makeDirectory: async () => undefined,
        writeAsset: async (path: string, value: Uint8Array) => void stored.set(path, value),
        readAsset: async (path: string) => stored.get(path),
        makeExecutable: async () => undefined,
        output: (line: string) => outputs.push(line),
      });
      return { extracts, outputs, result };
    };
    const all = await run([]);
    expect([...all.result.keys()]).toEqual(["bun", "deno", "denort"]);
    expect(all.outputs.map((line) => line.split("=")[0])).toEqual(["bun", "deno", "denort"]);
    expect(all.extracts).toHaveLength(6);
    expect(all.extracts.every(({ command }) => command === "unzip")).toBe(true);
    expect(all.extracts.filter(({ argv }) => argv.includes("-o"))).toHaveLength(3);
    expect(all.extracts.filter(({ argv }) => argv.includes("-Z1"))).toHaveLength(3);
    const narrow = await run(["--only", "deno"]);
    expect([...narrow.result.keys()]).toEqual(["deno"]);
    expect(narrow.outputs).toHaveLength(1);
    expect(narrow.extracts).toHaveLength(2);
    await expect(run(["--only", "bun"], new TextEncoder().encode("wrong"))).rejects.toThrow(/checksum mismatch/);
  });

  it("rejects target verifier argument drift and accumulates every failed cell before cleanup", async () => {
    const verifier = await loadScript<{
      parseCompiler: (argv: readonly string[]) => string | undefined;
      parseProvisionedPaths: (stdout: string, expected: readonly string[]) => Map<string, string>;
      packageManagerInvocation: (
        environment: Record<string, string | undefined>,
        access?: (path: string, mode: number) => Promise<void>,
      ) => Promise<{
        executable: string;
        prefixArgs: readonly string[];
      }>;
      requireUbuntuCompatibleHost: (platform: string, architecture: string) => void;
      verifyTargetSupport: (
        options: Record<string, unknown>,
      ) => Promise<{ attempted: number; failures: readonly string[] }>;
    }>("verify-target-support.mjs");
    expect(verifier.parseCompiler([])).toBeUndefined();
    expect(verifier.parseCompiler(["--compiler", "bun"])).toBe("bun");
    expect(verifier.parseCompiler(["--compiler", "deno"])).toBe("deno");
    for (const argv of [["--compiler"], ["--compiler", "other"], ["--compiler", "bun", "--compiler", "deno"]]) {
      expect(() => verifier.parseCompiler(argv)).toThrow(/usage/);
    }
    expect(verifier.parseProvisionedPaths("bun=/tmp/bun\n", ["bun"])).toEqual(new Map([["bun", "/tmp/bun"]]));
    for (
      const output of [
        "",
        "bun=relative\n",
        "bun=/tmp/bun\nbun=/tmp/other\n",
        "deno=/tmp/deno\n",
        "diagnostic text\nbun=/tmp/bun\n",
      ]
    ) expect(() => verifier.parseProvisionedPaths(output, ["bun"])).toThrow();
    await expect(verifier.packageManagerInvocation({ npm_execpath: "/tmp/pnpm.cjs" })).resolves.toEqual({
      executable: process.execPath,
      prefixArgs: ["/tmp/pnpm.cjs"],
    });
    const accessed: string[] = [];
    await expect(verifier.packageManagerInvocation(
      { PATH: "/missing:/tools" },
      async (path: string) => {
        accessed.push(path);
        if (path !== "/tools/pnpm") throw new Error("missing");
      },
    )).resolves.toEqual({ executable: "/tools/pnpm", prefixArgs: [] });
    expect(accessed).toEqual(["/missing/pnpm", "/tools/pnpm"]);
    for (const npm_execpath of ["pnpm", "relative/pnpm.cjs"]) {
      await expect(verifier.packageManagerInvocation({ npm_execpath })).rejects.toThrow(/must be absolute/);
    }
    await expect(verifier.packageManagerInvocation({ PATH: "/missing" }, async () => {
      throw new Error("missing");
    })).rejects.toThrow(/pnpm was not found/);
    expect(() => verifier.requireUbuntuCompatibleHost("darwin", "arm64")).toThrow(/required Ubuntu CI gate/);
    expect(() => verifier.requireUbuntuCompatibleHost("linux", "arm64")).toThrow(/required Ubuntu CI gate/);

    const calls: Array<{ executable: string; argv: readonly string[]; env: Record<string, string | undefined> }> = [];
    let cleaned = "";
    const execute = async (executable: string, argv: readonly string[], options: { env: Record<string, string> }) => {
      calls.push({ executable, argv, env: options.env });
      if (argv.includes("provision-tool-assets.mjs") || argv[0]?.endsWith("provision-tool-assets.mjs")) {
        return { stdout: "bun=/tmp/effect-build-test-bun\n", stderr: "" };
      }
      const target = options.env.EFFECT_BUILD_TARGET;
      if (target === "macos-x64" || target === "windows-x64") throw new Error(`cell failed: ${target}`);
      return { stdout: "", stderr: "" };
    };
    await expect(verifier.verifyTargetSupport({
      compiler: "bun",
      platform: "linux",
      architecture: "x64",
      environment: {
        PATH: "/tools",
        DENORT_BIN: "/inherited/denort",
        EFFECT_BUILD_DENO_BIN: "/inherited/deno",
        BUN_INSTALL_CACHE_DIR: "/inherited/bun-cache",
        DENO_DIR: "/inherited/deno-cache",
      },
      packageManager: { executable: process.execPath, prefixArgs: ["/tmp/pnpm.cjs"] },
      execute,
      makeTemporaryDirectory: async () => "/tmp/effect-build-target-verifier-fixture",
      removeDirectory: async (path: string) => void (cleaned = path),
      log: () => undefined,
    })).rejects.toThrow(/macos-x64.*windows-x64/);
    const cells = calls.filter((call) => call.argv.includes("test:integration:target"));
    expect(cells).toHaveLength(6);
    expect(cells.every((call) => call.executable === process.execPath && call.argv[0] === "/tmp/pnpm.cjs")).toBe(true);
    expect(cells.map((call) => call.env.EFFECT_BUILD_TARGET)).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ]);
    expect(cells.every((call) => call.env.DENORT_BIN === undefined)).toBe(true);
    expect(cells.every((call) => call.env.BUN_INSTALL_CACHE_DIR?.startsWith(cleaned))).toBe(true);
    expect(cells.every((call) => call.env.DENO_DIR === undefined)).toBe(true);
    expect(cells.every((call) => call.env.EFFECT_BUILD_DENO_BIN === undefined)).toBe(true);
    expect(cleaned).toBe("/tmp/effect-build-target-verifier-fixture");

    const allCalls: typeof calls = [];
    let allCleaned = "";
    const allResult = await verifier.verifyTargetSupport({
      platform: "linux",
      architecture: "x64",
      environment: {
        PATH: "/tools",
        DENORT_BIN: "/inherited/denort",
        EFFECT_BUILD_BUN_BIN: "/inherited/bun",
        EFFECT_BUILD_DENO_BIN: "/inherited/deno",
        BUN_INSTALL_CACHE_DIR: "/inherited/bun-cache",
        DENO_DIR: "/inherited/deno-cache",
      },
      packageManager: { executable: "/tools/pnpm", prefixArgs: [] },
      execute: async (executable: string, argv: readonly string[], options: { env: Record<string, string> }) => {
        allCalls.push({ executable, argv, env: options.env });
        if (argv[0]?.endsWith("provision-tool-assets.mjs")) {
          const compiler = argv.at(-1);
          return { stdout: `${compiler}=/tmp/effect-build-test-${compiler}\n`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      makeTemporaryDirectory: async () => "/tmp/effect-build-all-targets-fixture",
      removeDirectory: async (path: string) => void (allCleaned = path),
      log: () => undefined,
    });
    expect(allResult).toEqual({ attempted: 12, failures: [] });
    const provisionCalls = allCalls.filter((call) => call.argv[0]?.endsWith("provision-tool-assets.mjs"));
    expect(provisionCalls.map((call) => call.argv.slice(-2))).toEqual([
      ["--only", "bun"],
      ["--only", "deno"],
    ]);
    const allCells = allCalls.filter((call) => call.argv.includes("test:integration:target"));
    expect(allCells).toHaveLength(12);
    const bunCells = allCells.filter((call) => call.env.EFFECT_BUILD_TARGET_COMPILER === "bun");
    const denoCells = allCells.filter((call) => call.env.EFFECT_BUILD_TARGET_COMPILER === "deno");
    expect(bunCells).toHaveLength(6);
    expect(denoCells).toHaveLength(6);
    expect(allCells.every((call) => call.env.DENORT_BIN === undefined)).toBe(true);
    expect(bunCells.every((call) => call.env.BUN_INSTALL_CACHE_DIR?.startsWith(allCleaned))).toBe(true);
    expect(bunCells.every((call) => call.env.DENO_DIR === undefined)).toBe(true);
    expect(denoCells.every((call) => call.env.DENO_DIR?.startsWith(allCleaned))).toBe(true);
    expect(denoCells.every((call) => call.env.BUN_INSTALL_CACHE_DIR === undefined)).toBe(true);
    expect(allCleaned).toBe("/tmp/effect-build-all-targets-fixture");
  });

  it("keeps one strict external-oracle target cell and no production-parser shortcut", async () => {
    const source = await readFile(resolve(root, "test/integration/standalone-target-support.test.ts"), "utf8");
    expect(source.match(/\bit\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/\.skip\b|inspectNativeExecutable|NativeExecutable\.js/);
    expect(source).toContain('["--brief", "-P", "elf_shsize=268435456", "--", path]');
    for (const flags of ['["-hW", path]', '["-lW", path]', '["-VW", path]']) expect(source).toContain(flags);
    expect(source).toContain('LC_ALL: "C"');
    expect(source).toContain("digest: true");

    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["test:integration:target"]).toBe(
      "vitest run test/integration/standalone-target-support.test.ts",
    );
    expect(packageJson.scripts["test:integration:cross-target"]).toBeUndefined();
    expect(packageJson.scripts["verify:targets"]).toBe("node scripts/verify-target-support.mjs");
  });

  it("keeps authored tool pins as checksummed CI fixtures", async () => {
    const pins = JSON.parse(await readFile(resolve(root, "tooling/tool-pins.json"), "utf8")) as {
      tools: Array<{ tool: string; version: string; sha256: string; url: string; member: string }>;
    };
    expect(pins.tools.map((pin) => pin.tool).sort()).toEqual(["bun", "deno", "denort"]);
    for (const pin of pins.tools) {
      expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.url).toMatch(/^https:\/\/github\.com\//);
      expect(pin.member.length).toBeGreaterThan(0);
    }
    expect(Object.fromEntries(pins.tools.map((pin) => [pin.tool, pin.member]))).toEqual({
      bun: "bun-linux-x64/bun",
      deno: "deno",
      denort: "denort",
    });
    const support = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as {
      compilerFixtures: Array<{ tool: string; version: string }>;
    };
    expect(support.compilerFixtures).toEqual(
      pins.tools
        .filter((pin) => pin.tool === "bun" || pin.tool === "deno")
        .map(({ tool, version }) => ({ tool, version })),
    );
  });

  it("keeps the evidenced Effect 4.0 peer range and exact current development family", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.peerDependencies).toEqual({ effect: ">=4.0.0-beta.104 <4.1.0-0" });
    for (
      const dependency of [
        "effect",
        "@effect/platform-bun",
        "@effect/platform-deno",
        "@effect/platform-node",
      ]
    ) {
      expect(packageJson.devDependencies?.[dependency]).toBe("4.0.0-rc.108");
    }
    for (const platform of ["@effect/platform-bun", "@effect/platform-deno", "@effect/platform-node"]) {
      expect(packageJson.dependencies?.[platform]).toBeUndefined();
      expect(packageJson.peerDependencies?.[platform]).toBeUndefined();
    }
    expect(packageJson.scripts?.["verify:effect"]).toBe("node scripts/verify-effect-compatibility.mjs --all");
  });

  it("keeps Effect endpoint selection exact and rewrites only the temporary development family", async () => {
    const verifier = await loadScript<{
      effectEndpoints: readonly string[];
      parseArguments: (argv: readonly string[]) => readonly string[];
      rewriteManifest: (manifest: Record<string, unknown>, version: string) => Record<string, unknown>;
      selectCompatibilityTemporaryDirectory: (path: string, platform: string) => string;
      shouldCopyRepositoryPath: (path: string) => boolean;
      verifyEffectEndpoint: (version: string, dependencies: Record<string, unknown>) => Promise<void>;
    }>("verify-effect-compatibility.mjs");
    expect(verifier.effectEndpoints).toEqual(effectEndpoints);
    expect(verifier.parseArguments(["--all"])).toEqual(effectEndpoints);
    for (const endpoint of effectEndpoints) {
      expect(verifier.parseArguments(["--effect-version", endpoint])).toEqual([endpoint]);
    }
    for (
      const argv of [
        [],
        ["--effect-version"],
        ["--effect-version", "4.0.0-beta.103"],
        ["--effect-version", ">=4"],
        ["--all", "extra"],
        ["--all", "--effect-version", effectEndpoints[0]!],
        ["--effect-version", effectEndpoints[0]!, "--effect-version", effectEndpoints[1]!],
      ]
    ) expect(() => verifier.parseArguments(argv)).toThrow(/exact Effect endpoints/);

    const manifest = {
      peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
      devDependencies: {
        effect: "old",
        "@effect/platform-bun": "old",
        "@effect/platform-deno": "old",
        "@effect/platform-node": "old",
        typescript: "6.0.3",
      },
    };
    const rewritten = verifier.rewriteManifest(manifest, effectEndpoints[0]!) as typeof manifest;
    expect(rewritten.peerDependencies).toEqual(manifest.peerDependencies);
    expect(rewritten.devDependencies.typescript).toBe("6.0.3");
    for (
      const dependency of [
        "effect",
        "@effect/platform-bun",
        "@effect/platform-deno",
        "@effect/platform-node",
      ]
    ) expect(rewritten.devDependencies[dependency as keyof typeof rewritten.devDependencies]).toBe(effectEndpoints[0]);
    expect(manifest.devDependencies.effect).toBe("old");
    expect(verifier.shouldCopyRepositoryPath(resolve(root, ".agent-sources/effect"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "node_modules/effect"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "dist/index.js"))).toBe(false);
    expect(
      verifier.shouldCopyRepositoryPath(resolve(root, "effect-build-effect-compatibility-fixture/repository")),
    ).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "src/index.ts"))).toBe(true);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "uncommitted-plan.tsbuildinfo"))).toBe(false);
    expect(verifier.selectCompatibilityTemporaryDirectory(resolve(root, ".cache/tmp"), "linux")).toBe(resolve("/tmp"));

    const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-effect-compatibility-"));
    const calls: Array<{ argv: readonly string[]; options: { cwd: string; env: Record<string, string> } }> = [];
    await verifier.verifyEffectEndpoint(effectEndpoints[0]!, {
      makeTemporaryDirectory: async () => temporaryRoot,
      copyRepository: async (destination: string) => {
        await mkdir(destination, { recursive: true });
        await writeFile(
          resolve(destination, "package.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );
      },
      packageManager: { executable: "/fixture/pnpm", prefix: [] },
      environment: { PATH: "/fixture", SENTINEL: "preserved" },
      execute: async (
        _executable: string,
        argv: readonly string[],
        options: { cwd: string; env: Record<string, string> },
      ) => {
        calls.push({ argv, options });
      },
      removeDirectory: async (path: string) => rm(path, { recursive: true, force: true }),
    });
    expect(calls.map(({ argv }) => argv)).toEqual([
      ["install", "--no-frozen-lockfile", "--strict-peer-dependencies"],
      ["check"],
      ["test:types"],
      ["test:unit"],
      ["test:consumer:fresh"],
    ]);
    expect(calls.every(({ options }) => options.cwd === resolve(temporaryRoot, "repository"))).toBe(true);
    expect(calls.every(({ options }) => options.env.SENTINEL === "preserved")).toBe(true);
    expect(calls.every(({ options }) =>
      options.env.npm_config_store_dir === resolve(temporaryRoot, "cache/pnpm-store")
      && options.env.npm_config_cache === resolve(temporaryRoot, "cache/npm")
    )).toBe(true);

    const failingTemporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-effect-compatibility-"));
    try {
      const failed = verifier.verifyEffectEndpoint(effectEndpoints[0]!, {
        makeTemporaryDirectory: async () => failingTemporaryRoot,
        copyRepository: async (destination: string) => {
          await mkdir(destination, { recursive: true });
          await writeFile(resolve(destination, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
        },
        packageManager: { executable: "/fixture/pnpm", prefix: [] },
        environment: { PATH: "/fixture" },
        execute: async () => {
          throw new Error("command sentinel");
        },
        removeDirectory: async () => {
          throw new Error("cleanup sentinel");
        },
      });
      await expect(failed).rejects.toThrow(
        /Effect 4\.0\.0-beta\.104 failed pnpm install.*cleanup failed: cleanup sentinel/,
      );
    } finally {
      await rm(failingTemporaryRoot, { recursive: true, force: true });
    }
  });

  it("requires deterministic, real-tool, and publication jobs without escape hatches", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });

    expectPinnedActionsWithoutEscapes(workflow);

    expect(jobRuns(workflow, "quality")).toContain("pnpm verify");
    expect(jobRuns(workflow, "real-tools")).toMatch(/pnpm (verify:real|test:integration:real)/);
    expect(jobRuns(workflow, "real-tools")).toContain("provision-tool-assets.mjs");
    const realTools = workflow.jobs["real-tools"]?.steps?.find((step) => step.run?.includes("verify:real"));
    expect(realTools?.env?.EFFECT_BUILD_EXPECTED_TARGET).toBe("linux-x64-gnu");

    const support = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as SupportMatrix;
    expect(support.supportedCells).toHaveLength(12);
    const matrix = workflow.jobs["publication-hosts"]?.strategy?.matrix?.runner ?? [];
    expect([...matrix].sort()).toEqual([...support.publicationHosts].sort());
    expect(jobRuns(workflow, "publication-hosts")).toContain("pnpm test:publication");

    const targetSupport = workflow.jobs["target-support"];
    expect(targetSupport?.["runs-on"]).toBe("ubuntu-24.04");
    expect(targetSupport?.strategy).toEqual({ "fail-fast": false, matrix: { compiler: ["bun", "deno"] } });
    expect(jobRuns(workflow, "target-support")).toContain(
      "node scripts/verify-target-support.mjs --compiler ${{ matrix.compiler }}",
    );
    expect(jobRuns(workflow, "target-support")).not.toMatch(/macos-|linux-|windows-|DENORT_BIN/);
    expect(JSON.stringify(targetSupport)).not.toContain("DENORT_BIN");
    expect(JSON.stringify(targetSupport)).not.toMatch(/(?:macos|linux|windows)-(?:x64|aarch64)/);

    const effectCompatibility = workflow.jobs["effect-compatibility"];
    expect(effectCompatibility?.["runs-on"]).toBe("ubuntu-24.04");
    expect(effectCompatibility?.strategy).toEqual({
      "fail-fast": false,
      matrix: { effect: effectEndpoints },
    });
    expect(effectCompatibility?.steps?.filter((step) => step.run !== undefined)).toEqual([
      { run: "node scripts/verify-effect-compatibility.mjs --effect-version ${{ matrix.effect }}" },
    ]);
  });

  it("keeps npm publication explicit, version-tagged, and provenance-bearing", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      private?: boolean;
      license?: string;
      repository?: { url?: string };
      publishConfig?: { access?: string; provenance?: boolean };
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.repository?.url).toBe("git+https://github.com/mannyc2/effect-build.git");
    expect(packageJson.publishConfig).toEqual({ access: "public", provenance: true });
    expect(packageJson.scripts?.prepack).toBe("pnpm build");

    const workflow = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    expect(workflow.on).toEqual({ push: { tags: ["v*.*.*"] } });
    expect(workflow.permissions).toEqual({ contents: "read" });

    expectPinnedActionsWithoutEscapes(workflow);

    expect(workflow.jobs.quality?.needs).toBe("preflight");
    expect(workflow.jobs["real-tools"]?.needs).toBe("preflight");
    expect(workflow.jobs["publication-hosts"]?.needs).toBe("preflight");
    expect(workflow.jobs["target-support"]?.needs).toBe("preflight");
    expect(workflow.jobs["effect-compatibility"]?.needs).toBe("preflight");
    expect(workflow.jobs["target-support"]?.["runs-on"]).toBe("ubuntu-24.04");
    expect(workflow.jobs["target-support"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { compiler: ["bun", "deno"] },
    });
    expect(jobRuns(workflow, "target-support")).toContain(
      "node scripts/verify-target-support.mjs --compiler ${{ matrix.compiler }}",
    );
    expect(jobRuns(workflow, "target-support")).not.toMatch(/macos-|linux-|windows-|DENORT_BIN/);
    expect(JSON.stringify(workflow.jobs["target-support"])).not.toContain("DENORT_BIN");
    expect(JSON.stringify(workflow.jobs["target-support"])).not.toMatch(
      /(?:macos|linux|windows)-(?:x64|aarch64)/,
    );
    expect(workflow.jobs["effect-compatibility"]?.["runs-on"]).toBe("ubuntu-24.04");
    expect(workflow.jobs["effect-compatibility"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { effect: effectEndpoints },
    });
    expect(workflow.jobs["effect-compatibility"]?.steps?.filter((step) => step.run !== undefined)).toEqual([
      { run: "node scripts/verify-effect-compatibility.mjs --effect-version ${{ matrix.effect }}" },
    ]);
    const preflightRuns = (workflow.jobs.preflight?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(preflightRuns).toContain("GITHUB_REF_NAME");
    expect(preflightRuns).toContain("refs/remotes/origin/main");

    expect(workflow.jobs["publish-npm"]?.needs).toEqual([
      "quality",
      "real-tools",
      "publication-hosts",
      "target-support",
      "effect-compatibility",
    ]);
    expect(workflow.jobs["publish-npm"]?.permissions).toEqual({ contents: "read", "id-token": "write" });
    const releaseRealTools = workflow.jobs["real-tools"]?.steps?.find((step) => step.run?.includes("verify:real"));
    expect(releaseRealTools?.env?.EFFECT_BUILD_EXPECTED_TARGET).toBe("linux-x64-gnu");
    const steps = workflow.jobs["publish-npm"]?.steps ?? [];
    const runs = steps.map((step) => step.run ?? "").join("\n");
    expect(runs).toContain("npm publish --access public --provenance");
    const publish = steps.find((step) => step.run?.includes("npm publish"));
    expect(publish?.env).toEqual({ NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" });

    expect(workflow.jobs["github-release"]?.needs).toBe("publish-npm");
    expect(workflow.jobs["github-release"]?.permissions).toEqual({ contents: "write" });
    const githubReleaseRuns = (workflow.jobs["github-release"]?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(githubReleaseRuns).toContain("gh release view");
    expect(githubReleaseRuns).toContain("gh release create");
  });
});
