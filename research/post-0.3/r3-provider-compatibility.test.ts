import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CompatibilityDecision,
  compatibilityEvaluationTiming,
  type CompatibilityInput,
  evaluateCompatibility,
  isAllowUntestedVersionEligible,
  makeProbeCacheKey,
  type OperationCompatibilityPolicy,
  type ProviderImplementationIdentity,
} from "./r3-compatibility.js";
import {
  bunInput,
  bunPolicy,
  denoInput,
  denoPolicy,
  esbuildBuildInput,
  esbuildBuildPolicy,
  esbuildInput,
  esbuildPolicy,
  nodeSeaInput,
  nodeSeaPolicy,
  providerDecisionTables,
  withReviewedAdmission,
} from "./r3-provider-policies.js";

const decisionTag = (decision: CompatibilityDecision): string =>
  decision._tag === "Compatible" ? decision.value._tag : decision.error._tag;

const expectRefusal = (decision: CompatibilityDecision, tag: string, phase?: string) => {
  expect(decision._tag).toBe("Incompatible");
  if (decision._tag !== "Incompatible") throw new Error("expected refusal");
  expect(decision.error._tag).toBe(tag);
  expect(decision.error.reason.length).toBeGreaterThan(0);
  expect(decision.error.owner).toBe(decision.error.operation.providerPackage);
  if (phase !== undefined) expect(decision.error.phase).toBe(phase);
  if (decision.error._tag !== "SupportUnknown") {
    expect("overrideAvailable" in decision.error).toBe(false);
  }
};

const input = (
  base: CompatibilityInput,
  overrides: Partial<CompatibilityInput>,
): CompatibilityInput => ({ ...base, ...overrides });

const replaceRole = (
  identity: ProviderImplementationIdentity,
  role: string,
  update: (
    participant: ProviderImplementationIdentity["participants"][number],
  ) => ProviderImplementationIdentity["participants"][number],
): ProviderImplementationIdentity => ({
  ...identity,
  participants: identity.participants.map((participant) =>
    participant.role === role ? update(participant) : participant
  ) as unknown as ProviderImplementationIdentity["participants"],
});

const observeContent = async (path: string) => {
  const bytes = await readFile(path);
  const information = await stat(path);
  return {
    algorithm: "sha256" as const,
    value: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
    bytes: String(information.size),
  };
};

