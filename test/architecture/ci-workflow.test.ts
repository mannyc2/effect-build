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
      readonly include?: ReadonlyArray<{ readonly compiler?: string; readonly target?: string }>;
    };
  };
  readonly steps?: ReadonlyArray<WorkflowStep>;
}

interface CiWorkflow {
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
  it("runs every Deno evidence lane against the exact admitted version", async () => {
    const source = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const workflow = parse(source) as CiWorkflow;
    const deno = requireTool(await readExactTools(), "deno");

    expect(denoVersion(workflow.jobs["integration-deno"])).toBe(`v${deno.version}`);
    expect(denoVersion(workflow.jobs["target-cells"])).toBe(`v${deno.version}`);
    expect(source.match(new RegExp(`deno-version:\\s*v${deno.version.replaceAll(".", "\\.")}\\b`, "g")))
      .toHaveLength(2);
    const denoTargets = workflow.jobs["target-cells"]?.strategy?.matrix?.include
      ?.filter((cell) => cell.compiler === "deno")
      .map((cell) => cell.target)
      .sort();
    expect(denoTargets).toEqual(deno.evidenceCells.filter((cell) => cell !== "host-native").sort());
  });

  it("binds hosted real-provider jobs to setup-installed tools and does not certify skipped Node SEA hosts", async () => {
    const source = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const workflow = parse(source) as CiWorkflow;
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
    expect(nodeSea?.["runs-on"]).toBe("ubuntu-24.04");
    expect(nodeSea?.strategy).toBeUndefined();
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
