import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);
const setupBun = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6";
const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];
const workspaceManifests = [
  "package.json",
  "packages/effect-build/package.json",
  "packages/effect-build-bun/package.json",
  "packages/effect-build-deno/package.json",
  "examples/bun/package.json",
  "examples/deno/package.json",
];

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
      name?: string;
      id?: string;
      uses?: string;
      run?: string;
      env?: Record<string, string>;
      with?: Record<string, unknown>;
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

const jobRuns = (workflow: Workflow, name: string): string =>
  (workflow.jobs[name]?.steps ?? []).map((step) => step.run ?? "").join("\n");

const expectPinnedActionsWithoutEscapes = (workflow: Workflow): void => {
  for (const job of Object.values(workflow.jobs)) {
    expect(job.name).toBeUndefined();
    expect(job.if).toBeUndefined();
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps ?? []) {
      if (step.uses !== undefined) {
        expect(step.uses).toMatch(
          /^((actions\/checkout|actions\/setup-node|oven-sh\/setup-bun|actions\/upload-artifact)@)[0-9a-f]{40}$/,
        );
      }
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.if).toBeUndefined();
    }
  }
};

const assertProviderTargets = (
  support: SupportMatrix,
  tables: Readonly<Record<string, readonly string[]>>,
): void => {
  for (const compiler of ["bun", "deno"] as const) {
    const targets = support.supportedCells
      .filter((cell) => cell.compiler === compiler)
      .map((cell) => cell.target);
    if (JSON.stringify(targets) !== JSON.stringify(tables[compiler])) {
      throw new Error(`${compiler} support cells differ from the provider target contract`);
    }
  }
};

