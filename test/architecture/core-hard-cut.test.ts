import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const core = resolve(root, "packages/effect-build");
const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

const exactExports = [
  ".",
  "./Artifact",
  "./Author/BorrowedOutput",
  "./Author/Executable",
  "./Author/File",
  "./Author/Tool",
  "./Author/Tree",
  "./Matrix",
  "./SystemTarget",
] as const;

describe("hard-cut core architecture", () => {
  it("exposes only the admitted selected primitives", async () => {
    const manifest = JSON.parse(await readFile(resolve(core, "package.json"), "utf8")) as {
      readonly exports: Readonly<Record<string, unknown>>;
    };
    expect(Object.keys(manifest.exports)).toEqual(exactExports);

    const index = await import(resolve(core, "dist/index.js"));
    expect(Object.keys(index).sort()).toEqual([
      "Artifact",
      "BorrowedOutput",
      "Executable",
      "File",
      "Matrix",
      "SystemTarget",
      "Tool",
      "Tree",
    ]);
  });

  it("has no compatibility source for retired generic authorities", async () => {
    for (
      const retired of [
        "src/BuildError.ts",
        "src/Target.ts",
        "src/Toolchain.ts",
        "src/Author/BorrowedContent.ts",
        "src/Author/Generation.ts",
        "src/Author/TreeSnapshot.ts",
        "src/Profile/StaticBrowserApplication.ts",
      ]
    ) {
      expect(await exists(resolve(core, retired)), retired).toBe(false);
    }
  });

  it("constructs official commands without exporting generic process execution", async () => {
    const source = await readFile(resolve(core, "src/Author/Tool.ts"), "utf8");
    expect(source).toContain('import { ChildProcess } from "effect/unstable/process"');
    expect(source).toContain("ChildProcess.make(executablePath, argv, { ...options, shell: false })");
    expect(source).toContain("readonly reauthenticate:");
    expect(source).not.toMatch(/export const (?:run|runOrFail|capture|probe)\b/u);
  });

  it("keeps durable publication private and executable inspection pre-commit", async () => {
    const source = await readFile(resolve(core, "src/Author/internal/DurableFile.ts"), "utf8");
    const inspection = source.indexOf("const inspection = yield* inspect(");
    const reauthentication = source.indexOf("const after = yield* observeCandidate(");
    const commit = source.indexOf("fileSystem.link(verified, destination)");
    expect(inspection).toBeGreaterThan(-1);
    expect(reauthentication).toBeGreaterThan(inspection);
    expect(commit).toBeGreaterThan(reauthentication);
  });

  it("does not expose deferred profile candidates", async () => {
    const manifest = JSON.parse(await readFile(resolve(core, "package.json"), "utf8")) as {
      readonly exports: Readonly<Record<string, unknown>>;
    };
    expect(Object.keys(manifest.exports)).not.toContain("./Author/NodeMain");
    expect(Object.keys(manifest.exports)).not.toContain("./Profile/BrowserModulePayload");
    expect(Object.keys(manifest.exports).some((key) => key.includes("IncrementalNodeMain"))).toBe(false);
    expect(Object.keys(manifest.exports).some((key) => key.includes("TypedWatch"))).toBe(false);

    for (const provider of ["effect-build-esbuild", "effect-build-rolldown"]) {
      const providerManifest = JSON.parse(
        await readFile(resolve(root, "packages", provider, "package.json"), "utf8"),
      ) as { readonly exports: Readonly<Record<string, unknown>> };
      expect(Object.keys(providerManifest.exports).some((key) => key.includes("Incremental"))).toBe(false);
    }
  });

  it("keeps core library source platform-neutral", async () => {
    const sourceRoot = resolve(core, "src");
    for (const entry of await readdir(sourceRoot, { recursive: true })) {
      if (typeof entry !== "string" || !entry.endsWith(".ts")) continue;
      const source = await readFile(resolve(sourceRoot, entry), "utf8");
      expect(source, entry).not.toMatch(/from\s+["']node:/u);
      expect(source, entry).not.toMatch(/Effect\.run(?:Promise|Sync|Fork|Callback)/u);
    }
  });
});
