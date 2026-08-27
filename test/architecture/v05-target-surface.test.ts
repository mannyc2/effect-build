import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../..");

interface ResearchContract {
  readonly evidenceControl: {
    readonly certificationHosts: readonly {
      readonly id: string;
      readonly runner: string;
      readonly systemTarget: string;
    }[];
    readonly nodeMainExecutable: {
      readonly assemblerCell: string;
    };
    readonly coordinateRules: {
      readonly compilerTargets: {
        readonly coordinates: readonly { readonly compiler: string; readonly target: string }[];
        readonly expectedCoordinateCount: number;
        readonly targetExecutionClaim: string;
      };
      readonly nodeMainExecutable: {
        readonly expectedCartesianCoordinateCount: number;
        readonly expectedUnsupportedCoordinateCount: number;
        readonly expectedCoordinateCount: number;
        readonly explicitUnsupportedTargets: readonly {
          readonly target: string;
          readonly disposition: string;
          readonly assemblerCell: string;
          readonly classification: string;
          readonly revisitTrigger: string;
          readonly observation: {
            readonly observedCoordinateCount: number;
            readonly inferredCoordinateCount: number;
          };
        }[];
        readonly explicitUnsupportedCoordinates: readonly {
          readonly target: string;
          readonly disposition: string;
          readonly observation: string;
        }[];
      };
      readonly providerNativeLanes: {
        readonly explicitUnsupportedCoordinates: readonly {
          readonly providerRuntimeCell: string;
          readonly certificationHost: string;
        }[];
      };
    };
  };
  readonly releaseControl: {
    readonly orderedPackages: readonly string[];
    readonly conditionalPackageCandidates: readonly string[];
    readonly candidatePublicNodeSeaEvidenceFields: readonly string[];
  };
  readonly targetPublicSurface: {
    readonly coreModules: readonly string[];
    readonly privateProfileCandidates: readonly {
      readonly id: string;
      readonly implementationPath: string;
    }[];
    readonly providerLanes: readonly {
      readonly package: string;
      readonly requirement: "required" | "gate-dependent";
      readonly lanes: readonly {
        readonly lane: "Api" | "Command";
        readonly requirement: "required" | "gate-dependent";
        readonly rootNamespace: "Api" | "Command";
        readonly packageExport: "./Api" | "./Command";
        readonly modules: readonly {
          readonly module: string;
          readonly implementationPath: string;
          readonly requirement: "required" | "gate-dependent";
          readonly operations: readonly {
            readonly operationId: string;
            readonly export: string | null;
            readonly implementationExport: string;
          }[];
        }[];
      }[];
    }[];
  };
}

const readContract = async (): Promise<ResearchContract> =>
  JSON.parse(await readFile(resolve(root, "tooling/research-complete-contract.json"), "utf8")) as ResearchContract;

