import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowJob {
  readonly environment?: string;
  readonly needs?: string;
  readonly steps?: ReadonlyArray<{ readonly run?: string }>;
}

interface ReleaseWorkflow {
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

describe("release workflow", () => {
  it("fails closed unless the protected main-only npm environment already exists", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const workflow = parse(source) as ReleaseWorkflow;
    const contract = workflow.jobs["environment-contract"];
    const publish = workflow.jobs.publish;
    const contractScript = contract?.steps?.map((step) => step.run ?? "").join("\n") ?? "";

    expect(source).not.toContain("npm-production");
    expect(publish?.environment).toBe("npm");
    expect(publish?.needs).toBe("environment-contract");
    expect(contractScript).toContain("/environments/npm");
    expect(contractScript).toContain("required_reviewers");
    expect(contractScript).toContain('reviewers?.includes("mannyc2")');
    expect(contractScript).toContain('JSON.stringify([{ name: "main", type: "branch" }])');
    expect(source).toContain("git ls-remote --exit-code origin refs/heads/main");
    expect(source).toContain('fs.readFileSync("tooling/effect-build-contract.json"');
    expect(source).toContain("contract.publicApiProjection.packages");
    expect(source).toContain("expectedModules.length !== 42");
    expect(source).toContain('[[ "${#names[@]}" -ne 11');
    expect(source).toContain('[[ " ${names[*]} " == *" effect-build-rolldown "*');
    expect(source).toContain('echo "prepublish-sri $name@$version ${integrities[$name]}"');
  });
});
