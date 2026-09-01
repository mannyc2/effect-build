import {
  canonicalBytes,
  canonicalNonNegativeDecimal,
  exactKeys,
  isRecord,
  nonEmptyText,
  sha256Digest,
} from "./canonical.mjs";

const sha256Value = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 64 lowercase hexadecimal characters`);
  }
  return value;
};

const canonicalReleaseDigest = (value, label) => {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be canonical sha256:<64 lowercase hex>`);
  }
  return value;
};

const compactIdentity = ({ name, version, executableDigest }) => ({ name, version, executableDigest });

const nativeProbeEvidenceByTool = Object.freeze({
  plutil: 'native probe ["-help"] admitted exit code 0',
  codesign: 'native probe ["--version"] admitted exit code 2',
  productsign: 'native probe ["--version"] admitted exit code 1',
  hdiutil: 'native probe ["help"] admitted exit code 0',
  pkgbuild: 'native probe ["--version"] admitted exit code 1',
  productbuild: 'native probe ["--version"] admitted exit code 1',
  pkgutil: 'native probe ["--help"] admitted exit code 0',
  spctl: 'native probe ["--version"] admitted exit code 2',
  notarytool: 'native probe ["--version"] admitted exit code 0',
  ditto: 'native probe ["--help"] admitted exit code 1',
  stapler: 'native probe ["-h"] admitted exit code 64',
});

// Public Apple results intentionally keep their canonical, primary-artifact
// provenance order. Certification reorders only after validating these exact
// source-carrier layouts, so the receipt's first-executed order never requires
// widening or rewriting the package API.
const sourceCarrierLayouts = Object.freeze({
  "PROD-APPLE-001": { app: [[{ name: "plutil", capabilityId: "plist-lint" }]] },
  "PROD-APPLE-002": { app: [[{ name: "codesign", capabilityId: "developer-id-signing" }]] },
  "PROD-APPLE-003": { dmg: [[{ name: "codesign", capabilityId: "developer-id-signing" }]] },
  "PROD-APPLE-004": {
    pkg: [[
      { name: "productsign", capabilityId: "installer-signing" },
      { name: "pkgutil", capabilityId: "package-signature-verification" },
    ]],
  },
  "PROD-APPLE-005": {
    dmg: [[
      { name: "hdiutil", capabilityId: "udzo-image" },
      { name: "codesign", capabilityId: "app-signature-verification" },
    ]],
  },
  "PROD-APPLE-006": {
    pkg: [[
      { name: "productbuild", capabilityId: "flat-package" },
      { name: "pkgbuild", capabilityId: "component-package" },
      { name: "pkgutil", capabilityId: "payload-verification" },
      { name: "codesign", capabilityId: "app-signature-verification" },
    ]],
  },
  "PROD-APPLE-007": {
    dmg: [[
      { name: "notarytool", capabilityId: "notarization" },
      { name: "codesign", capabilityId: "signature-verification" },
    ]],
    pkg: [[
      { name: "notarytool", capabilityId: "notarization" },
      { name: "pkgutil", capabilityId: "package-signature-verification" },
    ]],
  },
  "PROD-APPLE-008": {
    app: [
      [
        { name: "notarytool", capabilityId: "notarization" },
        { name: "codesign", capabilityId: "signature-verification" },
      ],
      [{ name: "ditto", capabilityId: "archive-transport" }],
    ],
  },
  "PROD-APPLE-009": {
    app: [[{ name: "notarytool", capabilityId: "notarization" }]],
    dmg: [[{ name: "notarytool", capabilityId: "notarization" }]],
    pkg: [[{ name: "notarytool", capabilityId: "notarization" }]],
  },
  "PROD-APPLE-010": {
    app: [[{ name: "notarytool", capabilityId: "notarization" }]],
    dmg: [[{ name: "notarytool", capabilityId: "notarization" }]],
    pkg: [[{ name: "notarytool", capabilityId: "notarization" }]],
  },
  "PROD-APPLE-011": {
    app: [[
      { name: "stapler", capabilityId: "ticket-stapling" },
      { name: "codesign", capabilityId: "signature-verification" },
    ]],
  },
  "PROD-APPLE-012": {
    dmg: [[
      { name: "stapler", capabilityId: "ticket-stapling" },
      { name: "codesign", capabilityId: "signature-verification" },
    ]],
    pkg: [[
      { name: "stapler", capabilityId: "ticket-stapling" },
      { name: "pkgutil", capabilityId: "package-signature-verification" },
    ]],
  },
  "PROD-APPLE-013": {
    app: [
      [{ name: "spctl", capabilityId: "gatekeeper-assessment" }],
      [{ name: "codesign", capabilityId: "signature-verification" }],
    ],
    dmg: [
      [{ name: "spctl", capabilityId: "gatekeeper-assessment" }],
      [{ name: "codesign", capabilityId: "signature-verification" }],
    ],
    pkg: [
      [{ name: "spctl", capabilityId: "gatekeeper-assessment" }],
      [{ name: "pkgutil", capabilityId: "package-signature-verification" }],
    ],
  },
});

