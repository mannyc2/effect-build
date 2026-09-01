import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const isRecord = (value) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const appleEvidenceFileName = (id) => {
  if (
    typeof id !== "string"
    || id.length === 0
    || id.normalize("NFC") !== id
    || !/^[\x21-\x7e]+$/u.test(id)
    || id.includes("/")
    || id.includes("\\")
  ) throw new Error("generated Apple evidence descriptor is not portable canonical text");
  const encoded = Buffer.from(id, "utf8").toString("hex");
  const name = `eb-${encoded}.evidence`;
  if (!/^eb-[a-f0-9]+\.evidence$/u.test(name) || name.length > 255) {
    throw new Error("generated Apple evidence descriptor has no bounded portable filename");
  }
  return name;
};

export const exactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (!sameJson(actual, canonical)) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const canonicalize = (value, path, ancestors) => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) throw new Error(`${path} is not NFC text`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error(`${path} is not a canonical safe integer`);
    }
    return value;
  }
  if (typeof value !== "object") throw new Error(`${path} is not canonical JSON data`);
  if (ancestors.has(value)) throw new Error(`${path} contains a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, ancestors));
    }
    if (!isRecord(value)) throw new Error(`${path} is not a plain JSON object`);
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => {
        if (key !== key.normalize("NFC")) throw new Error(`${path} has a non-NFC key`);
        return [key, canonicalize(value[key], `${path}.${key}`, ancestors)];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalJson = (value) => `${JSON.stringify(canonicalize(value, "$", new Set()))}\n`;

export const canonicalBytes = (value) => Buffer.from(canonicalJson(value), "utf8");

export const bytes = (value, label) => {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error(`${label} must be text or bytes`);
};

export const decodeCanonicalJson = (value, label) => {
  const input = bytes(value, label);
  let text;
  let decoded;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    decoded = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be canonical UTF-8 JSON`);
  }
  if (!input.equals(canonicalBytes(decoded))) throw new Error(`${label} is not canonical JSON`);
  return decoded;
};

export const sha256Digest = (value) =>
  `sha256:${createHash("sha256").update(bytes(value, "SHA-256 input")).digest("hex")}`;

export const nonEmptyText = (value, label) => {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value !== value.normalize("NFC")
  ) throw new Error(`${label} must be non-empty NFC text without NUL`);
  return value;
};

export const canonicalNonNegativeDecimal = (value, label) => {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative decimal string`);
  }
  return value;
};

export const canonicalDigest = (value, contract, label) => {
  const pattern = contract.releaseCertification?.githubArtifactDigest?.canonicalPattern;
  if (typeof pattern !== "string" || typeof value !== "string" || !new RegExp(pattern, "u").test(value)) {
    throw new Error(`${label} must be canonical sha256:<64 lowercase hex>`);
  }
  return value;
};

export const fullSourceSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be one full lowercase source SHA`);
  }
  return value;
};

