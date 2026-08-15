import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const publicPackages = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
] as const;
const peerRange = ">=4.0.0-beta.104 <4.1.0-0";
const referenceVersion = "4.0.0-rc.108";

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<string, unknown>;

const manifestFor = (name: typeof publicPackages[number]): Promise<Record<string, unknown>> =>
  readJson(`packages/${name}/package.json`);

describe("Bun workspace package graph", () => {
  it("has one private, exactly pinned workspace root", async () => {
    const manifest = await readJson("package.json");
    expect(manifest.name).toBe("effect-build-workspace");
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.packageManager).toBe("bun@1.3.14");
    expect(manifest.workspaces).toEqual([
      "packages/*",
      "examples/bun",
      "examples/deno",
      "examples/esbuild",
      "examples/node-sea",
    ]);
    expect(await readFile(resolve(root, ".npmrc"), "utf8")).toBe("@jsr:registry=https://npm.jsr.io\n");
    await expect(access(resolve(root, "bun.lock"))).resolves.toBeUndefined();
    for (const alternate of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
      await expect(access(resolve(root, alternate))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("contains exactly the five lockstep public packages", async () => {
    const directories = (await readdir(resolve(root, "packages"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([...publicPackages].sort());
    for (const name of publicPackages) {
      const manifest = await manifestFor(name);
      expect(manifest.name).toBe(name);
      expect(manifest.version).toBe("0.3.0");
      expect(manifest.private).not.toBe(true);
    }
  });

  it("keeps provider dependencies one-way and ordinary", async () => {
    const core = await manifestFor("effect-build");
    const bun = await manifestFor("effect-build-bun");
    const deno = await manifestFor("effect-build-deno");
    const esbuild = await manifestFor("effect-build-esbuild");
    const nodeSea = await manifestFor("effect-build-node-sea");
    expect(core.dependencies).toBeUndefined();
    expect(core.peerDependencies).toEqual({ effect: peerRange });
    expect(bun.dependencies).toEqual({ "effect-build": "workspace:^" });
    expect(deno.dependencies).toEqual({ "effect-build": "workspace:^" });
    expect(esbuild.dependencies).toEqual({ "effect-build": "workspace:^", esbuild: "0.28.2" });
    expect(nodeSea.dependencies).toEqual({ "effect-build": "workspace:^" });
    for (
      const [provider, name] of [
        [bun, "effect-build-bun"],
        [deno, "effect-build-deno"],
        [esbuild, "effect-build-esbuild"],
        [nodeSea, "effect-build-node-sea"],
      ] as const
    ) {
      expect((provider.peerDependencies as Record<string, string>)["effect-build"]).toBeUndefined();
      for (const sibling of publicPackages) {
        if (sibling === "effect-build" || sibling === name) continue;
        expect((provider.dependencies as Record<string, string>)[sibling]).toBeUndefined();
        expect((provider.peerDependencies as Record<string, string>)[sibling]).toBeUndefined();
      }
    }
  });

  it("freezes peer, development, export, and publication metadata", async () => {
    for (const name of publicPackages) {
      const manifest = await manifestFor(name);
      expect(manifest.peerDependencies).toEqual({ effect: peerRange });
      expect(manifest.devDependencies).toEqual({ effect: referenceVersion });
      expect(manifest.files).toEqual(["dist", "README.md", "LICENSE"]);
      expect(manifest.sideEffects).toBe(false);
      expect(manifest.license).toBe("MIT");
      expect(manifest.publishConfig).toEqual({ access: "public", provenance: true });
      expect(manifest.repository).toEqual({
        type: "git",
        url: "git+https://github.com/mannyc2/effect-build.git",
        directory: `packages/${name}`,
      });
      expect(Object.keys(manifest)).not.toContain("engines");
      const exports = manifest.exports as Record<string, { types: string; import: string }>;
      expect(Object.keys(exports).sort()).toEqual(
        name === "effect-build" ? [".", "./Integration", "./Provider"] : ["."],
      );
      for (const value of Object.values(exports)) {
        expect(value.types).toMatch(/^\.\/dist\/.*\.d\.ts$/);
        expect(value.import).toMatch(/^\.\/dist\/.*\.js$/);
        expect(JSON.stringify(value)).not.toContain("src/");
      }
      expect(Object.keys(exports).some((key) => key.includes("internal"))).toBe(false);
    }
  });

  it("has no legacy provider subpath or alternate public package", async () => {
    const core = await manifestFor("effect-build");
    expect(Object.keys(core.exports as Record<string, unknown>)).toEqual([".", "./Integration", "./Provider"]);
    expect((core.exports as Record<string, unknown>)["./bun"]).toBeUndefined();
    expect((core.exports as Record<string, unknown>)["./deno"]).toBeUndefined();
    expect((core.exports as Record<string, unknown>)["./node-sea"]).toBeUndefined();
  });
});
