import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

describe("built public API", () => {
  it("matches the authored runtime-key allowlists", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      subpaths: string[];
      rootRuntimeKeys: string[];
      toolRuntimeKeys: string[];
    };
    expect(manifest.subpaths).toEqual([".", "./bun", "./deno"]);

    const api = await import(resolve(root, "dist/index.js"));
    expect(Object.keys(api).sort()).toEqual([...manifest.rootRuntimeKeys].sort());

    for (const module of ["Bun", "Deno"]) {
      const tool = await import(resolve(root, `dist/${module}.js`));
      expect(Object.keys(tool).sort()).toEqual([...manifest.toolRuntimeKeys].sort());
    }

    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(Object.keys(packageJson.exports).sort()).toEqual([...manifest.subpaths].sort());
    expect(packageJson.exports["./bun"]).toEqual({ types: "./dist/Bun.d.ts", import: "./dist/Bun.js" });
    expect(packageJson.exports["./deno"]).toEqual({ types: "./dist/Deno.d.ts", import: "./dist/Deno.js" });
  });

  it("keeps the build output at exactly the standalone module tree", async () => {
    const entries = await readdir(resolve(root, "dist"), { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(directories).toEqual(["standalone"]);
    const moduleNames = new Set(
      entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name),
    );
    expect([...moduleNames].sort()).toEqual(["Bun.js", "Deno.js", "index.js"]);
  });
});
