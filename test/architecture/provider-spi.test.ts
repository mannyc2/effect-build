import { Context, Result, Schema } from "effect";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Provider from "effect-build/Provider";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const targetEntries = [["linux-x64-gnu", "fixture-linux-x64"]] as const;
const Stages = Schema.Tuple([
  Schema.Struct({
    operation: Schema.Literal("compile-executable"),
    tool: Schema.Struct({
      name: Schema.Literal("fixture"),
      version: Schema.NonEmptyString,
      path: Schema.optionalKey(Schema.String),
    }),
  }),
]);
type Stages = typeof Stages.Type;

class FixtureCompiler extends Context.Service<
  FixtureCompiler,
  Provider.CompilerService<"fixture", Record<string, never>, "linux-x64-gnu", Stages>
>()("test/FixtureCompiler") {}

const defineFixture = (
  overrides: Partial<{
    readonly name: string;
    readonly targetEntries: unknown;
    readonly defaultTarget: unknown;
    readonly Stages: unknown;
  }> = {},
) =>
  Provider.define({
    name: (overrides.name ?? "fixture") as "fixture",
    service: FixtureCompiler,
    makeService: (
      context: Provider.CommandServiceContext<
        "fixture",
        Record<string, never>,
        "linux-x64-gnu",
        Stages
      >,
    ) =>
      Object.freeze({
        compileExecutable: context.compileExecutable,
        compileExecutableMatrix: context.compileExecutableMatrix,
      }),
    targetEntries: (overrides.targetEntries ?? targetEntries) as typeof targetEntries,
    Stages: (overrides.Stages ?? Stages) as typeof Stages,
    ...(overrides.defaultTarget === undefined
      ? { defaultTarget: "linux-x64-gnu" as const }
      : { defaultTarget: overrides.defaultTarget as "linux-x64-gnu" }),
    validateOptions: () => Result.succeed({}),
    probeArgv: ["--version"],
    renderArgv: ({ stagedOutfile }) => ["--output", stagedOutfile],
    interpretFailure: (completion) => [{ channel: "stderr", ...completion.stderr }],
  });

describe("command-only provider SPI", () => {
  it("keeps Bun and Deno target tables unchanged", () => {
    expect(Bun.Target.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ]);
    expect(Deno.Target.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-aarch64-gnu",
      "windows-x64",
      "windows-aarch64",
    ]);
  });

  it("derives exact provider Artifact and MatrixError schemas from one definition", () => {
    const implementation = defineFixture();
    expect(Object.keys(implementation).sort()).toEqual([
      "Artifact",
      "MatrixError",
      "Target",
      "compileExecutable",
      "compileExecutableMatrix",
      "layer",
    ]);
    expect(
      Schema.is(implementation.Artifact)({
        path: "/tmp/app",
        bytes: 1,
        provider: "fixture",
        target: "linux-x64-gnu",
        stages: [{
          operation: "compile-executable",
          tool: { name: "fixture", version: "1.0.0", path: "/tmp/compiler" },
        }],
      }),
    ).toBe(true);
    expect(
      Schema.is(implementation.Artifact)({
        path: "/tmp/app",
        bytes: 1,
        provider: "other",
        target: "linux-x64-gnu",
        stages: [{
          operation: "compile-executable",
          tool: { name: "fixture", version: "1.0.0" },
        }],
      }),
    ).toBe(false);
  });

  it("fails closed on every author-configuration defect", () => {
    const cases: readonly [Partial<Parameters<typeof defineFixture>[0]>, string][] = [
      [{ name: "" }, "provider name must be non-empty"],
      [{ targetEntries: [] }, "provider targetEntries must be non-empty"],
      [{ targetEntries: [["browser", "x"]] }, "provider target must be a known SystemTarget"],
      [{
        targetEntries: [["linux-x64-gnu", "x"], ["linux-x64-gnu", "y"]],
      }, "provider targetEntries must not contain duplicate targets"],
      [{ targetEntries: [["linux-x64-gnu", ""]] }, "provider native target token must be non-empty"],
      [{ defaultTarget: "macos-x64" }, "provider default target must appear in targetEntries"],
    ];
    for (const [overrides, message] of cases) {
      expect(() => defineFixture(overrides)).toThrow(message);
    }
  });

  it("has no closed integration catalog or composed branch in core", async () => {
    await expect(access(resolve(root, "packages/effect-build/src/internal/ProviderContracts.ts"))).rejects.toThrow();
    const sources = await Promise.all([
      "packages/effect-build/src/Provider.ts",
      "packages/effect-build/src/standalone/Artifact.ts",
      "packages/effect-build/src/standalone/MatrixError.ts",
    ].map((file) => readFile(resolve(root, file), "utf8")));
    for (const source of sources) {
      expect(source).not.toMatch(/node-sea|esbuild|"bun"|"deno"|Composed/);
    }
    for (const provider of ["effect-build-bun", "effect-build-deno"]) {
      const source = await readFile(resolve(root, `packages/${provider}/src/index.ts`), "utf8");
      expect(source.match(/Provider\.define\(/g), provider).toHaveLength(1);
    }
    const nodeSource = await readFile(resolve(root, "packages/effect-build-node-sea/src/index.ts"), "utf8");
    expect(nodeSource).not.toContain("Provider.define");
  });

  it("keeps lifecycle internals private", async () => {
    const coreManifest = JSON.parse(await readFile(resolve(root, "packages/effect-build/package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(coreManifest.exports)).toEqual([".", "./Integration", "./Provider"]);
    const declaration = await readFile(resolve(root, "packages/effect-build/dist/Provider.d.ts"), "utf8");
    for (
      const capability of [
        "ProcessCompletion",
        "CompilerAdapter",
        "discoverTool",
        "makeCompilerService",
        "ExecuteCommand",
        "CommandCompletion",
        "Diagnostic",
      ]
    ) {
      expect(declaration, capability).not.toMatch(new RegExp(`export[^;]*\\b${capability}\\b`));
    }
    expect(declaration).not.toMatch(/Composed/);
  });
});
