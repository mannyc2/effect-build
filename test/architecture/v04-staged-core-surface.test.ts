import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const readJson = async <A>(path: string): Promise<A> => JSON.parse(await readFile(resolve(root, path), "utf8")) as A;
const git = (...argv: readonly string[]): string =>
  execFileSync("git", [...argv], { cwd: root, encoding: "utf8" }).trim();

interface SurfaceSubpath {
  readonly subpath: string;
  readonly rootNamespace: string;
  readonly exports: readonly string[];
  readonly runtimeExports: readonly string[];
  readonly typeExports: readonly string[];
}

interface Surface {
  readonly schema: string;
  readonly coreSurface: { readonly subpaths: readonly SurfaceSubpath[] };
}

interface Profile {
  readonly phase: string;
  readonly coreStagedFiles: readonly string[];
  readonly immutablePublicPaths: readonly string[];
  readonly productionBaseline: { readonly handoffSha: string };
  readonly workspaceManifest: {
    readonly path: string;
    readonly scriptAppends: Readonly<Record<string, string>>;
  };
  readonly migrationPlan: string;
}

interface Migration {
  readonly mappingGroups: readonly { readonly rule: string; readonly identities: readonly string[] }[];
  readonly rules: readonly {
    readonly id: string;
    readonly disposition: "retain" | "rename" | "replace" | "remove";
    readonly target: null | {
      readonly status: string;
      readonly coordinatesByIdentity: Readonly<Record<string, unknown>>;
    };
  }[];
}

interface MigrationPlan {
  readonly schema: string;
  readonly source: string;
  readonly authorityCount: number;
  readonly authoritySetSha256: string;
  readonly rules: readonly {
    readonly rule: string;
    readonly disposition: "replace" | "remove";
    readonly target: null | Readonly<Record<string, unknown>>;
    readonly plan044Action: "replace" | "delete";
  }[];
  readonly legacySourceFiles: readonly { readonly path: string; readonly action: string }[];
  readonly stagingRules: Readonly<Record<string, string>>;
}

const expectedSubpaths = [
  "./Artifact",
  "./Author/BorrowedOutput",
  "./Author/Executable",
  "./Author/Tool",
  "./Matrix",
  "./SystemTarget",
];
const expectedRootNamespaces = [
  ["./Artifact", "Artifact"],
  ["./Author/BorrowedOutput", "BorrowedOutput"],
  ["./Author/Executable", "Executable"],
  ["./Author/Tool", "Tool"],
  ["./Matrix", "Matrix"],
  ["./SystemTarget", "SystemTarget"],
] as const;
const expectedMigrationRules = [
  "MAP-CORE-ARTIFACT-REPLACE",
  "MAP-CORE-BUILD-ERROR-REMOVE",
  "MAP-CORE-BUNDLE-REMOVE",
  "MAP-CORE-MATRIX-REPLACE",
  "MAP-CORE-RESOLUTION-TARGET-REMOVE",
  "MAP-CORE-STAGE-REMOVE",
  "MAP-CORE-TARGET-REPLACE",
  "MAP-INTEGRATION-EXPORTS-REMOVE",
  "MAP-INTEGRATION-SUBPATH-REMOVE",
  "MAP-PROVIDER-EXPORTS-REMOVE",
  "MAP-PROVIDER-SUBPATH-REMOVE",
].sort();
const expectedAuthoritySetSha256 = "a0bdf3b59a1a85bbc448decd0186e29c0fabe7c04e3203ff6657af5f746bb3fe";
const expectedLegacyReplacePaths = [
  "packages/effect-build/src/standalone/Artifact.ts",
  "packages/effect-build/src/standalone/MatrixError.ts",
  "packages/effect-build/src/standalone/Target.ts",
].sort();

