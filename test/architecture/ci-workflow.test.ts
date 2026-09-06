import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowStep {
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly name?: string;
  readonly needs?: string | ReadonlyArray<string>;
  readonly if?: string;
  readonly "runs-on"?: string;
  readonly strategy?: {
    readonly matrix?: {
      readonly os?: ReadonlyArray<string>;
      readonly include?: ReadonlyArray<{
        readonly compiler?: string;
        readonly target?: string;
        readonly os?: string;
      }>;
    };
  };
  readonly steps?: ReadonlyArray<WorkflowStep>;
}

interface CiWorkflow {
  readonly on: {
    readonly push?: { readonly branches?: ReadonlyArray<string> };
    readonly pull_request?: Readonly<Record<string, unknown>>;
  };
  readonly concurrency?: {
    readonly group?: string;
    readonly "cancel-in-progress"?: boolean | string;
  };
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface ExactToolEvidence {
  readonly name: string;
  readonly version: string;
  readonly executableBindings: ReadonlyArray<string>;
  readonly evidenceCells: ReadonlyArray<string>;
}

interface CombinedContract {
  readonly exactToolEvidenceRegister: {
    readonly tools: ReadonlyArray<ExactToolEvidence>;
  };
}

const denoVersion = (job: WorkflowJob | undefined) =>
  job?.steps?.find((step) => step.uses?.startsWith("denoland/setup-deno@"))?.with?.["deno-version"];

const nodeVersion = (job: WorkflowJob | undefined) =>
  job?.steps?.find((step) => step.uses?.startsWith("actions/setup-node@"))?.with?.["node-version"];

const scripts = (job: WorkflowJob | undefined) => job?.steps?.map((step) => step.run ?? "").join("\n") ?? "";

const hosts = (job: WorkflowJob | undefined) =>
  job?.strategy?.matrix?.os
    ?? job?.strategy?.matrix?.include?.map((cell) => cell.os)
    ?? [job?.["runs-on"]];

const readWorkflow = async () => parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as CiWorkflow;

const verificationCommands = (command: string, packageScripts: Readonly<Record<string, string>>): Array<string> =>
  command.split(/\s*&&\s*/u).flatMap((part) => {
    const script = /^bun run (verify(?::[a-z]+)?)$/u.exec(part)?.[1];
    if (script === undefined) return [part];
    const source = packageScripts[script];
    if (source === undefined) throw new Error(`missing verification script: ${script}`);
    return verificationCommands(source, packageScripts);
  });

const readExactTools = async () => {
  const contract = JSON.parse(
    await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
  ) as CombinedContract;
  return new Map(contract.exactToolEvidenceRegister.tools.map((tool) => [tool.name, tool]));
};

const requireTool = (tools: ReadonlyMap<string, ExactToolEvidence>, name: string) => {
  const tool = tools.get(name);
  if (tool === undefined) throw new Error(`combined contract is missing exact ${name} evidence`);
  return tool;
};

describe("CI workflow", () => {
  it("runs feature changes through PRs and preserves every main push as independent release evidence", async () => {
    const workflow = await readWorkflow();

    expect(workflow.on.push?.branches).toEqual(["main"]);
    expect(workflow.on.pull_request).toEqual({});
    expect(workflow.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    });
  });

  it("retains all required host checks and fails them when the shared static gate does not pass", async () => {
    const workflow = await readWorkflow();
    const shared = workflow.jobs.static;
    const verify = workflow.jobs.verify;

    expect(hosts(shared)).toEqual(["ubuntu-24.04"]);
    expect(shared?.steps?.filter((step) => step.run === "bun run verify:static")).toHaveLength(1);
    expect(scripts(shared)).toContain("bun run build");
    expect(verify?.name).toBe("Verify (${{ matrix.os }})");
    expect(hosts(verify)).toEqual(["ubuntu-24.04", "macos-15", "windows-2025"]);
    expect(verify?.needs).toBe("static");
    expect(verify?.if).toBe("${{ !cancelled() }}");
    expect(verify?.steps?.[0]).toMatchObject({
      if: "needs.static.result != 'success'",
      run: "exit 1",
    });
    expect(verify?.steps?.filter((step) => step.run === "bun run verify:platform")).toHaveLength(1);
    expect(scripts(verify)).toContain("bun run build");
    expect(scripts(verify)).not.toContain("bun run verify:static");
  });

  it("composes local verification from every static and platform check with one build and no duplicated suites", async () => {
    const { scripts: packageScripts } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    const staticCommands = [
      "bun run check:contract",
      "bun run check",
      "bun run test:types",
      "bun run lint",
      "bun run format:check",
    ];
    const platformCommands = [
      "bun run test:unit",
      "bun run test:examples",
      "bun scripts/test-built-consumer.mjs",
      "bun run test:architecture",
    ];

    expect(verificationCommands("bun run verify:static", packageScripts).sort()).toEqual(staticCommands.sort());
    expect(verificationCommands("bun run verify:platform", packageScripts).sort()).toEqual(platformCommands.sort());
    const localCommands = verificationCommands("bun run verify", packageScripts);
    expect(localCommands[0]).toBe("bun run build");
    expect([...localCommands].sort()).toEqual(["bun run build", ...staticCommands, ...platformCommands].sort());
  });

  it("runs every Deno evidence lane against the exact admitted version", async () => {
    const workflow = await readWorkflow();
    const deno = requireTool(await readExactTools(), "deno");

    expect(denoVersion(workflow.jobs["integration-deno"])).toBe(`v${deno.version}`);
    expect(denoVersion(workflow.jobs["target-cells"])).toBe(`v${deno.version}`);
    const denoTargets = workflow.jobs["target-cells"]?.strategy?.matrix?.include
      ?.filter((cell) => cell.compiler === "deno")
      .map((cell) => cell.target)
      .sort();
    expect(denoTargets).toEqual(deno.evidenceCells.filter((cell) => cell !== "host-native").sort());
  });

  it("binds hosted real-provider jobs to setup-installed tools and does not certify skipped Node SEA hosts", async () => {
    const workflow = await readWorkflow();
    const bun = workflow.jobs["integration-bun"];
    const deno = workflow.jobs["integration-deno"];
    const nodeSea = workflow.jobs["integration-node-sea"];
    const exactTools = await readExactTools();
    const bunTool = requireTool(exactTools, "bun");
    const denoTool = requireTool(exactTools, "deno");
    const nodeTool = requireTool(exactTools, "node");

    expect(scripts(bun)).toContain(`${bunTool.executableBindings[0]}=`);
    expect(scripts(deno)).toContain(`${denoTool.executableBindings[0]}=`);
    expect(scripts(nodeSea)).toContain(`${nodeTool.executableBindings[0]}=`);
    expect(nodeVersion(nodeSea)).toBe(nodeTool.version);
    expect(hosts(nodeSea)).toEqual(["ubuntu-24.04"]);
    expect(nodeTool.evidenceCells).toEqual(["linux-x64-gnu"]);

    const bunVersions = Object.values(workflow.jobs).flatMap((job) =>
      job.steps
        ?.filter((step) => step.uses?.startsWith("oven-sh/setup-bun@"))
        .map((step) => step.with?.["bun-version"])
        ?? []
    );
    expect(bunVersions.length).toBeGreaterThan(0);
    expect(new Set(bunVersions)).toEqual(new Set([bunTool.version]));

    const bunTargets = workflow.jobs["target-cells"]?.strategy?.matrix?.include
      ?.filter((cell) => cell.compiler === "bun")
      .map((cell) => cell.target)
      .sort();
    expect(bunTargets).toEqual(bunTool.evidenceCells.filter((cell) => cell !== "host-native").sort());
  });

  it("does not allow real-provider suites to pass by skipping unavailable evidence tools", async () => {
    const files = [
      "bun-bundle.test.ts",
      "bun-compile-executable.test.ts",
      "deno-bundle.test.ts",
      "deno-compile-executable.test.ts",
      "node-sea-assemble-executable.test.ts",
    ];
    const sources = await Promise.all(
      files.map((file) => readFile(resolve(root, "test/integration", file), "utf8")),
    );

    for (const source of sources) expect(source).not.toContain("describe.skipIf");

    const [packageSource, runner] = await Promise.all([
      readFile(resolve(root, "package.json"), "utf8"),
      readFile(resolve(root, "scripts/run-real-bun-integration.mjs"), "utf8"),
    ]);
    expect(packageSource).toContain('"test:integration:bun": "bun scripts/run-real-bun-integration.mjs"');
    expect(runner).toContain("EFFECT_BUILD_BUN: process.execPath");
    expect(runner).toContain('spawnSync(\n  "node"');
  });

  it("derives producer acceptance pins and executable bindings from the combined contract", async () => {
    const exactTools = await readExactTools();
    const uv = requireTool(exactTools, "uv");
    const nfpm = requireTool(exactTools, "nfpm");
    const syft = requireTool(exactTools, "syft");
    const [workflow, unixInstaller, windowsNfpmInstaller] = await Promise.all([
      readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"),
      readFile(resolve(root, "scripts/acceptance/install-unix-tool.sh"), "utf8"),
      readFile(resolve(root, "scripts/acceptance/install-windows-nfpm.ps1"), "utf8"),
    ]);

    for (const tool of [uv, nfpm, syft]) {
      expect(workflow).toContain(
        `${tool.name === "nfpm" ? "nFPM" : tool.name === "syft" ? "Syft" : tool.name} ${tool.version}`,
      );
      expect(workflow).toContain(`${tool.executableBindings[0]}=`);
    }
    expect(unixInstaller).toContain(`/download/${uv.version}/`);
    expect(unixInstaller).toContain(`/download/v${nfpm.version}/`);
    expect(unixInstaller).toContain(`/download/v${syft.version}/`);
    expect(windowsNfpmInstaller).toContain(`/download/v${nfpm.version}/`);
  });
});