export const canonicalTimestamp = (value, label) => {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) throw new Error(`${label} must be a canonical UTC timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return milliseconds;
};

const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return value;
};

const requirePolicyRecord = (value, fields, label) => exactKeys(value, fields, label);

export const appleCertificationPolicy = (contract) => {
  if (!isRecord(contract) || contract.schema !== "effect-build/combined-contract@1") {
    throw new Error("Apple certification requires the generated combined contract");
  }
  const release = contract.releaseCertification;
  const policy = release?.apple;
  if (!isRecord(release) || !isRecord(policy)) {
    throw new Error("combined contract has no generated Apple certification policy");
  }
  const { artifact, encoding, scalarFormats } = policy;
  if (
    !isRecord(artifact)
    || artifact.attempt !== 1
    || !Array.isArray(artifact.orderedFiles)
    || artifact.orderedFiles.length !== 2
    || !isRecord(encoding)
    || encoding.canonicalJson
      !== "utf8-nfc-recursive-lexicographic-keys-no-insignificant-whitespace-final-lf"
    || encoding.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || encoding.offsetAndByteEncoding !== "canonical-nonnegative-decimal-string"
    || encoding.payloadLayout !== "ordered-contiguous-zero-based-no-gaps-no-trailing-bytes"
    || !isRecord(scalarFormats)
    || scalarFormats.digest !== "releaseCertification.githubArtifactDigest"
  ) throw new Error("generated Apple encoding or artifact policy is unsupported");

  for (const [name, fields] of Object.entries(policy.receiptSchemas ?? {})) {
    requireStringArray(fields, `Apple receipt schema ${name}`);
  }
  for (const fields of [
    policy.commonReceiptFields,
    policy.coordinateRuleFields,
    encoding.bundleHeaderFields,
    encoding.evidenceEntryFields,
    encoding.indexFields,
  ]) requireStringArray(fields, "generated Apple field list");

  const coordinates = requireStringArray(policy.coordinates, "Apple coordinates");
  const coordinateRules = policy.coordinateRules;
  if (
    coordinates.length !== 28
    || !isRecord(policy.counts)
    || !sameJson(policy.counts, { total: 28, N: 2, P: 10, G: 6, A: 10 })
    || !Array.isArray(coordinateRules)
    || coordinateRules.length !== coordinates.length
  ) throw new Error("Apple policy must contain exactly N=2, P=10, G=6, A=10 coordinates");
  for (const [index, rule] of coordinateRules.entries()) {
    const value = requirePolicyRecord(rule, policy.coordinateRuleFields, `Apple coordinate rule ${index}`);
    if (value.coordinate !== coordinates[index]) throw new Error("Apple coordinate rule order changed");
    requireStringArray(value.dependencies, `${value.coordinate} dependencies`);
    requireStringArray(value.operationIds, `${value.coordinate} operation IDs`);
    if (!isRecord(value.fieldValues)) throw new Error(`${value.coordinate} field values must be closed data`);
  }

  const a7 = coordinateRules.find(({ coordinate }) => coordinate === "A7");
  const subordinateEvidence = a7?.fieldValues?.subordinateEvidence;
  const evidenceOrder = requireStringArray(policy.evidenceDescriptorOrder, "Apple evidence descriptor order");
  const evidenceFileOrder = policy.evidenceFileOrder;
  if (
    !Array.isArray(subordinateEvidence)
    || !sameJson(evidenceOrder, [...coordinates, ...subordinateEvidence])
    || !Array.isArray(evidenceFileOrder)
    || evidenceFileOrder.length !== evidenceOrder.length
    || !evidenceFileOrder.every((entry, index) => {
      if (!isRecord(entry) || !sameJson(Object.keys(entry).sort(), ["file", "id"])) return false;
      const id = evidenceOrder[index];
      return entry.id === id && entry.file === appleEvidenceFileName(id);
    })
    || new Set(evidenceFileOrder.map(({ file }) => file.toLowerCase())).size !== evidenceFileOrder.length
  ) throw new Error("Apple evidence descriptor order is not the exact receipts plus A7 evidence");

  const appleCapabilities = contract.producerCapabilityRegister?.capabilities?.filter(
    (entry) => entry.family === "apple" && entry.visibility === "public",
  );
  const toolLineage = requirePolicyRecord(
    policy.operationToolLineage,
    ["order", "componentFields", "byOperationId"],
    "Apple operation tool lineage",
  );
  const componentFields = requireStringArray(toolLineage.componentFields, "Apple tool-lineage component fields");
  if (
    toolLineage.order !== "first-executed-distinct-tool"
    || !sameJson(componentFields, ["name", "capabilityId"])
    || !isRecord(toolLineage.byOperationId)
    || !sameJson(Object.keys(toolLineage.byOperationId), appleCapabilities?.map(({ id }) => id))
  ) throw new Error("Apple operation tool lineage does not cover the exact public operation order");
  for (const [operationId, products] of Object.entries(toolLineage.byOperationId)) {
    if (!isRecord(products) || Object.keys(products).length === 0) {
      throw new Error(`${operationId} has no Apple product tool lineage`);
    }
    for (const [product, components] of Object.entries(products)) {
      if (!["app", "dmg", "pkg"].includes(product) || !Array.isArray(components) || components.length === 0) {
        throw new Error(`${operationId}/${product} has no exact Apple tool lineage`);
      }
      const names = [];
      for (const [index, input] of components.entries()) {
        const component = requirePolicyRecord(
          input,
          componentFields,
          `${operationId}/${product} tool ${index}`,
        );
        names.push(nonEmptyText(component.name, `${operationId}/${product} tool ${index} name`));
        nonEmptyText(component.capabilityId, `${operationId}/${product} tool ${index} capability`);
      }
      if (new Set(names).size !== names.length) throw new Error(`${operationId}/${product} repeats a tool`);
    }
  }
  const covered = new Set(coordinateRules.flatMap(({ operationIds }) => operationIds));
  if (
    !Array.isArray(appleCapabilities)
    || appleCapabilities.length !== 13
    || appleCapabilities.some(({ id }) => !covered.has(id))
  ) throw new Error("Apple policy does not account for all thirteen public producer operations");

  if (
    !sameJson(policy.nativeOperationIds, ["CAN-BUN-012", "CAN-DENO-010"])
    || !sameJson(policy.pairArchitectureOrder, ["macos-aarch64", "macos-x64"])
    || policy.workflowPath !== ".github/workflows/apple-certification.yml"
    || policy.workflow !== "mannyc2/effect-build/.github/workflows/apple-certification.yml@refs/heads/main"
    || !isRecord(policy.providerVersions)
    || !isRecord(policy.notaryJournal)
    || !sameJson(policy.receiptSchemas.appleToolObservation, [
      "name",
      "version",
      "executableDigest",
      "observationDigest",
      "nativeObservation",
    ])
    || !sameJson(policy.receiptSchemas.assessment, [
      "product",
      "architecture",
      "accepted",
      "evidenceDigest",
      "toolObservations",
    ])
  ) throw new Error("Apple native, pair, provider, or journal canon changed");
  return { policy, release };
};

export const artifactCoordinate = (contract, input, label) => {
  const { release } = appleCertificationPolicy(contract);
  const coordinatePolicy = release.githubArtifactCoordinate;
  const coordinate = exactKeys(input, coordinatePolicy?.orderedFields ?? [], label);
  if (
    typeof coordinate.workflow !== "string"
    || !/^[^/\s]+\/[^/\s]+\/\.github\/workflows\/[^@\s]+@refs\/heads\/[^\s]+$/u.test(
      coordinate.workflow,
    )
  ) throw new Error(`${label}.workflow is not an exact repository workflow identity`);
  fullSourceSha(coordinate.sourceSha, `${label}.sourceSha`);
  for (const field of ["runId", "runAttempt", "artifactId"]) {
    if (typeof coordinate[field] !== "string" || !/^[1-9][0-9]*$/u.test(coordinate[field])) {
      throw new Error(`${label}.${field} must be a canonical positive decimal string`);
    }
  }
  canonicalDigest(coordinate.artifactDigest, contract, `${label}.artifactDigest`);
  return Object.fromEntries(coordinatePolicy.orderedFields.map((field) => [field, coordinate[field]]));
};

export const sameCanonical = (left, right) => canonicalJson(left) === canonicalJson(right);
