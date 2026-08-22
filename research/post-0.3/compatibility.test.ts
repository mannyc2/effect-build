import { describe, expect, test } from "bun:test";
import {
  evaluateCompatibility,
  exactVersions,
  type OperationCompatibilityPolicy,
  semVerRange,
  type ToolCompatibilityObservation,
  versionPredicate,
} from "./compatibility.js";

const observation = (
  key: string,
  version: string,
  capabilities: readonly string[] = ["build"],
): ToolCompatibilityObservation => ({ key, version, capabilities });

const between = (minimum: string, maximumExclusive: string) => (version: string): boolean =>
  version >= minimum && version < maximumExclusive;

const policy = (
  lane: "api" | "command",
  overrides: Partial<OperationCompatibilityPolicy> = {},
): OperationCompatibilityPolicy => ({
  operation: { providerPackage: "effect-build-esbuild", lane, operation: "node-main" },
  tested: exactVersions("0.28.1", "0.28.2"),
  supportedByProviderPolicy: semVerRange(">=0.28.0 <0.29.0", between("0.28.0", "0.29.0")),
  knownIncompatibilities: [],
  requiredCapabilities: ["build"],
  relations: [],
  ...overrides,
});

describe("operation-specific compatibility", () => {
  test("uses the same pure evaluator for host API and selected-command lanes", () => {
    const selected = observation("selected", "0.28.2");
    const api = evaluateCompatibility(policy("api"), {
      selected,
      related: {},
      allowUntestedVersion: false,
    });
    const command = evaluateCompatibility(policy("command"), {
      selected,
      related: {},
      allowUntestedVersion: false,
    });
    expect(api._tag).toBe("Compatible");
    expect(command._tag).toBe("Compatible");
    if (api._tag === "Compatible" && command._tag === "Compatible") {
      expect(api.value._tag).toBe("Tested");
      expect(command.value._tag).toBe("Tested");
      expect(api.value.operation.lane).toBe("api");
      expect(command.value.operation.lane).toBe("command");
    }
  });

  test("distinguishes matrix-tested, provider-policy, and override admissions", () => {
    const tested = evaluateCompatibility(policy("api"), {
      selected: observation("selected", "0.28.2"),
      related: {},
      allowUntestedVersion: false,
    });
    const providerPolicy = evaluateCompatibility(policy("api"), {
      selected: observation("selected", "0.28.9"),
      related: {},
      allowUntestedVersion: false,
    });
    const override = evaluateCompatibility(policy("api"), {
      selected: observation("selected", "0.29.0"),
      related: {},
      allowUntestedVersion: true,
    });
    expect(tested._tag === "Compatible" && tested.value._tag).toBe("Tested");
    expect(providerPolicy._tag === "Compatible" && providerPolicy.value._tag).toBe(
      "ProviderPolicySupported",
    );
    expect(override._tag === "Compatible" && override.value._tag).toBe("UntestedOverride");
    if (override._tag === "Compatible" && override.value._tag === "UntestedOverride") {
      expect(override.value.warning).toEqual({
        code: "EFFECT_BUILD_UNTESTED_VERSION",
        providerPackage: "effect-build-esbuild",
        lane: "api",
        operation: "node-main",
        observedVersion: "0.29.0",
        testedPolicy: "0.28.1,0.28.2",
        providerPolicy: ">=0.28.0 <0.29.0",
      });
    }
  });

  test("only an unknown version advertises an override", () => {
    const unknown = evaluateCompatibility(policy("api"), {
      selected: observation("selected", "0.29.0"),
      related: {},
      allowUntestedVersion: false,
    });
    expect(unknown._tag).toBe("Incompatible");
    if (unknown._tag === "Incompatible") {
      expect(unknown.error._tag).toBe("VersionUntested");
      expect("overrideAvailable" in unknown.error).toBe(true);
    }

    const known = evaluateCompatibility(
      policy("api", {
        knownIncompatibilities: [{
          matcher: exactVersions("0.28.2"),
          reason: "upstream regression",
        }],
      }),
      {
        selected: observation("selected", "0.28.2"),
        related: {},
        allowUntestedVersion: true,
      },
    );
    expect(known._tag).toBe("Incompatible");
    if (known._tag === "Incompatible") {
      expect(known.error._tag).toBe("KnownIncompatibility");
      expect("overrideAvailable" in known.error).toBe(false);
    }

    const missing = evaluateCompatibility(policy("api"), {
      selected: observation("selected", "0.28.2", []),
      related: {},
      allowUntestedVersion: true,
    });
    expect(missing._tag).toBe("Incompatible");
    if (missing._tag === "Incompatible") {
      expect(missing.error._tag).toBe("MissingCapability");
      expect("overrideAvailable" in missing.error).toBe(false);
    }
  });

  test("supports predicate policies and relational requirements", () => {
    const selected = observation("builder", "26.7.0", ["build-sea"]);
    const related = { base: observation("base", "25.5.0", ["node-runtime"]) };
    const result = evaluateCompatibility({
      operation: { providerPackage: "effect-build-node-sea", lane: "command", operation: "assemble" },
      tested: versionPredicate(
        "node-major",
        "Node 25 or Node 26",
        (value) => value.version.startsWith("25.") || value.version.startsWith("26."),
      ),
      supportedByProviderPolicy: semVerRange(">=25 <27", (value) => value >= "25" && value < "27"),
      knownIncompatibilities: [],
      requiredCapabilities: ["build-sea"],
      relations: [{
        _tag: "EqualVersion",
        left: "builder",
        right: "base",
        reason: "Node SEA builder and base must have equal versions",
      }],
    }, {
      selected,
      related,
      allowUntestedVersion: true,
    });
    expect(result._tag).toBe("Incompatible");
    if (result._tag === "Incompatible") {
      expect(result.error._tag).toBe("RelationUnsatisfied");
      expect("overrideAvailable" in result.error).toBe(false);
    }
  });
});