describe("tooling pins and CI contract", () => {
  it("validates the 12-cell manifest against the public provider schemas", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as SupportMatrix;
    const tooling = await loadScript<{ validateSupportMatrix: (support: unknown) => unknown }>("read-tooling.mjs");
    expect(() => tooling.validateSupportMatrix(manifest)).not.toThrow();
    const bun = await import("effect-build-bun");
    const deno = await import("effect-build-deno");
    const tables = { bun: bun.Target.literals, deno: deno.Target.literals };
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
    const { validateSupportMatrix } = await loadScript<{ validateSupportMatrix: (support: unknown) => unknown }>(
      "read-tooling.mjs",
    );
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

  it("keeps the checksummed compiler provisioner closed to its supported selections", async () => {
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
    const outputs: string[] = [];
    const result = await provisioner.provisionToolAssets(["--only", "bun"], {
      environment: { EFFECT_BUILD_TOOL_DIR: "/tmp/effect-build-provision-fixture" },
      loadTooling: async () => ({ pins: { tools: pins } }),
      fetchAsset: async () => ({ ok: true, status: 200, arrayBuffer: async () => asset.buffer }),
      execute: async (_command: string, args: readonly string[]) => ({
        stdout: args.includes("-Z1") ? "bun\n" : "",
        stderr: "",
      }),
      makeDirectory: async () => undefined,
      writeAsset: async () => undefined,
      readAsset: async () => asset,
      makeExecutable: async () => undefined,
      output: (line: string) => outputs.push(line),
    });
    expect([...result.keys()]).toEqual(["bun"]);
    expect(outputs).toHaveLength(1);
  });

  it("requires exact package-manager Bun and accumulates every target-cell failure", async () => {
    const verifier = await loadScript<{
      parseCompiler: (argv: readonly string[]) => string | undefined;
      parseProvisionedPaths: (stdout: string, expected: readonly string[]) => Map<string, string>;
      packageManagerInvocation: (
        environment: Record<string, string | undefined>,
        access?: (path: string, mode: number) => Promise<void>,
        probe?: (path: string) => Promise<{ stdout: string }>,
      ) => Promise<{ executable: string }>;
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
    for (const output of ["", "bun=relative\n", "bun=/tmp/bun\nbun=/tmp/other\n", "deno=/tmp/deno\n"]) {
      expect(() => verifier.parseProvisionedPaths(output, ["bun"])).toThrow();
    }
    const probe = async () => ({ stdout: "1.3.14\n" });
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/bun" },
      async () => undefined,
      probe,
    )).resolves.toEqual({ executable: "/tools/bun" });
    const accessed: string[] = [];
    await expect(verifier.packageManagerInvocation(
      { PATH: "/missing:/tools" },
      async (path: string) => {
        accessed.push(path);
        if (path !== "/tools/bun") throw new Error("missing");
      },
      probe,
    )).resolves.toEqual({ executable: "/tools/bun" });
    expect(accessed).toEqual(["/missing/bun", "/tools/bun"]);
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/bun" },
      async () => undefined,
      async () => ({ stdout: "1.3.9\n" }),
    )).rejects.toThrow(/must be 1\.3\.14/);
    for (const npm_execpath of ["bun", "relative/bun", "/tmp/not-bun.cjs"]) {
      await expect(verifier.packageManagerInvocation(
        { npm_execpath },
        async () => undefined,
        probe,
      )).rejects.toThrow(/absolute|identify Bun/);
    }
    expect(() => verifier.requireUbuntuCompatibleHost("darwin", "arm64")).toThrow(/required Ubuntu CI gate/);

    const calls: Array<{ executable: string; argv: readonly string[]; env: Record<string, string | undefined> }> = [];
    let cleaned = "";
    await expect(verifier.verifyTargetSupport({
      compiler: "bun",
      platform: "linux",
      architecture: "x64",
      environment: { PATH: "/tools", DENORT_BIN: "/inherited/denort" },
      packageManager: { executable: "/tools/bun" },
      execute: async (executable: string, argv: readonly string[], options: { env: Record<string, string> }) => {
        calls.push({ executable, argv, env: options.env });
        if (argv[0]?.endsWith("provision-tool-assets.mjs")) return { stdout: "bun=/tmp/compiler-bun\n", stderr: "" };
        if (options.env.EFFECT_BUILD_TARGET === "macos-x64") throw new Error("cell failure");
        return { stdout: "", stderr: "" };
      },
      makeTemporaryDirectory: async () => "/tmp/effect-build-targets-fixture",
      removeDirectory: async (path: string) => void (cleaned = path),
      log: () => undefined,
    })).rejects.toThrow(/macos-x64/);
    const cells = calls.filter((call) => call.argv.includes("test:integration:target"));
    expect(cells).toHaveLength(6);
    expect(cells.every((call) => call.executable === "/tools/bun")).toBe(true);
    expect(cells.every((call) => JSON.stringify(call.argv) === JSON.stringify(["run", "test:integration:target"])))
      .toBe(true);
    expect(cells.every((call) => call.env.DENORT_BIN === undefined)).toBe(true);
    expect(cells.every((call) => call.env.BUN_INSTALL_CACHE_DIR?.startsWith(cleaned))).toBe(true);
    expect(cleaned).toBe("/tmp/effect-build-targets-fixture");
  });

  it("keeps one strict external-oracle target cell and independent compiler pins", async () => {
    const source = await readFile(resolve(root, "test/integration/standalone-target-support.test.ts"), "utf8");
    expect(source.match(/\bit\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/\.skip\b|inspectNativeExecutable|NativeExecutable\.js/);
    expect(source).toContain('["--brief", "-P", "elf_shsize=268435456", "--", path]');
    for (const flags of ['["-hW", path]', '["-lW", path]', '["-VW", path]']) expect(source).toContain(flags);
    expect(source).toContain('LC_ALL: "C"');
    expect(source).toContain("digest: true");

    const pins = JSON.parse(await readFile(resolve(root, "tooling/tool-pins.json"), "utf8")) as {
      tools: Array<{ tool: string; version: string; sha256: string; url: string; member: string }>;
    };
    expect(Object.fromEntries(pins.tools.map((pin) => [pin.tool, pin.version]))).toEqual({
      bun: "1.3.9",
      deno: "2.9.3",
      denort: "2.9.3",
    });
    for (const pin of pins.tools) {
      expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.url).toMatch(/^https:\/\/github\.com\//);
    }
    expect(
      (JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { packageManager: string }).packageManager,
    )
      .toBe("bun@1.3.14");
  });

  it("keeps every public peer bounded while all development references use rc.108", async () => {
    for (const path of workspaceManifests) {
      const manifest = JSON.parse(await readFile(resolve(root, path), "utf8")) as {
        private?: boolean;
        peerDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (path.startsWith("packages/")) {
        expect(manifest.peerDependencies).toEqual({ effect: ">=4.0.0-beta.104 <4.1.0-0" });
      }
      for (const section of [manifest.dependencies, manifest.devDependencies]) {
        for (const [name, version] of Object.entries(section ?? {})) {
          if (name === "effect" || name.startsWith("@effect/platform-")) {
            expect(version, `${path} ${name}`).toBe("4.0.0-rc.108");
          }
        }
      }
    }
    const rootManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(rootManifest.scripts["verify:effect"]).toBe("node scripts/verify-effect-compatibility.mjs --all");
  });

  it("rewrites every temporary workspace manifest and runs exact Bun endpoint gates", async () => {
    const verifier = await loadScript<{
      effectEndpoints: readonly string[];
      parseArguments: (argv: readonly string[]) => readonly string[];
      rewriteManifest: (manifest: Record<string, unknown>, version: string) => Record<string, unknown>;
      selectCompatibilityTemporaryDirectory: (path: string, platform: string) => string;
      shouldCopyRepositoryPath: (path: string) => boolean;
      packageManagerInvocation: (
        environment: Record<string, string | undefined>,
        access?: (path: string, mode: number) => Promise<void>,
        probe?: (path: string) => Promise<{ stdout: string }>,
      ) => Promise<{ executable: string }>;
      verifyEffectEndpoint: (version: string, dependencies: Record<string, unknown>) => Promise<void>;
    }>("verify-effect-compatibility.mjs");
    expect(verifier.effectEndpoints).toEqual(effectEndpoints);
    expect(verifier.parseArguments(["--all"])).toEqual(effectEndpoints);
    for (const endpoint of effectEndpoints) {
      expect(verifier.parseArguments(["--effect-version", endpoint])).toEqual([endpoint]);
    }
    for (const argv of [[], ["--effect-version"], ["--effect-version", "4.0.0-beta.103"], ["--all", "extra"]]) {
      expect(() => verifier.parseArguments(argv)).toThrow(/exact Effect endpoints/);
    }

    const publicManifest = {
      peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
      devDependencies: { effect: "old" },
    };
    const rewritten = verifier.rewriteManifest(publicManifest, effectEndpoints[0]!) as typeof publicManifest;
    expect(rewritten.peerDependencies).toEqual(publicManifest.peerDependencies);
    expect(rewritten.devDependencies.effect).toBe(effectEndpoints[0]);
    expect(publicManifest.devDependencies.effect).toBe("old");
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "packages/effect-build/dist/index.js"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "packages/effect-build/src/index.ts"))).toBe(true);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "node_modules/effect"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "uncommitted.tsbuildinfo"))).toBe(false);
    expect(verifier.selectCompatibilityTemporaryDirectory(resolve(root, ".cache/tmp"), "linux")).toBe(resolve("/tmp"));
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/bun" },
      async () => undefined,
      async () => ({ stdout: "1.3.14\n" }),
    )).resolves.toEqual({ executable: "/tools/bun" });

    const invalidEndpointCalls: string[] = [];
    await expect(verifier.verifyEffectEndpoint("4.0.0-beta.103", {
      makeTemporaryDirectory: async () => {
        invalidEndpointCalls.push("temporary-directory");
        return "/tmp/effect-build-effect-compatibility-invalid";
      },
      copyRepository: async () => void invalidEndpointCalls.push("copy"),
      execute: async () => void invalidEndpointCalls.push("execute"),
      removeDirectory: async () => void invalidEndpointCalls.push("remove"),
    })).rejects.toThrow(/unsupported Effect endpoint/);
    expect(invalidEndpointCalls).toEqual([]);

    const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-effect-compatibility-"));
    const calls: Array<{ argv: readonly string[]; options: { cwd: string; env: Record<string, string> } }> = [];
    await verifier.verifyEffectEndpoint(effectEndpoints[0]!, {
      makeTemporaryDirectory: async () => temporaryRoot,
      copyRepository: async (destination: string) => {
        for (const path of workspaceManifests) {
          await mkdir(resolve(destination, path, ".."), { recursive: true });
          const manifest = path === "package.json"
            ? {
              devDependencies: {
                effect: "old",
                "@effect/platform-bun": "old",
                "@effect/platform-deno": "old",
                "@effect/platform-node": "old",
              },
            }
            : path.startsWith("packages/")
            ? publicManifest
            : { private: true, dependencies: { effect: "old", "@effect/platform-node": "old" } };
          await writeFile(resolve(destination, path), `${JSON.stringify(manifest, null, 2)}\n`);
        }
      },
      packageManager: { executable: "/fixture/bun" },
      environment: { PATH: "/fixture", SENTINEL: "preserved" },
      execute: async (
        _executable: string,
        argv: readonly string[],
        options: { cwd: string; env: Record<string, string> },
      ) => void calls.push({ argv, options }),
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
    expect(calls.every(({ options }) => options.cwd === resolve(temporaryRoot, "repository"))).toBe(true);
    expect(calls.every(({ options }) => options.env.SENTINEL === "preserved")).toBe(true);
    expect(calls.every(({ options }) => options.env.BUN_INSTALL_CACHE_DIR === resolve(temporaryRoot, "cache/bun")))
      .toBe(true);
  });

  it("keeps normal CI at nine no-skip cells with pinned Bun setup", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual([
      "quality",
      "real-tools",
      "target-support",
      "effect-compatibility",
      "publication-hosts",
    ]);
    expectPinnedActionsWithoutEscapes(workflow);
    for (const job of Object.values(workflow.jobs)) {
      const bunStep = job.steps?.find((step) => step.uses?.startsWith("oven-sh/setup-bun@"));
      expect(bunStep?.uses).toBe(setupBun);
      expect(bunStep?.with).toEqual({ "bun-version": "1.3.14" });
    }
    expect(jobRuns(workflow, "quality")).toContain("bun run verify");
    expect(jobRuns(workflow, "real-tools")).toContain("bun run build");
    expect(jobRuns(workflow, "real-tools")).toContain("bun run verify:real");
    expect(jobRuns(workflow, "target-support")).toContain("bun run build");
    expect(jobRuns(workflow, "publication-hosts")).toContain("bun run build");
    expect(jobRuns(workflow, "publication-hosts")).toContain("bun run test:publication");
    expect(workflow.jobs["target-support"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { compiler: ["bun", "deno"] },
    });
    expect(jobRuns(workflow, "target-support")).toContain(
      "node scripts/verify-target-support.mjs --compiler ${{ matrix.compiler }}",
    );
    expect(workflow.jobs["effect-compatibility"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { effect: effectEndpoints },
    });
    expect(workflow.jobs["effect-compatibility"]?.steps?.filter((step) => step.run !== undefined)).toEqual([
      { run: "node scripts/verify-effect-compatibility.mjs --effect-version ${{ matrix.effect }}" },
    ]);
    const support = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as SupportMatrix;
    expect(workflow.jobs["publication-hosts"]?.strategy?.matrix?.runner).toEqual(support.publicationHosts);
  });

  it("keeps release candidate manual, exact-SHA, read-only, and artifact-producing", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const workflow = parse(source) as Workflow;
    expect(workflow.on).toEqual({
      workflow_dispatch: {
        inputs: {
          commit: {
            description: "Exact 40-character source commit",
            required: true,
            type: "string",
          },
        },
      },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["candidate"]);
    expectPinnedActionsWithoutEscapes(workflow);
    const candidate = workflow.jobs.candidate!;
    expect(candidate.permissions).toBeUndefined();
    expect(candidate["runs-on"]).toBe("ubuntu-24.04");
    expect(candidate.steps?.find((step) => step.uses === setupBun)?.with).toEqual({ "bun-version": "1.3.14" });
    const checkout = candidate.steps?.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.ref).toBe("${{ inputs.commit }}");
    const runs = jobRuns(workflow, "candidate");
    for (const gate of ["bun run verify", "bun run verify:real", "bun run verify:targets", "bun run verify:effect"]) {
      expect(runs).toContain(gate);
    }
    expect(runs).toContain(
      'node scripts/test-built-consumer.mjs --candidate-dir "$RUNNER_TEMP/effect-build-candidate"',
    );
    expect(
      candidate.steps?.some((step) =>
        step.uses
          === "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
      ),
    ).toBe(true);
    expect(source).not.toMatch(/npm publish|bun publish|id-token:\s*write|packages:\s*write|NPM_TOKEN|^\s*push:/m);
    expect(source).toContain('test "${REQUESTED_COMMIT}" = "${DISPATCH_COMMIT}"');
    expect(source).toContain('test "$(git rev-parse HEAD)" = "${REQUESTED_COMMIT}"');
  });

  it("keeps packed-consumer candidate arguments closed and the release bytes shared", async () => {
    const consumer = await loadScript<{
      parseArguments: (argv: readonly string[]) => { candidateDirectory?: string; build: boolean };
      isNonRegistryDependency: (value: unknown) => boolean;
    }>("test-built-consumer.mjs");
    expect(consumer.parseArguments([])).toEqual({ candidateDirectory: undefined, build: true });
    expect(consumer.parseArguments(["--fresh-install"])).toEqual({ candidateDirectory: undefined, build: true });
    expect(consumer.parseArguments(["--built"])).toEqual({ candidateDirectory: undefined, build: false });
    expect(consumer.parseArguments(["--candidate-dir", "/tmp/candidate"])).toEqual({
      candidateDirectory: "/tmp/candidate",
      build: false,
    });
    for (
      const argv of [["--candidate-dir"], ["--candidate-dir", "relative"], ["--unknown"], ["--fresh-install", "x"]]
    ) {
      expect(() => consumer.parseArguments(argv)).toThrow(/usage/);
    }
    for (
      const specifier of [
        "workspace:^",
        "catalog:",
        "file:../core",
        "link:../core",
        "portal:../core",
        "../core",
        "./core",
        "/core",
        "C:\\core",
      ]
    ) {
      expect(consumer.isNonRegistryDependency(specifier), specifier).toBe(true);
    }
    for (const specifier of ["^0.3.0", ">=4.0.0-beta.104 <4.1.0-0", "npm:effect-build@0.3.0"]) {
      expect(consumer.isNonRegistryDependency(specifier), specifier).toBe(false);
    }
  });
});