const declarationExports = (program: ts.Program, file: string): readonly string[] => {
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error(`missing declaration module ${file}`);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const sourcePathForSubpath = (subpath: string): string => `packages/effect-build/src/${subpath.slice(2)}.ts`;

const distPathForSubpath = (subpath: string, extension: "js" | "d.ts"): string =>
  resolve(root, `packages/effect-build/dist/${subpath.slice(2)}.${extension}`);

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

const isTypeOnlyStatement = (statement: ts.Statement): boolean =>
  ts.isInterfaceDeclaration(statement)
  || ts.isTypeAliasDeclaration(statement)
  || (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true)
  || (ts.isExportDeclaration(statement) && statement.isTypeOnly);

const isEmptyModuleMarker = (statement: ts.Statement): boolean =>
  ts.isExportDeclaration(statement)
  && statement.moduleSpecifier === undefined
  && statement.exportClause !== undefined
  && ts.isNamedExports(statement.exportClause)
  && statement.exportClause.elements.length === 0;

describe("staged 0.4 core surface", () => {
  it("stages exactly the six frozen modules without publishing them", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const subpaths = surface.coreSurface.subpaths.map(({ subpath }) => subpath).sort();
    expect(surface.schema).toBe("effect-build/public-surface@2");
    expect(profile.phase).toBe("implementation");
    expect(subpaths).toEqual(expectedSubpaths);
    expect(
      surface.coreSurface.subpaths.map(({ rootNamespace, subpath }) => [subpath, rootNamespace]).sort(),
    ).toEqual(expectedRootNamespaces);
    expect(profile.coreStagedFiles.slice().sort()).toEqual(subpaths.map(sourcePathForSubpath).sort());
    expect(surface.coreSurface.subpaths.filter(({ subpath }) => subpath.startsWith("./Author/"))).toHaveLength(3);

    const manifest = await readJson<{ readonly exports: Readonly<Record<string, unknown>> }>(
      "packages/effect-build/package.json",
    );
    expect(Object.keys(manifest.exports)).toEqual([".", "./Integration", "./Provider"]);
    expect(Object.keys(manifest.exports).some((path) => expectedSubpaths.includes(path))).toBe(false);

    const rootIndex = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    for (const subpath of surface.coreSurface.subpaths) {
      expect(rootIndex).not.toContain(`from "${subpath.subpath}.js"`);
    }

    const handoffWorkspace = JSON.parse(git(
      "show",
      `${profile.productionBaseline.handoffSha}:${profile.workspaceManifest.path}`,
    )) as { scripts: Record<string, string> };
    const expectedWorkspace = structuredClone(handoffWorkspace);
    for (const [script, append] of Object.entries(profile.workspaceManifest.scriptAppends)) {
      expectedWorkspace.scripts[script] = `${expectedWorkspace.scripts[script]}${append}`;
    }
    expect(await readJson(profile.workspaceManifest.path)).toEqual(expectedWorkspace);
  });

  it("emits the exact frozen runtime and declaration symbol sets", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const declarationPaths = surface.coreSurface.subpaths.map(({ subpath }) => distPathForSubpath(subpath, "d.ts"));
    const program = ts.createProgram({
      rootNames: declarationPaths,
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
      },
    });
    for (const contract of surface.coreSurface.subpaths) {
      const runtime = await import(distPathForSubpath(contract.subpath, "js"));
      expect(Object.keys(runtime).sort(), contract.subpath).toEqual(contract.runtimeExports.slice().sort());
      expect(declarationExports(program, distPathForSubpath(contract.subpath, "d.ts")), contract.subpath).toEqual(
        contract.exports.slice().sort(),
      );
      expect([...new Set([...contract.runtimeExports, ...contract.typeExports])].sort(), contract.subpath).toEqual(
        contract.exports.slice().sort(),
      );
    }
  }, 15_000);

  it("keeps the type-only Author contracts source- and runtime-inert", async () => {
    for (const subpath of ["./Author/BorrowedOutput", "./Author/Executable"] as const) {
      const sourcePath = resolve(root, sourcePathForSubpath(subpath));
      const source = ts.createSourceFile(
        sourcePath,
        await readFile(sourcePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      expect(source.statements.every(isTypeOnlyStatement), subpath).toBe(true);

      const outputPath = distPathForSubpath(subpath, "js");
      const output = ts.createSourceFile(
        outputPath,
        await readFile(outputPath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      expect(output.statements, subpath).toHaveLength(1);
      expect(isEmptyModuleMarker(output.statements[0]!), subpath).toBe(true);
    }
  });

  it("keeps every released public authority byte-identical to the handoff", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    for (const path of profile.immutablePublicPaths) {
      expect(await readFile(resolve(root, path), "utf8"), path).toBe(
        `${git("show", `${profile.productionBaseline.handoffSha}:${path}`)}\n`,
      );
    }
  });

  it("accounts for every frozen core remove-or-replace authority and legacy file", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const migration = await readJson<Migration>("research/post-0.3/freeze/MIGRATION.json");
    const plan = await readJson<MigrationPlan>(profile.migrationPlan);
    const ruleIds = plan.rules.map(({ rule }) => rule);
    const groups = migration.mappingGroups.filter(({ rule }) => ruleIds.includes(rule));
    const sourceRules = new Map(migration.rules.map((rule) => [rule.id, rule]));
    expect(plan.schema).toBe("effect-build/plan039-core-migration@1");
    expect(plan.source).toBe("research/post-0.3/freeze/MIGRATION.json");
    expect(groups.map(({ rule }) => rule).sort()).toEqual(ruleIds.slice().sort());
    expect(ruleIds.slice().sort()).toEqual(expectedMigrationRules);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    for (const rule of plan.rules) {
      const sourceRule = sourceRules.get(rule.rule);
      expect(sourceRule, rule.rule).toBeDefined();
      expect(rule.disposition, rule.rule).toBe(sourceRule?.disposition);
      expect(rule.plan044Action, rule.rule).toBe(rule.disposition === "replace" ? "replace" : "delete");
      expect(rule.target, rule.rule).toEqual(sourceRule?.target?.coordinatesByIdentity ?? null);
      if (rule.disposition === "remove") expect(rule, rule.rule).not.toHaveProperty("replacement");
    }

    const authorities = groups.flatMap(({ identities }) => identities).sort();
    const digest = createHash("sha256").update(`${authorities.join("\n")}\n`).digest("hex");
    expect(authorities).toHaveLength(plan.authorityCount);
    expect(digest).toBe(plan.authoritySetSha256);
    expect(plan.authoritySetSha256).toBe(expectedAuthoritySetSha256);
    expect(authorities).toHaveLength(71);

    const legacyFiles = git(
      "ls-tree",
      "-r",
      "--name-only",
      profile.productionBaseline.handoffSha,
      "packages/effect-build/src",
    ).split("\n").filter((path) => path !== "packages/effect-build/src/index.ts").sort();
    expect(plan.legacySourceFiles.map(({ path }) => path).sort()).toEqual(legacyFiles);
    expect(
      plan.legacySourceFiles.filter(({ action }) => action === "replace-at-plan044").map(({ path }) => path).sort(),
    ).toEqual(expectedLegacyReplacePaths);
    expect(
      plan.legacySourceFiles.filter(({ action }) => action === "delete-at-plan044").map(({ path }) => path).sort(),
    ).toEqual(legacyFiles.filter((path) => !expectedLegacyReplacePaths.includes(path)));
    expect(plan.stagingRules.compatibilityDelegates).toBe("forbidden");
    expect(plan.stagingRules.secondPublicPaths).toBe("forbidden");
  });

  it("keeps the staged contracts independent of every released implementation", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const sourceFiles = (await readdir(resolve(root, "packages/effect-build/src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => `packages/effect-build/src/${entry}`);
    const historicalFiles = git(
      "ls-tree",
      "-r",
      "--name-only",
      profile.productionBaseline.handoffSha,
      "packages/effect-build/src",
    ).split("\n");
    expect(sourceFiles.filter((path) => !historicalFiles.includes(path)).sort()).toEqual(
      profile.coreStagedFiles.slice().sort(),
    );
    for (const path of profile.coreStagedFiles) {
      const source = await readFile(resolve(root, path), "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, relative(root, path)).not.toMatch(/(?:standalone|Integration|Provider|JavaScriptBundle)/);
        expect(specifier, relative(root, path)).not.toMatch(/^effect-build-(?:bun|deno|esbuild|node-sea)(?:\/|$)/);
      }
    }
  });
});