describe("R3 provider-owned compatibility evaluator", () => {
  test("requires a reviewed exact admission independently of observed CI evidence", () => {
    const unreviewed = evaluateCompatibility(nodeSeaPolicy, nodeSeaInput);
    expectRefusal(unreviewed, "SupportUnknown", "operation-preflight");
    expect(nodeSeaPolicy.observedEvidenceCoordinates).toHaveLength(1);
    expect(isAllowUntestedVersionEligible(unreviewed)).toBe(true);

    const policy = withReviewedAdmission(nodeSeaPolicy, nodeSeaInput);
    const reviewed = evaluateCompatibility(policy, nodeSeaInput);
    expect(decisionTag(reviewed)).toBe("ReviewedAdmission");
    if (reviewed._tag === "Compatible" && reviewed.value._tag === "ReviewedAdmission") {
      expect(reviewed.value.observedEvidenceCoordinates).toEqual(nodeSeaPolicy.observedEvidenceCoordinates);
      expect(reviewed.value.admissionKey).toStartWith("admission:");
    }
  });

  test("never promotes observed or nearby Bun and Deno compile identities into ranges", () => {
    const cases = [
      { policy: bunPolicy, base: bunInput, role: "builder", nearbyVersion: "1.3.15", hex: "e" },
      { policy: denoPolicy, base: denoInput, role: "deno", nearbyVersion: "2.9.6", hex: "f" },
    ] as const;
    for (const { policy, base, role, nearbyVersion, hex } of cases) {
      expect(policy.reviewedAdmissions).toEqual([]);
      expect(policy.observedEvidenceCoordinates.length).toBeGreaterThan(0);
      const admittedExact = withReviewedAdmission(policy, base);
      const selected = replaceRole(base.selected, role, (participant) => ({
        ...participant,
        version: nearbyVersion,
        content: { ...participant.content, value: `sha256:${hex.repeat(64)}` },
      }));
      const selectedAtLaunch = replaceRole(base.selectedAtLaunch!, role, (participant) => ({
        ...participant,
        version: nearbyVersion,
        content: { ...participant.content, value: `sha256:${hex.repeat(64)}` },
      }));
      const decision = evaluateCompatibility(admittedExact, input(base, { selected, selectedAtLaunch }));
      expectRefusal(decision, "SupportUnknown", "operation-preflight");
    }
  });

  test("constructs complete identities for every selected operation and lane", () => {
    const lanes = new Set<string>();
    for (const { input: observed, policy: original } of Object.values(providerDecisionTables)) {
      const policy = withReviewedAdmission(original, observed);
      const decision = evaluateCompatibility(policy, observed);
      expect(decisionTag(decision)).toBe("ReviewedAdmission");
      lanes.add(observed.selected.lane);
      for (const participant of observed.selected.participants) {
        expect(participant.role).not.toBe("");
        expect(participant.revision).not.toBe("");
        expect(participant.channel).not.toBe("");
        expect(participant.content.value).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    }
    expect([...lanes].sort()).toEqual(["installed-library-api", "selected-command"]);
    expect(
      Object.values(providerDecisionTables).map(({ policy }) =>
        `${policy.operation.providerPackage}/${policy.operation.operation}/${policy.operation.lane}`
      ).sort(),
    ).toEqual([
      "effect-build-bun/compile-executable/selected-command",
      "effect-build-deno/compile-executable/selected-command",
      "effect-build-esbuild/build-memory/installed-library-api",
      "effect-build-esbuild/context-memory/installed-library-api",
      "effect-build-node-sea/assemble-direct/selected-command",
    ]);
  });

  test("fails exact operation, lane, host, and target deny holes for every selected policy", () => {
    for (const { policy, input: base } of Object.values(providerDecisionTables)) {
      const otherLane = base.request.lane === "selected-command" ? "host-api" : "selected-command";
      const cases: readonly [string, CompatibilityInput][] = [
        ["operation-hole", input(base, { request: { ...base.request, operation: "different-operation" } })],
        ["lane-hole", input(base, { request: { ...base.request, lane: otherLane } })],
        [
          "host-hole",
          input(base, {
            request: {
              ...base.request,
              host: { ...base.request.host, os: "windows", architecture: "arm64" },
            },
          }),
        ],
        ["target-hole", input(base, { request: { ...base.request, target: "known-denied-target" } })],
      ];
      for (const [holeId, observed] of cases) {
        const decision = evaluateCompatibility(policy, input(observed, { allowUntestedVersion: true }));
        expectRefusal(decision, "KnownDenyHole", "operation-preflight");
        if (decision._tag === "Incompatible" && decision.error._tag === "KnownDenyHole") {
          expect(decision.error.holeId).toBe(holeId);
        }
      }
    }
  });

  test("separates present, missing, timeout, and other indeterminate capabilities", () => {
    const missing = evaluateCompatibility(
      nodeSeaPolicy,
      input(nodeSeaInput, {
        capabilities: nodeSeaInput.capabilities.map((item) =>
          item.id === "build-sea"
            ? { id: item.id, state: { _tag: "Missing" as const, reason: "--build-sea absent" } }
            : item
        ),
        allowUntestedVersion: true,
      }),
    );
    expectRefusal(missing, "CapabilityMissing");

    for (const reason of ["timeout", "probe-failed", "ambiguous"] as const) {
      const indeterminate = evaluateCompatibility(
        nodeSeaPolicy,
        input(nodeSeaInput, {
          capabilities: nodeSeaInput.capabilities.map((item) =>
            item.id === "build-sea"
              ? {
                id: item.id,
                state: { _tag: "Indeterminate" as const, reason, detail: "bounded probe gave no positive fact" },
              }
              : item
          ),
          allowUntestedVersion: true,
        }),
      );
      expectRefusal(indeterminate, "CapabilityIndeterminate");
    }
  });

  test("blocks Node builder/base, Deno/denort, and esbuild package/API/native relations", () => {
    const cases = [
      [bunPolicy, bunInput, "bun-builder-target"],
      [nodeSeaPolicy, nodeSeaInput, "node-builder-base"],
      [denoPolicy, denoInput, "deno-denort"],
      [esbuildBuildPolicy, esbuildBuildInput, "esbuild-package-api-native"],
      [esbuildPolicy, esbuildInput, "esbuild-package-api-native"],
    ] as const;
    for (const [policy, base, relationId] of cases) {
      const observed = input(base, {
        relations: base.relations.map((relation) =>
          relation.id === relationId
            ? { ...relation, state: { _tag: "Unsatisfied" as const, reason: `${relationId} mismatch` } }
            : relation
        ),
        allowUntestedVersion: true,
      });
      const decision = evaluateCompatibility(policy, observed);
      expectRefusal(decision, "RelationUnsatisfied");
      if (decision._tag === "Incompatible" && decision.error._tag === "RelationUnsatisfied") {
        expect(decision.error.relation).toBe(relationId);
      }
    }

    const missingResult = evaluateCompatibility(
      nodeSeaPolicy,
      input(nodeSeaInput, {
        relations: [],
        allowUntestedVersion: true,
      }),
    );
    expectRefusal(missingResult, "RelationIndeterminate");
  });

  test("checks provider/core peers and only the portable profile actually composed", () => {
    const peerFailure = evaluateCompatibility(
      nodeSeaPolicy,
      input(nodeSeaInput, {
        contracts: nodeSeaInput.contracts.map((contract) =>
          contract.kind === "provider-core-peer"
            ? { ...contract, state: { _tag: "Incompatible" as const, reason: "core peer is 1.0.0" } }
            : contract
        ),
        allowUntestedVersion: true,
      }),
    );
    expectRefusal(peerFailure, "ContractIncompatible");

    const profileFailure = evaluateCompatibility(
      nodeSeaPolicy,
      input(nodeSeaInput, {
        contracts: nodeSeaInput.contracts.map((contract) =>
          contract.kind === "portable-profile"
            ? { ...contract, state: { _tag: "Incompatible" as const, reason: "profile protocol mismatch" } }
            : contract
        ),
        allowUntestedVersion: true,
      }),
    );
    expectRefusal(profileFailure, "ContractIncompatible");

    const profileOmittedWhereNotComposed = evaluateCompatibility(
      withReviewedAdmission(denoPolicy, denoInput),
      denoInput,
    );
    expect(decisionTag(profileOmittedWhereNotComposed)).toBe("ReviewedAdmission");
  });

  test("reauthenticates selected command content at launch and catches same-length replacement", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-r3-command-"));
    try {
      const selectedPath = join(root, "selected-tool");
      const replacementPath = join(root, "replacement-tool");
      await writeFile(selectedPath, "selected-command-v1\n", { mode: 0o755 });
      await writeFile(replacementPath, "selected-command-v2\n", { mode: 0o755 });
      const acquiredContent = await observeContent(selectedPath);
      const acquired = input(nodeSeaInput, {
        selected: replaceRole(nodeSeaInput.selected, "builder", (participant) => ({
          ...participant,
          content: acquiredContent,
        })),
        selectedAtLaunch: replaceRole(nodeSeaInput.selectedAtLaunch!, "builder", (participant) => ({
          ...participant,
          content: acquiredContent,
        })),
      });
      const policy = withReviewedAdmission(nodeSeaPolicy, acquired);
      await rename(replacementPath, selectedPath);
      const launchContent = await observeContent(selectedPath);
      const launch = replaceRole(acquired.selectedAtLaunch!, "builder", (participant) => ({
        ...participant,
        content: launchContent,
      }));
      const changed = evaluateCompatibility(
        policy,
        input(acquired, {
          selectedAtLaunch: launch,
          allowUntestedVersion: true,
        }),
      );
      expectRefusal(changed, "SelectedCommandChanged", "launch-reauthentication");
      if (changed._tag === "Incompatible" && changed.error._tag === "SelectedCommandChanged") {
        expect(changed.error.acquired.bytes).toBe(changed.error.launch.bytes);
        expect(changed.error.acquired.value).not.toBe(changed.error.launch.value);
        expect(changed.error.acquired.value).toBe(acquiredContent.value);
        expect(changed.error.launch.value).toBe(launchContent.value);
      }

      await rm(selectedPath);
      const absent = evaluateCompatibility(
        policy,
        input(acquired, {
          selectedAtLaunch: undefined,
          allowUntestedVersion: true,
        }),
      );
      expectRefusal(absent, "SelectedCommandIndeterminate", "launch-reauthentication");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("makes the cache key canonical and sensitive to every authority component", () => {
    const baseline = makeProbeCacheKey(nodeSeaPolicy, nodeSeaInput);
    const reordered = input(nodeSeaInput, {
      capabilities: [...nodeSeaInput.capabilities].reverse(),
      contracts: [...nodeSeaInput.contracts].reverse(),
      relations: [...nodeSeaInput.relations].reverse(),
    });
    expect(makeProbeCacheKey(nodeSeaPolicy, reordered)).toBe(baseline);

    const mutations: readonly [OperationCompatibilityPolicy, CompatibilityInput][] = [
      [
        { ...nodeSeaPolicy, operation: { ...nodeSeaPolicy.operation, providerPackage: "external-node-sea" } },
        nodeSeaInput,
      ],
      [{ ...nodeSeaPolicy, operation: { ...nodeSeaPolicy.operation, operation: "assemble-legacy" } }, nodeSeaInput],
      [{ ...nodeSeaPolicy, operation: { ...nodeSeaPolicy.operation, lane: "host-api" } }, nodeSeaInput],
      [{ ...nodeSeaPolicy, capabilitySchemaRevision: "capabilities-r3-v2" }, nodeSeaInput],
      [{ ...nodeSeaPolicy, policyRevision: "policy-r3-v2" }, nodeSeaInput],
      [
        nodeSeaPolicy,
        input(nodeSeaInput, {
          request: { ...nodeSeaInput.request, host: { ...nodeSeaInput.request.host, os: "macos" } },
        }),
      ],
      [nodeSeaPolicy, input(nodeSeaInput, { request: { ...nodeSeaInput.request, target: "macos-arm64" } })],
      [
        nodeSeaPolicy,
        input(nodeSeaInput, {
          relations: nodeSeaInput.relations.map((item) => ({ ...item, inputsKey: `${item.inputsKey}|changed` })),
        }),
      ],
      [
        nodeSeaPolicy,
        input(nodeSeaInput, {
          contracts: nodeSeaInput.contracts.map((item) => ({ ...item, inputsKey: `${item.inputsKey}|changed` })),
        }),
      ],
      [
        nodeSeaPolicy,
        input(nodeSeaInput, {
          selected: replaceRole(nodeSeaInput.selected, "builder", (item) => ({
            ...item,
            content: { ...item.content, value: `sha256:${"e".repeat(64)}` },
          })),
        }),
      ],
    ];
    for (const [policy, observed] of mutations) {
      expect(makeProbeCacheKey(policy, observed)).not.toBe(baseline);
    }
  });

  test("makes only pure policy uncertainty eligible for allowUntestedVersion", () => {
    const unknown = evaluateCompatibility(nodeSeaPolicy, nodeSeaInput);
    expect(isAllowUntestedVersionEligible(unknown)).toBe(true);
    const override = evaluateCompatibility(nodeSeaPolicy, input(nodeSeaInput, { allowUntestedVersion: true }));
    expect(decisionTag(override)).toBe("UntestedOverride");
    if (override._tag === "Compatible" && override.value._tag === "UntestedOverride") {
      expect(override.value.warning.code).toBe("EFFECT_BUILD_UNTESTED_VERSION");
    }

    const invalidInputs: readonly CompatibilityInput[] = [
      input(nodeSeaInput, {
        request: { ...nodeSeaInput.request, target: "known-denied-target" },
        allowUntestedVersion: true,
      }),
      input(nodeSeaInput, { capabilities: [], allowUntestedVersion: true }),
      input(nodeSeaInput, {
        capabilities: nodeSeaInput.capabilities.map((item) => ({
          ...item,
          state: { _tag: "Indeterminate" as const, reason: "timeout" as const, detail: "bounded timeout" },
        })),
        allowUntestedVersion: true,
      }),
      input(nodeSeaInput, { relations: [], allowUntestedVersion: true }),
      input(nodeSeaInput, {
        relations: nodeSeaInput.relations.map((item) => ({
          ...item,
          state: { _tag: "Unsatisfied" as const, reason: "mismatch" },
        })),
        allowUntestedVersion: true,
      }),
      input(nodeSeaInput, { contracts: [], allowUntestedVersion: true }),
      input(nodeSeaInput, {
        contracts: nodeSeaInput.contracts.map((item) => ({
          ...item,
          state: { _tag: "Incompatible" as const, reason: "mismatch" },
        })),
        allowUntestedVersion: true,
      }),
      input(nodeSeaInput, { selectedAtLaunch: undefined, allowUntestedVersion: true }),
      input(nodeSeaInput, {
        selectedAtLaunch: replaceRole(nodeSeaInput.selectedAtLaunch!, "builder", (item) => ({
          ...item,
          content: { ...item.content, value: `sha256:${"d".repeat(64)}` },
        })),
        allowUntestedVersion: true,
      }),
    ];
    for (const observed of invalidInputs) {
      const decision = evaluateCompatibility(nodeSeaPolicy, observed);
      expect(decision._tag).toBe("Incompatible");
      expect(isAllowUntestedVersionEligible(decision)).toBe(false);
    }
  });

  test("publishes the evaluation timing map with launch reauthentication last", () => {
    expect(compatibilityEvaluationTiming).toEqual({
      selectionAndGlobalIdentity: "layer-acquisition",
      coordinateHolesCapabilitiesRelationsPeersAndProfiles: "operation-preflight",
      reviewedAdmissionOrUntestedOverride: "operation-preflight",
      selectedCommandContentReauthentication: "launch-reauthentication",
    });
  });
});