const validateExpectedComponents = (input, label) => {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const components = input.map((component, index) => {
    const expected = exactKeys(component, ["name", "capabilityId"], `${label}[${index}]`);
    nonEmptyText(expected.name, `${label}[${index}].name`);
    nonEmptyText(expected.capabilityId, `${label}[${index}].capabilityId`);
    return expected;
  });
  const names = components.map(({ name }) => name);
  if (new Set(names).size !== components.length) throw new Error(`${label} names must be unique`);
  return components;
};

export const validateCompactToolObservation = (input, expectedName, label = "tool observation") => {
  nonEmptyText(expectedName, `${label} expected name`);
  const value = exactKeys(
    input,
    ["name", "version", "executableDigest", "observationDigest"],
    label,
  );
  if (value.name !== expectedName) throw new Error(`${label}.name must be ${expectedName}`);
  nonEmptyText(value.version, `${label}.version`);
  canonicalReleaseDigest(value.executableDigest, `${label}.executableDigest`);
  canonicalReleaseDigest(value.observationDigest, `${label}.observationDigest`);
  return Object.freeze({ ...value });
};

export const compactToolObservation = (
  input,
  expectedName,
  expectedCapabilityId,
  label = "native tool observation",
) => {
  nonEmptyText(expectedName, `${label} expected name`);
  nonEmptyText(expectedCapabilityId, `${label} expected capability id`);
  const observation = exactKeys(input, ["name", "participants", "capabilities"], label);
  if (observation.name !== expectedName) throw new Error(`${label}.name must be ${expectedName}`);
  if (!Array.isArray(observation.participants) || observation.participants.length !== 1) {
    throw new Error(`${label}.participants must contain exactly one selected command`);
  }
  const participant = exactKeys(
    observation.participants[0],
    ["role", "name", "version", "revision", "channel", "content"],
    `${label}.participants[0]`,
  );
  if (
    participant.role !== "selected-command"
    || participant.name !== expectedName
    || participant.revision !== "caller-adjudicated-system-build"
    || participant.channel !== "system"
  ) {
    throw new Error(`${label}.participants[0] is not the selected ${expectedName} command identity`);
  }
  nonEmptyText(participant.version, `${label}.participants[0].version`);
  const content = exactKeys(participant.content, ["digest", "bytes"], `${label}.participants[0].content`);
  canonicalNonNegativeDecimal(content.bytes, `${label}.participants[0].content.bytes`);
  const digest = exactKeys(content.digest, ["algorithm", "value"], `${label}.participants[0].content.digest`);
  if (digest.algorithm !== "sha256") throw new Error(`${label}.participants[0].content.digest must use SHA-256`);
  const executableDigest = `sha256:${sha256Value(digest.value, `${label}.participants[0].content.digest.value`)}`;

  if (!Array.isArray(observation.capabilities) || observation.capabilities.length !== 1) {
    throw new Error(`${label}.capabilities must contain exactly one native probe observation`);
  }
  const capability = observation.capabilities[0];
  if (!isRecord(capability) || capability._tag !== "Present") {
    throw new Error(`${label}.capabilities[0] must be one present native probe`);
  }
  const present = exactKeys(capability, ["_tag", "id", "evidence"], `${label}.capabilities[0]`);
  if (present.id !== expectedCapabilityId) {
    throw new Error(`${label}.capabilities[0].id must be ${expectedCapabilityId}`);
  }
  const expectedEvidence = nativeProbeEvidenceByTool[expectedName];
  if (expectedEvidence === undefined || present.evidence !== expectedEvidence) {
    throw new Error(`${label}.capabilities[0].evidence does not match the exact ${expectedName} native probe`);
  }

  const compact = compactIdentity({
    name: expectedName,
    version: participant.version,
    executableDigest,
  });
  return validateCompactToolObservation(
    { ...compact, observationDigest: sha256Digest(canonicalBytes(observation)) },
    expectedName,
    label,
  );
};

