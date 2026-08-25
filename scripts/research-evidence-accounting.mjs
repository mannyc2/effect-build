import { readFile } from "node:fs/promises";

export const researchCompleteContract = JSON.parse(
  await readFile(new URL("../tooling/research-complete-contract.json", import.meta.url), "utf8"),
);

const liveDispositions = new Set(["mandatory", "positive-proof-gated", "conditional-gate"]);
const excludedOperationDispositions = new Set(["rejected", "superseded-direct-sea"]);
const excludedAtomDispositions = new Set(["rejected"]);
const packageProviders = Object.freeze({
  "effect-build": "effect",
  "effect-build-apple": "apple",
  "effect-build-bun": "bun",
  "effect-build-deno": "deno",
  "effect-build-esbuild": "esbuild",
  "effect-build-node-sea": "node-sea",
  "effect-build-rolldown": "rolldown",
});

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
};

const sortedUnique = (values, label) => {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate identifiers`);
  return Object.freeze([...values].sort());
};

const assertKnownDispositions = (entries, idField, excludedDispositions, label) => {
  for (const entry of entries) {
    requireText(entry[idField], `${label} identifier`);
    if (!liveDispositions.has(entry.disposition) && !excludedDispositions.has(entry.disposition)) {
      throw new Error(`${label} ${entry[idField]} has unknown disposition ${String(entry.disposition)}`);
    }
  }
};

const assertContract = (contract) => {
  if (contract?.schema !== "effect-build/research-complete-contract@1") {
    throw new Error("research-complete evidence accounting authority is unavailable");
  }
  if (!Array.isArray(contract.operationRegister?.operations) || !Array.isArray(contract.nonOperationRegister?.entries)) {
    throw new Error("research-complete operation accounting is unavailable");
  }
};

export const researchEvidenceAccountingForProvider = (provider, contract = researchCompleteContract) => {
  requireText(provider, "research provider");
  assertContract(contract);
  const providerOperations = contract.operationRegister.operations.filter((entry) => entry.provider === provider);
  const providerAtoms = contract.nonOperationRegister.entries.filter((entry) => entry.provider === provider);
  if (providerOperations.length === 0 && providerAtoms.length === 0) {
    throw new Error(`research provider has no operation or atom accounting: ${provider}`);
  }
  assertKnownDispositions(providerOperations, "operationId", excludedOperationDispositions, "operation");
  assertKnownDispositions(providerAtoms, "atomId", excludedAtomDispositions, "non-operation atom");
  return Object.freeze({
    provider,
    operationIds: sortedUnique(
      providerOperations.filter((entry) => liveDispositions.has(entry.disposition)).map((entry) => entry.operationId),
      `${provider} live operations`,
    ),
    atomIds: sortedUnique(
      providerAtoms.filter((entry) => liveDispositions.has(entry.disposition)).map((entry) => entry.atomId),
      `${provider} applicable non-operation atoms`,
    ),
  });
};

export const researchEvidenceAccountingForPackage = (packageName, contract = researchCompleteContract) => {
  requireText(packageName, "research package");
  assertContract(contract);
  const allowedPackages = [
    ...(contract.releaseControl?.orderedPackages ?? []),
    ...(contract.releaseControl?.conditionalPackageCandidates ?? []),
  ];
  if (!allowedPackages.includes(packageName)) {
    throw new Error(`package is outside research-complete release accounting: ${packageName}`);
  }
  const provider = packageProviders[packageName];
  if (provider === undefined) throw new Error(`package has no research provider accounting: ${packageName}`);
  return researchEvidenceAccountingForProvider(provider, contract);
};

export const packedProviderRuntimeEvidence = (packageName, certificationHost) => {
  requireText(packageName, "research package");
  requireText(certificationHost, "certification host");
  if (packageName === "effect-build") return "not-applicable-core-contract-fixtures";
  if (packageName === "effect-build-apple") return "noncredentialed-model-fixtures-only";
  if (packageName === "effect-build-node-sea") {
    return certificationHost === "linux-x64"
      ? "exact-node-26.7.0-linux-x64-gnu-operation-fixtures"
      : "unsupported-public-operation-host-installed-dist-fixtures-only";
  }
  if (packageName === "effect-build-bun") return "exact-bun-1.3.14-operation-fixtures";
  if (packageName === "effect-build-deno") return "exact-deno-2.9.5-operation-fixtures";
  if (packageName === "effect-build-esbuild") return "exact-esbuild-0.28.2-node-operation-fixtures";
  if (packageName === "effect-build-rolldown") return "exact-rolldown-1.2.5-node-operation-fixtures";
  throw new Error(`packed runtime evidence classification is missing for ${packageName}`);
};