describe("research-complete target surface", () => {
  it("hard-cuts the transitional core Toolchain surface", async () => {
    const contract = await readContract();
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages/effect-build/package.json"), "utf8"),
    ) as { readonly exports: Readonly<Record<string, unknown>> };

    expect(Object.keys(manifest.exports).sort()).toEqual([".", ...contract.targetPublicSurface.coreModules].sort());

    const rootSource = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    expect(rootSource).not.toContain("Toolchain");

    const vitestConfig = await readFile(resolve(root, "vitest.config.ts"), "utf8");
    expect(vitestConfig).toContain("find: /^effect-build\\/(.+)$/u");
    expect(vitestConfig).toContain('replacement: resolve(coreRoot, "$1.ts")');
    expect(vitestConfig).not.toContain("effect-build/Toolchain");
  });

  it("removes bundle and tool authority from the public artifact model", async () => {
    const artifactSource = await readFile(resolve(root, "packages/effect-build/src/Artifact.ts"), "utf8");
    expect(artifactSource).not.toMatch(/export interface (?:Bundle|BundleFile|Tool)\b/);
  });

  it("does not mint target identity from the orchestrator host", async () => {
    const targetSource = await readFile(resolve(root, "packages/effect-build/src/SystemTarget.ts"), "utf8");
    expect(targetSource).not.toMatch(/export const host\b/);
    expect(targetSource).not.toContain("globalThis");
  });

  it("keeps proof-gated portable profiles implemented but package-private", async () => {
    const contract = await readContract();
    const manifest = JSON.parse(
      await readFile(resolve(root, "packages/effect-build/package.json"), "utf8"),
    ) as { readonly exports: Readonly<Record<string, unknown>> };
    const rootSource = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    for (const candidate of contract.targetPublicSurface.privateProfileCandidates) {
      expect(await readFile(resolve(root, candidate.implementationPath), "utf8"), candidate.id).toBeTypeOf("string");
    }
    expect(Object.keys(manifest.exports)).not.toContain("./Author/NodeMain");
    expect(Object.keys(manifest.exports)).not.toContain("./Profile/BrowserModulePayload");
    expect(rootSource).not.toContain("NodeMain");
    expect(rootSource).not.toContain("BrowserModulePayload");
    const consumer = await readFile(resolve(root, "scripts/test-built-consumer.mjs"), "utf8");
    expect(consumer).toContain('"--strict-peer-deps"');
    expect(consumer).toContain('"--install-strategy=nested"');
    expect(consumer).not.toContain("effect-build/Author/NodeMain");
    expect(consumer).not.toContain("effect-build/Profile/BrowserModulePayload");
  });

  it("hard-cuts every provider package to its truthful Api and Command roots", async () => {
    const contract = await readContract();
    const verifiedOperationIds: string[] = [];
    for (const provider of contract.targetPublicSurface.providerLanes) {
      const manifest = JSON.parse(
        await readFile(resolve(root, `packages/${provider.package}/package.json`), "utf8"),
      ) as { readonly private?: boolean; readonly exports: Readonly<Record<string, unknown>> };
      const publicLanes = provider.lanes.filter(({ requirement }) => requirement === "required");
      expect(Object.keys(manifest.exports), provider.package).toEqual([
        ".",
        ...publicLanes.map((lane) => lane.packageExport),
      ]);
      if (provider.requirement === "gate-dependent") expect(manifest.private, provider.package).toBe(true);
      const rootSource = await readFile(resolve(root, `packages/${provider.package}/src/index.ts`), "utf8");
      if (provider.requirement === "gate-dependent") {
        expect(rootSource, `${provider.package} conditional root`).not.toMatch(/^\s*export\s/mu);
      }
      for (const lane of provider.lanes) {
        if (lane.requirement === "required") {
          expect(rootSource, `${provider.package}.${lane.rootNamespace}`).toContain(
            `export * as ${lane.rootNamespace}`,
          );
        } else {
          expect(rootSource, `${provider.package}.${lane.rootNamespace}`).not.toContain(
            `export * as ${lane.rootNamespace}`,
          );
        }
        const laneSource = await readFile(
          resolve(root, `packages/${provider.package}/src/${lane.lane}/index.ts`),
          "utf8",
        );
        for (const module of lane.modules) {
          const moduleSource = await readFile(
            resolve(root, `packages/${provider.package}/${module.implementationPath}`),
            "utf8",
          );
          expect(moduleSource, `${provider.package}/${module.implementationPath}`).toBeTypeOf("string");
          expect(
            Object.hasOwn(manifest.exports, `./${lane.lane}/${module.module}`),
            `${provider.package}/${lane.lane}/${module.module} direct package reachability`,
          ).toBe(false);
          const operationExport = `export * as ${module.module} from "./${module.module}.js";`;
          if (lane.requirement === "required" && module.requirement === "required") {
            expect(laneSource, `${provider.package}/${lane.lane}.${module.module}`).toContain(operationExport);
          } else {
            expect(laneSource, `${provider.package}/${lane.lane}.${module.module}`).not.toContain(operationExport);
          }
          for (const operation of module.operations) {
            verifiedOperationIds.push(operation.operationId);
            expect(operation.implementationExport, operation.operationId).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/u);
            expect(moduleSource, operation.operationId).toMatch(
              new RegExp(`export const ${operation.implementationExport}\\b`, "u"),
            );
            if (operation.export !== null) {
              expect(operation.implementationExport, operation.operationId).toBe(operation.export);
            }
          }
        }
      }
      for (
        const inherited of ["./Build", "./Bundle", "./CompileExecutable", "./Context", "./Profile", "./Raw", "./Watch"]
      ) {
        expect(Object.hasOwn(manifest.exports, inherited), `${provider.package}${inherited}`).toBe(false);
      }
    }
    expect(verifiedOperationIds).toHaveLength(54);
    expect(new Set(verifiedOperationIds).size).toBe(54);
    expect(
      await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/AssembleModes.ts"), "utf8"),
    ).toContain("execArgvExtension");
    expect(
      await readFile(resolve(root, "packages/effect-build-node-sea/src/Command/index.ts"), "utf8"),
    ).not.toContain("AssembleModes");
  });

  it("owns all twelve compiler-target cells and emits structural-only aggregate evidence", async () => {
    const contract = await readContract();
    const workflowSource = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const workflow = parse(workflowSource) as {
      readonly jobs: Readonly<
        Record<string, {
          readonly needs?: string;
          readonly strategy?: { readonly matrix?: { readonly include?: readonly unknown[] } };
        }>
      >;
    };
    const rule = contract.evidenceControl.coordinateRules.compilerTargets;
    expect(rule.expectedCoordinateCount).toBe(12);
    expect(workflow.jobs["target-cells"]?.strategy?.matrix?.include).toEqual(rule.coordinates);
    expect(workflow.jobs["compiler-target-aggregate"]?.needs).toBe("target-cells");
    expect(rule.targetExecutionClaim).toContain("none-structural-inspection-only");
    expect(workflowSource).toContain("EFFECT_BUILD_TARGET_RECEIPT");
    expect(workflowSource).toContain("compiler-target-evidence.json");
    expect(workflowSource.match(/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/gu))
      .toHaveLength(2);
    expect(workflowSource).toContain(
      "EFFECT_BUILD_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    );
    const aggregate = await readFile(resolve(root, "scripts/aggregate-compiler-targets.mjs"), "utf8");
    expect(aggregate).toContain("compilerTargetReceiptExpectation");
    expect(aggregate).toContain('requireEnvironment("EFFECT_BUILD_SOURCE_SHA")');
    expect(aggregate).toContain("expected 12 compiler-target receipts");
  });

  it("derives 150 applicable private finalizer cells from a contract that accounts for all 180", async () => {
    const contract = await readContract();
    const workflowSource = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const workflow = parse(workflowSource) as {
      readonly permissions: Readonly<Record<string, string>>;
      readonly jobs: Readonly<
        Record<string, {
          readonly if?: string;
          readonly needs?: string | readonly string[];
          readonly outputs?: Readonly<Record<string, string>>;
          readonly strategy?: { readonly matrix?: string };
        }>
      >;
    };
    expect(workflow.permissions.actions).toBe("read");
    const rule = contract.evidenceControl.coordinateRules.nodeMainExecutable;
    expect(rule.expectedCartesianCoordinateCount).toBe(180);
    expect(rule.expectedCoordinateCount).toBe(150);
    expect(rule.expectedUnsupportedCoordinateCount).toBe(30);
    expect(rule.explicitUnsupportedTargets).toHaveLength(1);
    expect(rule.explicitUnsupportedTargets[0]).toMatchObject({
      target: "macos-x64",
      disposition: "rejected",
      classification: "upstream-blocked",
      revisitTrigger: "assembler-cell-change",
      assemblerCell: contract.evidenceControl.nodeMainExecutable.assemblerCell,
      observation: { observedCoordinateCount: 2, inferredCoordinateCount: 28 },
    });
    expect(rule.explicitUnsupportedCoordinates).toHaveLength(30);
    expect(
      rule.explicitUnsupportedCoordinates.every(({ target, disposition }) =>
        target === "macos-x64" && disposition === "rejected"
      ),
    ).toBe(true);
    const observationCounts = new Map<string, number>();
    for (const { observation } of rule.explicitUnsupportedCoordinates) {
      observationCounts.set(observation, (observationCounts.get(observation) ?? 0) + 1);
    }
    expect([...observationCounts.entries()].sort(([left], [right]) => left.localeCompare(right))).toEqual([
      ["inferred-from-upstream-evidence-not-executed", 28],
      ["observed-sigsegv-on-exact-target-runner", 2],
    ]);
    const plan = workflow.jobs["node-main-plan"]!;
    const construct = workflow.jobs["node-main-construct"]!;
    const finalize = workflow.jobs["node-main-finalize"]!;
    expect(plan.if).toContain("workflow_dispatch");
    expect(plan.outputs).toEqual({
      construction: "${{ steps.matrix.outputs.construction }}",
      finalization: "${{ steps.matrix.outputs.finalization }}",
    });
    expect(construct.if).toContain("workflow_dispatch");
    expect(construct.needs).toBe("node-main-plan");
    expect(construct.strategy?.matrix).toBe("${{ fromJSON(needs.node-main-plan.outputs.construction) }}");
    expect(finalize.needs).toEqual(["node-main-plan", "node-main-construct"]);
    expect(finalize.strategy?.matrix).toBe("${{ fromJSON(needs.node-main-plan.outputs.finalization) }}");
    expect(workflow.jobs["node-main-aggregate"]?.needs).toBe("node-main-finalize");
    const matrixSource = await readFile(resolve(root, "scripts/node-finalizer/matrix.mjs"), "utf8");
    expect(matrixSource).toContain("nodeMainApplicableCoordinates");
    expect(matrixSource).not.toContain("macos-x64");
    expect(workflowSource).toContain("Aggregate 150 applicable Node receipts and 30 contract rejections");

    const packageManifest = await readFile(resolve(root, "packages/effect-build-node-sea/package.json"), "utf8");
    expect(packageManifest).not.toContain("node-target-finalizer");
  });

  it("uses only research-complete authority for current host, finalizer, and release controls", async () => {
    const currentControlFiles = [
      "scripts/certification-host.mjs",
      "scripts/aggregate-compatibility.mjs",
      "scripts/node-finalizer/common.mjs",
      "scripts/node-finalizer/aggregate.mjs",
      "scripts/release/build-candidate.mjs",
      "scripts/release/candidate.mjs",
    ];
    const sources = await Promise.all(
      currentControlFiles.map(async (path) => [path, await readFile(resolve(root, path), "utf8")] as const),
    );
    for (const [path, source] of sources) {
      expect(source, path).not.toContain("tooling/v05-contract.json");
      expect(source, path).not.toContain("requiredCompatibilityEvidencePoints");
    }
    expect(sources.find(([path]) => path === "scripts/certification-host.mjs")?.[1]).toContain(
      "tooling/research-complete-contract.json",
    );
    expect(sources.find(([path]) => path === "scripts/node-finalizer/common.mjs")?.[1]).toContain(
      "research-complete-contract.json",
    );
  });

  it("binds exact packed public Node 26.7 Linux SEA execution into every candidate descriptor", async () => {
    const contract = await readContract();
    const workflow = await readFile(resolve(root, ".github/workflows/candidate.yml"), "utf8");
    expect(contract.releaseControl.candidatePublicNodeSeaEvidenceFields).toHaveLength(14);
    expect(workflow).toContain("verify-node-base.mjs");
    expect(workflow).toContain("--target linux-x64-gnu");
    expect(workflow).toContain("--node-sea-descriptor .candidate-node/node.json");
    expect(workflow).toContain("--node-sea-receipt .candidate-node/public-node-sea-evidence.json");
    expect(workflow).toContain(".candidate-node/public-node-sea-evidence.json");
    const candidate = await readFile(resolve(root, "scripts/release/candidate.mjs"), "utf8");
    expect(candidate).toContain("effect-build/release-candidate-public-node-sea@1");
    expect(candidate).toContain("public Node SEA candidate package binding mismatch");
    expect(candidate).toContain("executionStdoutSha256");
    const ci = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("packed-public-node-sea:");
    expect(ci).toContain("name: packed-public-node-sea-evidence");
    expect(ci).toContain("--node-sea-receipt .packed-node-sea/public-node-sea-evidence.json");
  });

  it("materializes 146 applicable five-host coordinates and excludes unsupported cells from passes", async () => {
    const workflowSource = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const workflow = parse(workflowSource) as {
      readonly jobs: Readonly<
        Record<string, {
          readonly if?: string;
          readonly needs?: readonly string[];
          readonly "runs-on"?: string;
          readonly strategy?: { readonly matrix?: Readonly<Record<string, readonly unknown[]>> };
        }>
      >;
    };
    const matrix = (job: string) => workflow.jobs[job]?.strategy?.matrix ?? {};
    const product = (job: string, axes: readonly string[]): number =>
      axes.reduce((count, axis) => count * (matrix(job)[axis]?.length ?? 0), 1);
    expect(product("browser-compatibility", ["provider", "browser", "host"])).toBe(45);
    const native = matrix("provider-native-compatibility");
    expect(product("provider-native-compatibility", ["cell", "host"])).toBe(35);
    expect(native.exclude).toEqual([
      { cell: "node@26.7.0", host: "linux-arm64" },
      { cell: "node@26.7.0", host: "macos-arm64" },
      { cell: "node@26.7.0", host: "macos-x64" },
      { cell: "node@26.7.0", host: "windows-x64" },
    ]);
    expect(native.include).toBeUndefined();
    const researchContract = await readContract();
    const certificationHosts = researchContract.evidenceControl.certificationHosts;
    const hostIds = certificationHosts.map(({ id }) => id);
    const runnerHosts = certificationHosts.map(({ id: token, runner }) => ({ token, runner }));
    expect(matrix("browser-compatibility").host).toEqual(runnerHosts);
    expect(native.host).toEqual(hostIds);
    expect(matrix("packed-consumer-compatibility").host).toEqual(runnerHosts);
    expect(workflow.jobs["provider-native-compatibility"]?.["runs-on"]).toBe(
      "${{ matrix.host == 'linux-x64' && 'ubuntu-24.04' || matrix.host == 'linux-arm64' && 'ubuntu-24.04-arm' || matrix.host == 'macos-arm64' && 'macos-15' || matrix.host == 'macos-x64' && 'macos-15-intel' || 'windows-2025' }}",
    );
    expect(native.exclude).toEqual(
      researchContract.evidenceControl.coordinateRules.providerNativeLanes
        .explicitUnsupportedCoordinates.map(({ providerRuntimeCell: cell, certificationHost: host }) => ({
          cell,
          host,
        })),
    );
    expect(workflowSource).not.toContain("ineligible-public-target-static-contract-tested");
    expect(35 - (native.exclude?.length ?? 0)).toBe(31);
    expect(product("packed-consumer-compatibility", ["package", "effect", "host"])).toBe(70);
    const packedPackages = matrix("packed-consumer-compatibility").package as readonly {
      readonly name: string;
      readonly admission: string;
    }[];
    expect(packedPackages.filter(({ admission }) => admission === "release-train").map(({ name }) => name)).toEqual(
      researchContract.releaseControl.orderedPackages,
    );
    expect(
      packedPackages.filter(({ admission }) => admission === "conditional-provider-candidate").map(({ name }) => name),
    ).toEqual(researchContract.releaseControl.conditionalPackageCandidates);
    expect(45 + 31 + 70).toBe(146);
    for (const job of ["browser-compatibility", "provider-native-compatibility", "packed-consumer-compatibility"]) {
      expect(workflow.jobs[job]?.if).toContain("workflow_dispatch");
    }
    expect(workflow.jobs["compatibility-aggregate"]?.needs).toEqual([
      "browser-compatibility",
      "provider-native-compatibility",
      "packed-consumer-compatibility",
    ]);
    const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      readonly devDependencies: Readonly<Record<string, string>>;
    };
    expect(manifest.devDependencies["@playwright/test"]).toBe("1.62.1");
  });
});