export const verifyCompactToolObservation = (
  compact,
  nativeObservation,
  expectedName,
  expectedCapabilityId,
  label = "tool observation",
) => {
  const value = validateCompactToolObservation(compact, expectedName, label);
  const expected = compactToolObservation(
    nativeObservation,
    expectedName,
    expectedCapabilityId,
    `${label} native observation`,
  );
  const valueBytes = canonicalBytes(value);
  const expectedBytes = canonicalBytes(expected);
  if (
    valueBytes.byteLength !== expectedBytes.byteLength
    || valueBytes.some((byte, index) => byte !== expectedBytes[index])
  ) {
    throw new Error(`${label} does not match its exact native observation`);
  }
  return value;
};

export const splitCombinedToolObservation = (
  input,
  expectedComponents,
  label = "combined native tool observation",
) => {
  const expected = validateExpectedComponents(expectedComponents, `${label} expected components`);
  const expectedNames = expected.map(({ name }) => name);
  const observation = exactKeys(input, ["name", "participants", "capabilities"], label);
  if (observation.name !== expectedNames[0]) {
    throw new Error(`${label}.name must be the primary ${expectedNames[0]} tool`);
  }
  if (!Array.isArray(observation.participants) || observation.participants.length !== expectedNames.length) {
    throw new Error(`${label}.participants must contain exactly ${expectedNames.length} selected commands`);
  }
  if (!Array.isArray(observation.capabilities) || observation.capabilities.length !== expectedNames.length) {
    throw new Error(`${label}.capabilities must contain exactly ${expectedNames.length} native probes`);
  }
  const observations = expectedNames.map((name, index) => {
    const component = Object.freeze({
      name,
      participants: Object.freeze([observation.participants[index]]),
      capabilities: Object.freeze([observation.capabilities[index]]),
    });
    compactToolObservation(
      component,
      name,
      expected[index].capabilityId,
      `${label}.${name}`,
    );
    return component;
  });
  return Object.freeze(observations);
};

export const compactCombinedToolObservations = (
  input,
  expectedComponents,
  label = "combined native tool observation",
) => Object.freeze(
  splitCombinedToolObservation(input, expectedComponents, label).map((observation, index) =>
    compactToolObservation(
      observation,
      expectedComponents[index].name,
      expectedComponents[index].capabilityId,
      `${label}.${expectedComponents[index].name}`,
    )
  ),
);

export const extractAppleOperationToolObservations = (input, label = "Apple operation tool lineage") => {
  const value = exactKeys(
    input,
    ["operationId", "product", "carriers", "expectedComponents"],
    label,
  );
  nonEmptyText(value.operationId, `${label}.operationId`);
  nonEmptyText(value.product, `${label}.product`);
  const byProduct = sourceCarrierLayouts[value.operationId];
  const layout = byProduct?.[value.product];
  if (!Array.isArray(layout)) {
    throw new Error(`${label} has no exact source-carrier layout for ${value.operationId}/${value.product}`);
  }
  if (!Array.isArray(value.carriers) || value.carriers.length !== layout.length) {
    throw new Error(`${label}.carriers must contain exactly ${layout.length} source carriers`);
  }
  const expected = validateExpectedComponents(value.expectedComponents, `${label}.expectedComponents`);
  const observations = new Map();
  for (const [carrierIndex, carrierLayout] of layout.entries()) {
    const split = splitCombinedToolObservation(
      value.carriers[carrierIndex],
      carrierLayout,
      `${label}.carriers[${carrierIndex}]`,
    );
    for (const [componentIndex, observation] of split.entries()) {
      const component = carrierLayout[componentIndex];
      const key = `${component.name}\u0000${component.capabilityId}`;
      if (observations.has(key)) throw new Error(`${label} source carriers contain duplicate ${component.name}`);
      observations.set(key, observation);
    }
  }
  if (observations.size !== expected.length) {
    throw new Error(`${label}.expectedComponents do not cover the exact source-carrier tools`);
  }
  return Object.freeze(expected.map((component, index) => {
    const key = `${component.name}\u0000${component.capabilityId}`;
    const nativeObservation = observations.get(key);
    if (nativeObservation === undefined) {
      throw new Error(`${label}.expectedComponents[${index}] is not an exact source-carrier tool`);
    }
    return Object.freeze({
      ...compactToolObservation(
        nativeObservation,
        component.name,
        component.capabilityId,
        `${label}.${component.name}`,
      ),
      nativeObservation,
    });
  }));
};
