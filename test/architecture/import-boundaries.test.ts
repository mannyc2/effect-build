import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

const sourceFiles = async (): Promise<string[]> => {
  const entries = await readdir(resolve(root, "src"), { recursive: true });
  return entries.filter((entry) => entry.endsWith(".ts")).map((entry) => resolve(root, "src", entry));
};

const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

const compilerSpecific = new Set([
  resolve(root, "src/Bun.ts"),
  resolve(root, "src/Deno.ts"),
  resolve(root, "src/standalone/internal/BunAdapter.ts"),
  resolve(root, "src/standalone/internal/DenoAdapter.ts"),
]);

describe("source ownership boundaries", () => {
  it("keeps library source on Effect platform-neutral services", async () => {
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/from "node:/);
      expect(source, file).not.toContain("Effect.runPromise");
    }
  });

  it("confines effect/unstable/process to the private process module", async () => {
    const allowed = [
      resolve(root, "src/standalone/internal/Process.ts"),
    ];
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if ((await readFile(file, "utf8")).includes("effect/unstable/process")) found.push(file);
    }
    expect(found.sort()).toEqual(allowed.sort());
  });

  it("keeps core standalone modules free of compiler-specific imports", async () => {
    for (const file of await sourceFiles()) {
      if (compilerSpecific.has(file) || file === resolve(root, "src/index.ts")) continue;
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/from "[./]*Bun\.js"|from "[./]*Deno\.js"/);
      expect(source, file).not.toMatch(/BunAdapter|DenoAdapter/);
    }
  });

  it("keeps provider target tables pure and dependent only on the shared table primitive", async () => {
    for (const name of ["BunTarget.ts", "DenoTarget.ts"]) {
      const file = resolve(root, "src/standalone/internal", name);
      expect(importSpecifiers(await readFile(file, "utf8")), file).toEqual(["./TargetTable.js"]);
    }
  });

  it("allowlists every source module that imports a provider target contract", async () => {
    const importers: string[] = [];
    for (const file of await sourceFiles()) {
      if (
        importSpecifiers(await readFile(file, "utf8")).some((specifier) =>
          /(?:BunTarget|DenoTarget)\.js$/.test(specifier)
        )
      ) {
        importers.push(file);
      }
    }
    expect(importers.sort()).toEqual([
      resolve(root, "src/Bun.ts"),
      resolve(root, "src/Deno.ts"),
      resolve(root, "src/standalone/Artifact.ts"),
      resolve(root, "src/standalone/MatrixError.ts"),
      resolve(root, "src/standalone/internal/BunAdapter.ts"),
      resolve(root, "src/standalone/internal/DenoAdapter.ts"),
    ].sort());
  });

  it("keeps the package export map at exactly the three public paths", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      engines?: unknown;
    };
    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./bun", "./deno"]);
    expect(packageJson.engines).toBeUndefined();
  });
});
