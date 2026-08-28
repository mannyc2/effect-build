import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowStep {
  readonly env?: Readonly<Record<string, string>>;
  readonly run?: string;
}

interface WorkflowJob {
  readonly environment?: string;
  readonly needs?: string;
  readonly steps?: readonly WorkflowStep[];
}

interface BootstrapWorkflow {
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

describe("temporary npm bootstrap workflow", () => {
  it("uses the token only for a protected exact-main identity check", async () => {
    const source = await readFile(resolve(root, ".github/workflows/npm-bootstrap.yml"), "utf8");
    const workflow = parse(source) as BootstrapWorkflow;
    const contractScript = workflow.jobs["environment-contract"]?.steps
      ?.map((step) => step.run ?? "")
      .join("\n") ?? "";
    const diagnose = workflow.jobs.diagnose;
    const diagnoseScript = diagnose?.steps?.map((step) => step.run ?? "").join("\n") ?? "";
    const tokenBindings = diagnose?.steps
      ?.flatMap((step) => Object.values(step.env ?? {}))
      .filter((value) => value === "${{ secrets.NPM_TOKEN }}") ?? [];

    expect(diagnose?.environment).toBe("npm");
    expect(diagnose?.needs).toBe("environment-contract");
    expect(tokenBindings).toHaveLength(1);
    expect(contractScript).toContain('reviewers?.includes("mannyc2")');
    expect(contractScript).toContain('JSON.stringify([{ name: "main", type: "branch" }])');
    expect(diagnoseScript).toContain("git ls-remote --exit-code origin refs/heads/main");
    expect(diagnoseScript).toContain("npx --yes npm@11.11.0 whoami");
    expect(diagnoseScript).toContain('[[ "$observed" != "mannyc1" ]]');
    expect(diagnoseScript).toContain("printf '%s\\n' \"$observed\"");
    expect(source.match(/secrets\.NPM_TOKEN/g)).toHaveLength(1);
    expect(source).not.toContain("npm publish");
    expect(source).not.toContain("npm trust");
  });
});
