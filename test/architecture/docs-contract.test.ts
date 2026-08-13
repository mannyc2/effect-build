import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const docs = ["README.md", "architecture.md", "api.md", "drivers.md", "errors.md"];

const loadAll = async (paths: string[], directory: string): Promise<string> =>
  (await Promise.all(paths.map((path) => readFile(resolve(root, directory, path), "utf8")))).join("\n");

const targetList = (text: string, provider: "Bun" | "Deno", next: string): string[] => {
  const marker = `\`${provider}.Target\` has exactly six targets:\n\n`;
  const block = text.split(marker)[1]?.split(`\n\n${next}`)[0] ?? "";
  return [...block.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1] ?? "");
};

describe("documentation contract", () => {
  it("keeps the exact final documentation and example manifests", async () => {
    expect((await readdir(resolve(root, "docs"))).sort()).toEqual([...docs].sort());
    expect((await readdir(resolve(root, "examples"))).sort()).toEqual(["README.md", "bun", "deno"]);
    expect((await readdir(resolve(root, "examples/bun/src"))).sort()).toEqual(["compile.ts", "matrix.ts"]);
    expect(await readdir(resolve(root, "examples/deno/src"))).toEqual(["compile.ts"]);
  });

  it("starts with the two-input scalar operation and official host composition", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const firstTypeScript = readme.match(/```ts\n([\s\S]*?)```/)?.[1] ?? "";
    expect(firstTypeScript).toContain('from "effect-build-bun"');
    expect(firstTypeScript).toContain("entrypoint:");
    expect(firstTypeScript).toContain("outfile:");
    expect(firstTypeScript).toContain("Effect.provide(Bun.layer())");
    expect(firstTypeScript).toContain("Effect.provide(NodeServices.layer)");
    expect(firstTypeScript).not.toMatch(/\b(cwd|target|digest|options):/);
  });

  it("documents the bounded Effect 4.0 peer and exact current reference install", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const install = readme.match(/For the Bun compiler provider:\n\n```sh\n([^`]+)\n```/)?.[1] ?? "";

    expect(install).toBe(
      "bun add effect-build effect-build-bun effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108",
    );
    expect(readme).toContain("`>=4.0.0-beta.104 <4.1.0-0`");
    expect(readme).not.toContain("4.0.0-beta.107");
  });

  it("documents the exact scalar-plus-matrix product boundary", async () => {
    const agents = await readFile(resolve(root, "AGENTS.md"), "utf8");
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    const docsIndex = await readFile(resolve(root, "docs/README.md"), "utf8");

    for (const text of [agents, readme, api, docsIndex]) {
      expect(text).toContain("compileExecutable");
      expect(text).toContain("compileExecutableMatrix");
    }
    expect(agents).toContain("exactly two public operations");
    expect(api).toContain("The core root runtime keys are `Artifact`, `BuildError`, `MatrixError`, and");
    expect(api).toContain("exactly five runtime keys");
    expect(api).toContain("There is no root compile");
    expect(readme).toMatch(/closed authoring SPI/);
    for (const packageName of ["effect-build", "effect-build-bun", "effect-build-deno"]) {
      expect(`${agents}\n${readme}`).toContain(packageName);
    }
  });

  it("documents a homogeneous matrix with canonical names and one composition boundary", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const example = await readFile(resolve(root, "examples/bun/src/matrix.ts"), "utf8");
    const text = `${readme}\n${example}`;

    expect(text).toContain("Bun.compileExecutableMatrix({");
    expect(text).toContain('targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"]');
    expect(text).toContain("concurrency: 2");
    expect(text).toContain("digest: true");
    expect(text).toContain("dist/app-macos-aarch64");
    expect(text).toContain("dist/app-linux-x64-gnu");
    expect(text).toContain("dist/app-windows-x64.exe");
    expect(example.match(/Effect\.provide\(compiler\)/g)).toHaveLength(1);
    expect(example.match(/Effect\.provide\(NodeServices\.layer\)/g)).toHaveLength(1);
    expect(example).not.toContain("Deno");
  });

  it("documents total preflight, stable collect-all results, partial commits, and interruption", async () => {
    const text = [
      await readFile(resolve(root, "README.md"), "utf8"),
      await readFile(resolve(root, "docs/api.md"), "utf8"),
      await readFile(resolve(root, "docs/architecture.md"), "utf8"),
      await readFile(resolve(root, "docs/errors.md"), "utf8"),
    ].join("\n");

    expect(text).toMatch(/total preflight/i);
    expect(text).toMatch(/before (?:any )?filesystem/i);
    expect(text).toMatch(/positive safe integer/i);
    expect(text).toMatch(/defaults to 1/i);
    expect(text).toMatch(/collect-all/i);
    expect(text).toMatch(/target input order/i);
    expect(text).toMatch(/already committed Artifacts/i);
    expect(text).toMatch(/does not roll (?:them )?back|no matrix-wide rollback/i);
    expect(text).toMatch(/queued cells do not start|skips queued matrix cells/i);
    expect(text).toMatch(/exact interruption Cause/i);
  });

  it("keeps BuildError and MatrixError separate and exhaustive", async () => {
    const api = await readFile(resolve(root, "docs/api.md"), "utf8");
    const errors = await readFile(resolve(root, "docs/errors.md"), "utf8");
    const text = `${api}\n${errors}`;

    expect(text).toContain("BuildError.BuildError");
    expect(text).toContain("MatrixError.MatrixError");
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
        "InvalidMatrixInput",
        "MatrixFailed",
      ]
    ) expect(api).toContain(`${tag}:`);
    expect(text).toMatch(/unions are intentionally separate|separate closed tagged-error unions/i);
    expect(text).toMatch(/interruption belongs to neither union/i);
  });

  it("documents distinct compilers, exact evidenced targets, discovery, and target authority", async () => {
    const drivers = await readFile(resolve(root, "docs/drivers.md"), "utf8");
    expect(drivers).toContain('| `sourcemap` | `"linked" \\| "inline"`');
    expect(drivers).toContain("| scoped permissions | `true \\| readonly string[]`");
    expect(drivers).toContain("PATH");
    expect(drivers).toContain("Bun.layer({ executable:");
    expect(drivers).toContain("Deno.layer({ executable:");
    expect(drivers).toMatch(/single authority/i);
    expect(drivers).toContain("Bun 6/6 and Deno 6/6");
    expect(drivers).toContain("/usr/bin/file");
    expect(drivers).toContain("/usr/bin/readelf");
    expect(targetList(drivers, "Bun", "Bun 1.3.9")).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ]);
    expect(targetList(drivers, "Deno", "Deno musl")).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-aarch64-gnu",
      "windows-x64",
      "windows-aarch64",
    ]);
  });

  it("documents atomic states, divergences, and the one-way provider boundary", async () => {
    const architecture = await readFile(resolve(root, "docs/architecture.md"), "utf8");
    expect(architecture).toContain("## Atomic publication states");
    expect(architecture).toContain("## Divergence register");
    expect(architecture).toMatch(/sibling staged path/i);
    expect(architecture).toMatch(/interruption closes Scope and kills the compiler/i);
    expect(architecture).toMatch(/one closed value/i);
    expect(architecture).toMatch(/Core never imports a provider package/i);
  });

  it("rejects obsolete product language everywhere user-facing", async () => {
    const text = [
      await readFile(resolve(root, "README.md"), "utf8"),
      await readFile(resolve(root, "AGENTS.md"), "utf8"),
      await loadAll(docs, "docs"),
      await readFile(resolve(root, "examples/README.md"), "utf8"),
      await readFile(resolve(root, "packages/effect-build/README.md"), "utf8"),
      await readFile(resolve(root, "packages/effect-build-bun/README.md"), "utf8"),
      await readFile(resolve(root, "packages/effect-build-deno/README.md"), "utf8"),
    ].join("\n");
    const prohibited = new RegExp(
      [
        "\\bproof\\b",
        "attestation",
        "input closure",
        "truthful terminal record",
        "byte[- ]identical",
        "hermetic",
        "Configured" + "Observed",
        "Resolved" + "Build",
        "material" + "ize",
        "experimental target",
        "fail-fast",
        "one public operation",
        "Effect\\.all\\(\\[mac, linux\\]",
      ].join("|"),
      "i",
    );
    expect(text).not.toMatch(prohibited);
    expect(text).not.toMatch(/effect-build\/(bun|deno)/);
    expect(text).not.toMatch(new RegExp(["pn", "pm (?:add|run|install|verify)"].join("")));
  });
});
