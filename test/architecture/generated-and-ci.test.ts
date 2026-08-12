import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, {
    needs?: string | string[];
    permissions?: Record<string, string>;
    steps?: Array<{
      uses?: string;
      run?: string;
      env?: Record<string, string>;
      "continue-on-error"?: boolean;
    }>;
    strategy?: { matrix?: { runner?: string[] } };
  }>;
}

describe("tooling pins and CI contract", () => {
  it("keeps authored tool pins as checksummed CI fixtures", async () => {
    const pins = JSON.parse(await readFile(resolve(root, "tooling/tool-pins.json"), "utf8")) as {
      tools: Array<{ tool: string; sha256: string; url: string; member: string }>;
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
  });

  it("requires deterministic, real-tool, and publication jobs without escape hatches", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });

    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses !== undefined) {
          expect(step.uses).toMatch(/^((actions\/checkout|actions\/setup-node|pnpm\/action-setup)@)[0-9a-f]{40}$/);
        }
        expect(step["continue-on-error"]).not.toBe(true);
      }
    }

    const runs = (name: string): string => (workflow.jobs[name]?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(runs("quality")).toContain("pnpm verify");
    expect(runs("real-tools")).toMatch(/pnpm (verify:real|test:integration:real)/);
    expect(runs("real-tools")).toContain("provision-tool-assets.mjs");
    const realTools = workflow.jobs["real-tools"]?.steps?.find((step) => step.run?.includes("verify:real"));
    expect(realTools?.env?.EFFECT_BUILD_EXPECTED_TARGET).toBe("linux-x64-gnu");

    const support = JSON.parse(await readFile(resolve(root, "tooling/support-matrix.json"), "utf8")) as {
      publicationHosts: string[];
      supportedCells: Array<{ orchestrator: string; runner: string; target: string; compiler: string }>;
    };
    expect(support.supportedCells).toEqual([
      { orchestrator: "node", runner: "ubuntu-24.04", target: "linux-x64-gnu", compiler: "bun" },
      { orchestrator: "node", runner: "ubuntu-24.04", target: "linux-x64-gnu", compiler: "deno" },
    ]);
    const matrix = workflow.jobs["publication-hosts"]?.strategy?.matrix?.runner ?? [];
    expect([...matrix].sort()).toEqual([...support.publicationHosts].sort());
    expect(runs("publication-hosts")).toContain("pnpm test:publication");
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
    expect(packageJson.peerDependencies?.effect).toBe("4.0.0-beta.107");
    expect(packageJson.devDependencies?.effect).toBe("4.0.0-beta.107");
    expect(packageJson.scripts?.prepack).toBe("pnpm build");

    const workflow = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    expect(workflow.on).toEqual({ push: { tags: ["v*.*.*"] } });
    expect(workflow.permissions).toEqual({ contents: "read" });

    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses !== undefined) {
          expect(step.uses).toMatch(/^((actions\/checkout|actions\/setup-node|pnpm\/action-setup)@)[0-9a-f]{40}$/);
        }
        expect(step["continue-on-error"]).not.toBe(true);
      }
    }

    expect(workflow.jobs.quality?.needs).toBe("preflight");
    expect(workflow.jobs["real-tools"]?.needs).toBe("preflight");
    expect(workflow.jobs["publication-hosts"]?.needs).toBe("preflight");
    const preflightRuns = (workflow.jobs.preflight?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(preflightRuns).toContain("GITHUB_REF_NAME");
    expect(preflightRuns).toContain("refs/remotes/origin/main");

    expect(workflow.jobs["publish-npm"]?.needs).toEqual(["quality", "real-tools", "publication-hosts"]);
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
