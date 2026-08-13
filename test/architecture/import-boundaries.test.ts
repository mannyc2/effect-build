import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const packageRoot = resolve(root, "packages");
const packageNames = ["effect-build", "effect-build-bun", "effect-build-deno"] as const;

const sourceFiles = async (): Promise<string[]> => {
  const files: string[] = [];
  for (const name of packageNames) {
    const sourceRoot = resolve(packageRoot, name, "src");
    const entries = await readdir(sourceRoot, { recursive: true });
    files.push(...entries.filter((entry) => entry.endsWith(".ts")).map((entry) => resolve(sourceRoot, entry)));
  }
  return files;
};

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("workspace source ownership boundaries", () => {
  it("keeps all library source on Effect platform-neutral services", async () => {
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/from ["']node:/);
      expect(source, file).not.toContain("Effect.runPromise");
    }
  });

  it("confines effect/unstable/process to the core private process module and its type-only SPI reference", async () => {
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if ((await readFile(file, "utf8")).includes("effect/unstable/process")) found.push(relative(root, file));
    }
    expect(found.sort()).toEqual([
      "packages/effect-build/src/Provider.ts",
      "packages/effect-build/src/standalone/internal/Process.ts",
    ]);
    const provider = await readFile(resolve(root, "packages/effect-build/src/Provider.ts"), "utf8");
    expect(provider).toContain("import type { ChildProcessSpawner");
  });

  it("keeps the dependency direction core <- providers with no private cross-package imports", async () => {
    for (const file of await sourceFiles()) {
      const owner = relative(packageRoot, file).split("/")[0]!;
      for (const specifier of importSpecifiers(await readFile(file, "utf8"))) {
        if (owner === "effect-build") {
          expect(specifier, file).not.toMatch(/^effect-build-(?:bun|deno)(?:\/|$)/);
        } else if (owner === "effect-build-bun") {
          expect(specifier, file).not.toMatch(/^effect-build-deno(?:\/|$)/);
        } else if (owner === "effect-build-deno") {
          expect(specifier, file).not.toMatch(/^effect-build-bun(?:\/|$)/);
        }
        if (owner !== "effect-build") {
          expect(specifier, file).not.toMatch(/^effect-build\/(?:internal|standalone)(?:\/|$)/);
        }
        if (specifier.startsWith(".")) {
          const ownerRoot = resolve(packageRoot, owner);
          const resolvedImport = resolve(dirname(file), specifier);
          const fromOwner = relative(ownerRoot, resolvedImport);
          expect(
            isAbsolute(fromOwner) || fromOwner === ".." || fromOwner.startsWith(`..${sep}`),
            `${file} imports outside ${owner}: ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps provider-native tokens out of core", async () => {
    const coreFiles = (await sourceFiles()).filter((file) => file.includes("/packages/effect-build/src/"));
    for (const file of coreFiles) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/bun-(?:darwin|linux|windows)|(?:x86_64|aarch64)-(?:apple|unknown|pc)-/);
    }
  });
});
