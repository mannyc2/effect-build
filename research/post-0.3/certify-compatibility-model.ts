import { conclusion, writeReceipt } from "./receipt.mjs";
import {
  evaluateCompatibility,
  exactVersions,
  semVerRange,
  type OperationCompatibilityPolicy,
} from "./compatibility.js";

const sourceSha = process.env.SOURCE_SHA;
conclusion(typeof sourceSha === "string" && /^[0-9a-f]{40}$/.test(sourceSha), "SOURCE_SHA is missing");

const basePolicy = (lane: "api" | "command"): OperationCompatibilityPolicy => ({
  operation: { providerPackage: "effect-build-esbuild", lane, operation: "node-main" },
  tested: exactVersions("0.28.1", "0.28.2"),
  supportedByProviderPolicy: semVerRange(">=0.28.0 <0.29.0", (version) =>
    version >= "0.28.0" && version < "0.29.0"
  ),
  knownIncompatibilities: [],
  requiredCapabilities: ["build"],
  relations: [],
});
const selected = (version: string, capabilities: readonly string[] = ["build"]) => ({
  key: "selected",
  version,
  capabilities,
});

const api = evaluateCompatibility(basePolicy("api"), {
  selected: selected("0.28.2"),
  related: {},
  allowUntestedVersion: false,
});
const command = evaluateCompatibility(basePolicy("command"), {
  selected: selected("0.28.2"),
  related: {},
  allowUntestedVersion: false,
});
const supported = evaluateCompatibility(basePolicy("api"), {
  selected: selected("0.28.9"),
  related: {},
  allowUntestedVersion: false,
});
const override = evaluateCompatibility(basePolicy("api"), {
  selected: selected("0.29.0"),
  related: {},
  allowUntestedVersion: true,
});
const known = evaluateCompatibility({
  ...basePolicy("api"),
  knownIncompatibilities: [{ matcher: exactVersions("0.28.2"), reason: "known regression" }],
}, {
  selected: selected("0.28.2"),
  related: {},
  allowUntestedVersion: true,
});
const missing = evaluateCompatibility(basePolicy("api"), {
  selected: selected("0.28.2", []),
  related: {},
  allowUntestedVersion: true,
});
const relation = evaluateCompatibility({
  operation: { providerPackage: "effect-build-node-sea", lane: "command", operation: "assemble" },
  tested: exactVersions("26.7.0"),
  supportedByProviderPolicy: semVerRange(">=25 <27", (version) => version >= "25" && version < "27"),
  knownIncompatibilities: [],
  requiredCapabilities: ["build-sea"],
  relations: [{
    _tag: "EqualVersion",
    left: "builder",
    right: "base",
    reason: "builder and base must match",
  }],
}, {
  selected: { key: "builder", version: "26.7.0", capabilities: ["build-sea"] },
  related: { base: { key: "base", version: "25.5.0", capabilities: ["node-runtime"] } },
  allowUntestedVersion: true,
});

conclusion(api._tag === "Compatible" && api.value._tag === "Tested", "host API tested admission failed");
conclusion(command._tag === "Compatible" && command.value._tag === "Tested", "command tested admission failed");
conclusion(supported._tag === "Compatible" && supported.value._tag === "ProviderPolicySupported", "provider-policy admission failed");
conclusion(override._tag === "Compatible" && override.value._tag === "UntestedOverride", "untested override admission failed");
conclusion(known._tag === "Incompatible" && known.error._tag === "KnownIncompatibility" && !("overrideAvailable" in known.error), "known incompatibility advertised an override");
conclusion(missing._tag === "Incompatible" && missing.error._tag === "MissingCapability" && !("overrideAvailable" in missing.error), "missing capability advertised an override");
conclusion(relation._tag === "Incompatible" && relation.error._tag === "RelationUnsatisfied" && !("overrideAvailable" in relation.error), "relational failure advertised an override");

await writeReceipt({
  id: "compatibility-model",
  sourceSha,
  claims: [{
    id: "operation-specific-compatibility",
    classification: "established",
    conclusion: "one-pure-evaluator-distinguishes-tested-policy-supported-override-and-non-overridable-failures",
    assertions: [
      { name: "host-and-command-share-evaluator", passed: true },
      { name: "tested-policy-and-override-distinguished", passed: true },
      { name: "known-missing-and-relational-failures-have-no-override", passed: true },
    ],
  }],
  evidence: { api, command, supported, override, known, missing, relation },
});
