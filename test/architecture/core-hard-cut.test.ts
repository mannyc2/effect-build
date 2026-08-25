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
  "./Author/Tool",
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
      "Matrix",
      "SystemTarget",
      "Tool",
    ]);
  });

  it("has no compatibility source for retired generic authorities", async () => {
    for (
      const retired of [
        "src/BuildError.ts",
        "src/Target.ts",
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
    const commit = source.indexOf("fileSystem.rename(stagedPath, destination)");
    expect(inspection).toBeGreaterThan(-1);
    expect(reauthentication).toBeGreaterThan(inspection);
    expect(commit).toBeGreaterThan(reauthentication);
  });

  it("keeps all four deferred profile candidates package-private", async () => {
    const nodeMainPath = resolve(core, "src/Author/NodeMain.ts");
    const browserPath = resolve(core, "src/Profile/BrowserModulePayload.ts");
    const incrementalPath = resolve(core, "src/Profile/internal/IncrementalNodeMain.ts");
    const watchPath = resolve(core, "src/Profile/internal/TypedWatch.ts");
    const incrementalAdaptersPath = resolve(root, "test/fixtures/incremental-node-main-adapters.ts");
    expect(await exists(nodeMainPath)).toBe(true);
    expect(await exists(browserPath)).toBe(true);
    expect(await exists(incrementalPath)).toBe(true);
    expect(await exists(watchPath)).toBe(true);
    expect(await exists(incrementalAdaptersPath)).toBe(true);

    const manifest = JSON.parse(await readFile(resolve(core, "package.json"), "utf8")) as {
      readonly exports: Readonly<Record<string, unknown>>;
    };
    expect(Object.keys(manifest.exports)).not.toContain("./Author/NodeMain");
    expect(Object.keys(manifest.exports)).not.toContain("./Profile/BrowserModulePayload");
    expect(Object.keys(manifest.exports).some((key) => key.includes("IncrementalNodeMain"))).toBe(false);
    expect(Object.keys(manifest.exports).some((key) => key.includes("TypedWatch"))).toBe(false);

    const incremental = await readFile(incrementalPath, "utf8");
    const watch = await readFile(watchPath, "utf8");
    expect(incremental).toContain('state.phase = "closing"');
    expect(incremental.indexOf('state.phase = "closing"')).toBeLessThan(
      incremental.indexOf("semaphore.withPermit", incremental.indexOf('state.phase = "closing"')),
    );
    expect(incremental).toContain("Effect.orDie");
    expect(watch).toContain("withoutOutputSide");
    expect(watch).toContain("maxPendingChanges");
    expect(watch).not.toMatch(/\.stdout|\.stderr|ChildProcess|Command\.make/u);

    const adapters = await readFile(incrementalAdaptersPath, "utf8");
    expect(adapters).toContain("../../packages/effect-build-esbuild/src/internal/ContextOwner.js");
    expect(adapters).toContain("../../packages/effect-build-rolldown/src/internal/BuildOwner.js");
    expect(adapters).not.toMatch(/from\s+["']effect-build(?:-|\/)/u);
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
