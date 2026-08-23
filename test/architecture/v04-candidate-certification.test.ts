import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);
const read = (path: string) => readFile(resolve(root, path), "utf8");

describe("Plan 044 candidate certification", () => {
  it("has one candidate-only workflow with complete support and certificate gates", async () => {
    const workflow = parse(await read(".github/workflows/architecture-research.yml")) as {
      readonly name: string;
      readonly on: { readonly push: { readonly branches: readonly string[] } };
      readonly permissions: Record<string, string>;
      readonly jobs: Record<string, unknown>;
    };
    expect(workflow.name).toBe("plan-044-candidate-certification");
    expect(workflow.on.push.branches).toEqual(["codex/044-hard-cut-certify"]);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual([
      "candidate",
      "real-bun",
      "real-deno",
      "real-node-sea",
      "windows-lifecycle",
      "certify",
    ]);

    const source = await read(".github/workflows/architecture-research.yml");
    expect(source).toContain("scripts/test-built-consumer.mjs --candidate-dir");
    expect(source).toContain("staged-external-author-adapter.mjs --candidate-dir");
    expect(source).toContain("certify-plan044-candidate.mjs");
    expect(source).toContain("verify-windows-candidate.mjs");
    expect(source).not.toMatch(/npm\s+publish|trusted.publisher|ts-release|\bpublish\b/i);
  });

  it("keeps release mutation authority out of the candidate checkout", async () => {
    await expect(access(resolve(root, ".github/workflows/release.yml"))).rejects.toThrow();
    const [certificate, adapter] = await Promise.all([
      read("research/post-0.3/implementation/certify-plan044-candidate.mjs"),
      read("research/post-0.3/implementation/staged-external-author-adapter.mjs"),
    ]);
    expect(certificate).toContain("verifyCandidate({ directory: candidateDirectory, source })");
    expect(certificate).toContain("ls-remote");
    expect(certificate).toContain("GITHUB_ACTIONS");
    expect(adapter).toContain("--candidate-dir <absolute-directory>");
    expect(adapter).toContain("candidateCoreTarball");
    expect(adapter).toContain('"effect-build-0.4.0.tgz"');
  });
});
