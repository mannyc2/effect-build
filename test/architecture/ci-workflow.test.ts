import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowStep {
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly "runs-on"?: string;
  readonly strategy?: {
    readonly matrix?: {
      readonly os?: ReadonlyArray<string>;
      readonly fixture?: ReadonlyArray<string>;
      readonly include?: ReadonlyArray<{
        readonly compiler?: string;
        readonly fixture?: string;
        readonly target?: string;
        readonly os?: string;
      }>;
    };
  };
  readonly steps?: ReadonlyArray<WorkflowStep>;
}

interface CiWorkflow {
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface ExactToolEvidence {
  readonly id: string;
  readonly lane?: string;
  readonly expectation?: "rejected";
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

const nodeVersion = (job: WorkflowJob | undefined) =>
  job?.steps?.find((step) => step.uses?.startsWith("actions/setup-node@"))?.with?.["node-version"];

const scripts = (job: WorkflowJob | undefined) => job?.steps?.map((step) => step.run ?? "").join("\n") ?? "";

const hosts = (job: WorkflowJob | undefined) =>
  job?.strategy?.matrix?.os
    ?? job?.strategy?.matrix?.include?.map((cell) => cell.os)
    ?? [job?.["runs-on"]];

const readWorkflow = async () => parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as CiWorkflow;

const readExactTools = async () => {
  const contract = JSON.parse(
    await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
  ) as CombinedContract;
  return new Map(contract.exactToolEvidenceRegister.tools.map((tool) => [tool.id, tool]));
};

const requireTool = (tools: ReadonlyMap<string, ExactToolEvidence>, name: string) => {
  const tool = [...tools.values()].find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`combined contract is missing exact ${name} evidence`);
  return tool;
};

describe("CI workflow", () => {
  it("binds each exact compiler fixture to a real job independently of orchestration", async () => {
    const workflow = await readWorkflow();
    const tools = await readExactTools();
    for (const provider of ["bun", "deno", "esbuild"]) {
      const job = workflow.jobs[`integration-${provider}`];
      const expected = [...tools.values()].filter((tool) => tool.name === provider && tool.lane === "Command");
      expect([...(job?.strategy?.matrix?.fixture ?? [])].sort()).toEqual(expected.map((tool) => tool.id).sort());
      expect(hosts(job)).toEqual(["ubuntu-24.04", "macos-15", "windows-2025"]);
      expect(scripts(job)).toContain("node scripts/install-provider-fixture.mjs ${{ matrix.fixture }}");
      expect(scripts(job)).toContain(`bun run test:integration:${provider}`);
    }
    const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { packageManager: string };
    const orchestrationVersion = manifest.packageManager.replace(/^bun@/u, "");
    const bunVersions = Object.values(workflow.jobs).flatMap((job) =>
      job.steps?.filter((step) => step.uses?.startsWith("oven-sh/setup-bun@"))
        .map((step) => step.with?.["bun-version"]) ?? []
    );
    expect(bunVersions.length).toBeGreaterThan(0);
    expect(new Set(bunVersions)).toEqual(new Set([orchestrationVersion]));
  });

  it("covers declared target coordinates per admitted fixture and keeps rejected tools out", async () => {
    const workflow = await readWorkflow();
    const tools = await readExactTools();
    const cells = workflow.jobs["target-cells"]?.strategy?.matrix?.include ?? [];
    expect(scripts(workflow.jobs["target-cells"])).toContain(
      "node scripts/install-provider-fixture.mjs ${{ matrix.fixture }}",
    );
    const identities = cells.map((cell) => `${cell.fixture}:${cell.target}`);
    expect(new Set(identities).size).toBe(identities.length);
    for (const cell of cells) {
      const tool = tools.get(cell.fixture ?? "");
      expect(tool).toBeDefined();
      expect(tool?.expectation).not.toBe("rejected");
      expect(tool?.name).toBe(cell.compiler);
      expect(tool?.evidenceCells).toContain(cell.target);
    }
    for (const tool of tools.values()) {
      if (tool.lane !== "Command") continue;
      const observed = cells.filter((cell) => cell.fixture === tool.id).map((cell) => cell.target).sort();
      const expected = tool.expectation === "rejected"
        ? []
        : tool.evidenceCells.filter((cell) => cell !== "host-native").sort();
      expect(observed, tool.id).toEqual(expected);
    }
  });

  it("keeps Node SEA evidence bound to its exact admitted host and executable", async () => {
    const workflow = await readWorkflow();
    const nodeSea = workflow.jobs["integration-node-sea"];
    const nodeTool = requireTool(await readExactTools(), "node");
    expect(scripts(nodeSea)).toContain(`${nodeTool.executableBindings[0]}=`);
    expect(nodeVersion(nodeSea)).toBe(nodeTool.version);
    expect(hosts(nodeSea)).toEqual(["ubuntu-24.04"]);
    expect(nodeTool.evidenceCells).toEqual(["linux-x64-gnu"]);
  });

  it("installs producer tool versions admitted by the combined contract", async () => {
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
      expect(workflow).toContain(`${tool.executableBindings[0]}=`);
    }
    expect(unixInstaller).toContain(`/download/${uv.version}/`);
    expect(unixInstaller).toContain(`/download/v${nfpm.version}/`);
    expect(unixInstaller).toContain(`/download/v${syft.version}/`);
    expect(windowsNfpmInstaller).toContain(`/download/v${nfpm.version}/`);
  });
});
