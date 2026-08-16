import { Effect, Layer } from "effect";
import assert from "node:assert/strict";
import {
  CompatibilityEvaluator,
  CompatibilityReporter,
  type CompatibilityRequest,
  evaluateCompatibility,
  evaluatorLayer,
  reporterLayer,
  requireCompatibility,
  satisfiesSemverRange,
  type ToolVersionUntestedOverride,
} from "./compatibility.js";

const base = (version: string): CompatibilityRequest => ({
  providerPackage: "effect-build-test-provider",
  lane: "selected-command",
  operation: "compile",
  selected: { name: "test-tool", version, path: "/tools/test-tool" },
  matrixTestedVersions: ["1.2.3", "1.4.0"],
  supported: { _tag: "SemverRange", expression: ">=1.2.0 <2.0.0" },
  observedCapabilities: new Set(["compile", "watch"]),
  requiredCapabilities: ["compile"],
});

assert.equal(satisfiesSemverRange("1.5.0", ">=1.2.0 <2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.0", ">=1.2.0 <2.0.0"), false);
assert.equal(evaluateCompatibility(base("1.2.3"))._tag, "Compatible");
const policy = evaluateCompatibility(base("1.8.0"));
assert.equal(policy._tag, "Compatible");
if (policy._tag === "Compatible") assert.equal(policy.observation.status, "policy-supported");

const exact = evaluateCompatibility({
  ...base("9.0.0"),
  supported: { _tag: "ExactVersions", versions: ["9.0.0"] },
});
assert.equal(exact._tag, "Compatible");

const predicate = evaluateCompatibility({
  ...base("7.1.0"),
  supported: { _tag: "Predicate", name: "major-seven", test: (version) => version.startsWith("7.") },
});
assert.equal(predicate._tag, "Compatible");

const unsupported = evaluateCompatibility(base("3.0.0"));
assert.equal(unsupported._tag, "VersionUnsupported");
if (unsupported._tag === "VersionUnsupported") assert.equal(unsupported.overrideAvailable, true);

const warnings: ToolVersionUntestedOverride[] = [];
const overridden = await Effect.runPromise(
  requireCompatibility({ ...base("3.0.0"), allowUntestedVersion: true }).pipe(
    Effect.provide(Layer.merge(evaluatorLayer, reporterLayer((warning) => warnings.push(warning)))),
  ),
);
assert.equal(overridden.status, "untested-override");
assert.equal(warnings.length, 1);
assert.equal(warnings[0]?.code, "EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE");

const incompatible = evaluateCompatibility({
  ...base("3.0.0"),
  allowUntestedVersion: true,
  knownIncompatibilities: [{ policy: { _tag: "ExactVersions", versions: ["3.0.0"] }, reason: "broken output" }],
});
assert.equal(incompatible._tag, "KnownIncompatible");
assert.equal("overrideAvailable" in incompatible, false);

const missing = evaluateCompatibility({
  ...base("1.2.3"),
  allowUntestedVersion: true,
  requiredCapabilities: ["compile", "serve"],
});
assert.equal(missing._tag, "MissingCapability");
assert.equal("overrideAvailable" in missing, false);

const relation = evaluateCompatibility({
  ...base("1.2.3"),
  allowUntestedVersion: true,
  relations: [{
    _tag: "EqualVersion",
    name: "builder-base-equality",
    left: { label: "builder", version: "26.7.0" },
    right: { label: "base", version: "25.5.0" },
  }],
});
assert.equal(relation._tag, "RelationUnsatisfied");
assert.equal("overrideAvailable" in relation, false);

void CompatibilityEvaluator;
void CompatibilityReporter;
console.log("EFFECT_BUILD_FINAL_COMPATIBILITY=ok");
