import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const docs = ["README.md", "architecture.md", "api.md", "drivers.md", "errors.md"];
const examples = ["README.md", "bun-compile.ts", "deno-compile.ts"];

const loadAll = async (paths: string[], directory: string): Promise<string> =>
  (await Promise.all(paths.map((path) => readFile(resolve(root, directory, path), "utf8")))).join("\n");

describe("documentation contract", () => {
  it("keeps the exact final documentation and example manifests", async () => {
    expect((await readdir(resolve(root, "docs"))).sort()).toEqual([...docs].sort());
    expect((await readdir(resolve(root, "examples"))).sort()).toEqual([...examples].sort());
  });

  it("starts with the two-input operation and official host composition", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const firstTypeScript = readme.match(/```ts\n([\s\S]*?)```/)?.[1] ?? "";
    expect(firstTypeScript).toContain("entrypoint:");
    expect(firstTypeScript).toContain("outfile:");
    expect(firstTypeScript).toContain("Effect.provide(Bun.layer())");
    expect(firstTypeScript).toContain("Effect.provide(NodeServices.layer)");
    expect(firstTypeScript).not.toMatch(/\b(cwd|target|digest|options):/);
  });

  it("documents the complete typed behavior surface", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const text = `${readme}\n${await loadAll(docs, "docs")}`;
    expect(text).toContain("Artifact.Artifact");
    expect(text).toContain("Effect.catchTags");
    for (
      const tag of [
        "ToolNotFound",
        "ToolProbeFailed",
        "ToolFailed",
        "TargetUnsupported",
        "InvalidDriverOptions",
        "OutputMissing",
        "OutputInvalid",
        "OutputLocked",
        "PublicationFailed",
      ]
    ) expect(text).toContain(`${tag}:`);
    expect(readme).toContain("Effect.all([mac, linux], { concurrency: 2 })");
    expect(readme).toMatch(/fail-fast/i);
    expect(text).toMatch(/three independent axes/i);
    expect(text).toContain("Orchestrator runtime");
    expect(text).toContain("Artifact target");
  });

  it("documents distinct compilers, discovery, atomic states, and divergences", async () => {
    const drivers = await readFile(resolve(root, "docs/drivers.md"), "utf8");
    expect(drivers).toContain('| `sourcemap` | `"linked" \\| "inline"`');
    expect(drivers).toContain("| scoped permissions | `true \\| readonly string[]`");
    expect(drivers).toContain("PATH");
    expect(drivers).toContain("Bun.layer({ executable:");
    expect(drivers).toContain("Deno.layer({ executable:");

    const architecture = await readFile(resolve(root, "docs/architecture.md"), "utf8");
    expect(architecture).toContain("## Atomic publication states");
    expect(architecture).toContain("## Divergence register");
    expect(architecture).toMatch(/sibling staged path/i);
    expect(architecture).toMatch(/interruption closes Scope and kills the compiler/i);
  });

  it("rejects obsolete product language everywhere user-facing", async () => {
    const text = [
      await readFile(resolve(root, "README.md"), "utf8"),
      await readFile(resolve(root, "AGENTS.md"), "utf8"),
      await loadAll(docs, "docs"),
      await loadAll(examples, "examples"),
    ].join("\n");
    const prohibited = new RegExp(
      [
        "\\bproof\\b",
        "attestation",
        "input closure",
        "truthful terminal record",
        "byte[- ]identical",
        "hermetic",
        "provenance",
        "Configured" + "Observed",
        "Resolved" + "Build",
        "material" + "ize",
      ].join("|"),
      "i",
    );
    expect(text).not.toMatch(prohibited);
  });
});
