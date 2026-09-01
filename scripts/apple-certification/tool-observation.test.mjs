import assert from "node:assert/strict";
import test from "node:test";

import { canonicalBytes, sha256Digest } from "./canonical.mjs";
import {
  compactCombinedToolObservations,
  compactToolObservation,
  extractAppleOperationToolObservations,
  splitCombinedToolObservation,
  validateCompactToolObservation,
  verifyCompactToolObservation,
} from "./tool-observation.mjs";

const probeEvidence = (name) => ({
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
})[name];

const contract = JSON.parse(
  await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../../tooling/effect-build-contract.json", import.meta.url), "utf8")
  ),
);
const operationToolLineage = contract.releaseCertification.apple.operationToolLineage.byOperationId;

const nativeObservation = (name = "codesign", capabilityId = "signature-verification") => ({
  name,
  participants: [{
    role: "selected-command",
    name,
    version: "18.0",
    revision: "caller-adjudicated-system-build",
    channel: "system",
    content: {
      bytes: "41",
      digest: { algorithm: "sha256", value: "a".repeat(64) },
    },
  }],
  capabilities: [{
    _tag: "Present",
    id: capabilityId,
    evidence: probeEvidence(name),
  }],
});

const combinedObservation = (...observations) => ({
  name: observations[0].name,
  participants: observations.flatMap(({ participants }) => participants),
  capabilities: observations.flatMap(({ capabilities }) => capabilities),
});

test("derives both receipt digests from one exact selected native observation", () => {
  const native = nativeObservation();
  const compact = compactToolObservation(native, "codesign", "signature-verification");
  const identity = {
    name: "codesign",
    version: "18.0",
    executableDigest: `sha256:${"a".repeat(64)}`,
  };
  assert.deepEqual(compact, {
    ...identity,
    observationDigest: sha256Digest(canonicalBytes(native)),
  });
  assert.ok(Object.isFrozen(compact));
  assert.deepEqual(validateCompactToolObservation(compact, "codesign"), compact);
  assert.deepEqual(
    verifyCompactToolObservation(compact, native, "codesign", "signature-verification"),
    compact,
  );
  const signing = nativeObservation("codesign", "developer-id-signing");
  const signingCompact = compactToolObservation(signing, "codesign", "developer-id-signing");
  assert.equal(signingCompact.executableDigest, compact.executableDigest);
  assert.equal(signingCompact.version, compact.version);
  assert.notEqual(signingCompact.observationDigest, compact.observationDigest);
});

test("rejects combined, fabricated, or product-mismatched native observations", () => {
  const native = nativeObservation();
  assert.throws(
    () =>
      compactToolObservation(
        { ...native, participants: [...native.participants, ...native.participants] },
        "codesign",
        "signature-verification",
      ),
    /exactly one selected command/u,
  );
  assert.throws(
    () =>
      compactToolObservation(
        { ...native, participants: [{ ...native.participants[0], role: "fixture" }] },
        "codesign",
        "signature-verification",
      ),
    /selected codesign command identity/u,
  );
  assert.throws(() => compactToolObservation(native, "pkgutil", "package-signature-verification"), /must be pkgutil/u);
  assert.throws(
    () => compactToolObservation({ ...native, capabilities: [] }, "codesign", "signature-verification"),
    /exactly one native probe/u,
  );
  assert.throws(
    () => compactToolObservation(native, "codesign", "developer-id-signing"),
    /must be developer-id-signing/u,
  );
  assert.throws(
    () =>
      compactToolObservation(
        { ...native, capabilities: [{ ...native.capabilities[0], evidence: "fabricated" }] },
        "codesign",
        "signature-verification",
      ),
    /does not match the exact codesign native probe/u,
  );
});

test("rejects any compact identity or digest substitution", () => {
  const native = nativeObservation();
  const compact = compactToolObservation(native, "codesign", "signature-verification");
  assert.throws(
    () =>
      verifyCompactToolObservation(
        { ...compact, executableDigest: `sha256:${"b".repeat(64)}` },
        native,
        "codesign",
        "signature-verification",
      ),
    /does not match/u,
  );
  assert.throws(
    () =>
      verifyCompactToolObservation(
        { ...compact, observationDigest: `sha256:${"b".repeat(64)}` },
        native,
        "codesign",
        "signature-verification",
      ),
    /does not match/u,
  );
  const renamed = {
    ...compact,
    name: "pkgutil",
    observationDigest: sha256Digest(canonicalBytes({
      name: "pkgutil",
      version: compact.version,
      executableDigest: compact.executableDigest,
    })),
  };
  assert.throws(() => validateCompactToolObservation(renamed, "codesign"), /must be codesign/u);
});

test("splits one exact combined provenance without losing component identity", () => {
  const hdiutil = nativeObservation("hdiutil", "udzo-image");
  const codesign = nativeObservation("codesign", "app-signature-verification");
  const expected = [
    { name: "hdiutil", capabilityId: "udzo-image" },
    { name: "codesign", capabilityId: "app-signature-verification" },
  ];
  const combined = {
    name: "hdiutil",
    participants: [...hdiutil.participants, ...codesign.participants],
    capabilities: [...hdiutil.capabilities, ...codesign.capabilities],
  };
  const split = splitCombinedToolObservation(combined, expected);
  assert.deepEqual(split, [hdiutil, codesign]);
  assert.ok(Object.isFrozen(split));
  assert.deepEqual(
    compactCombinedToolObservations(combined, expected),
    [
      compactToolObservation(hdiutil, "hdiutil", "udzo-image"),
      compactToolObservation(codesign, "codesign", "app-signature-verification"),
    ],
  );
});

test("rejects ambiguous, reordered, or incomplete combined provenance", () => {
  const hdiutil = nativeObservation("hdiutil", "udzo-image");
  const codesign = nativeObservation("codesign", "app-signature-verification");
  const expected = [
    { name: "hdiutil", capabilityId: "udzo-image" },
    { name: "codesign", capabilityId: "app-signature-verification" },
  ];
  const combined = {
    name: "hdiutil",
    participants: [...hdiutil.participants, ...codesign.participants],
    capabilities: [...hdiutil.capabilities, ...codesign.capabilities],
  };
  assert.throws(
    () => splitCombinedToolObservation({ ...combined, participants: [...combined.participants].reverse() }, expected),
    /selected hdiutil command identity/u,
  );
  assert.throws(
    () => splitCombinedToolObservation({ ...combined, capabilities: combined.capabilities.slice(0, 1) }, expected),
    /exactly 2 native probes/u,
  );
  assert.throws(
    () =>
      splitCombinedToolObservation(combined, [
        { name: "hdiutil", capabilityId: "udzo-image" },
        { name: "hdiutil", capabilityId: "udzo-image" },
      ]),
    /names must be unique/u,
  );
  assert.throws(
    () => splitCombinedToolObservation({ ...combined, extra: true }, expected),
    /missing or additional fields/u,
  );
  assert.throws(
    () => splitCombinedToolObservation({ ...combined, capabilities: [...combined.capabilities].reverse() }, expected),
    /must be udzo-image/u,
  );
});

test("extracts policy order from exact package source-carrier order without widening public results", () => {
  const hdiutil = nativeObservation("hdiutil", "udzo-image");
  const appVerifier = nativeObservation("codesign", "app-signature-verification");
  const pkgbuild = nativeObservation("pkgbuild", "component-package");
  const productbuild = nativeObservation("productbuild", "flat-package");
  const payloadVerifier = nativeObservation("pkgutil", "payload-verification");
  const notarytool = nativeObservation("notarytool", "notarization");
  const signatureVerifier = nativeObservation("codesign", "signature-verification");
  const packageVerifier = nativeObservation("pkgutil", "package-signature-verification");
  const ditto = nativeObservation("ditto", "archive-transport");
  const stapler = nativeObservation("stapler", "ticket-stapling");
  const spctl = nativeObservation("spctl", "gatekeeper-assessment");
  const cases = [
    {
      operationId: "PROD-APPLE-005",
      product: "dmg",
      carriers: [combinedObservation(hdiutil, appVerifier)],
    },
    {
      operationId: "PROD-APPLE-006",
      product: "pkg",
      carriers: [combinedObservation(productbuild, pkgbuild, payloadVerifier, appVerifier)],
    },
    {
      operationId: "PROD-APPLE-007",
      product: "dmg",
      carriers: [combinedObservation(notarytool, signatureVerifier)],
    },
    {
      operationId: "PROD-APPLE-007",
      product: "pkg",
      carriers: [combinedObservation(notarytool, packageVerifier)],
    },
    {
      operationId: "PROD-APPLE-008",
      product: "app",
      carriers: [combinedObservation(notarytool, signatureVerifier), ditto],
    },
    {
      operationId: "PROD-APPLE-011",
      product: "app",
      carriers: [combinedObservation(stapler, signatureVerifier)],
    },
    {
      operationId: "PROD-APPLE-012",
      product: "dmg",
      carriers: [combinedObservation(stapler, signatureVerifier)],
    },
    {
      operationId: "PROD-APPLE-012",
      product: "pkg",
      carriers: [combinedObservation(stapler, packageVerifier)],
    },
    {
      operationId: "PROD-APPLE-013",
      product: "app",
      carriers: [spctl, signatureVerifier],
    },
    {
      operationId: "PROD-APPLE-013",
      product: "pkg",
      carriers: [spctl, packageVerifier],
    },
  ];
  for (const entry of cases) {
    const expectedComponents = operationToolLineage[entry.operationId][entry.product];
    const extracted = extractAppleOperationToolObservations({ ...entry, expectedComponents });
    assert.deepEqual(extracted.map(({ name }) => name), expectedComponents.map(({ name }) => name));
    assert.deepEqual(
      extracted.map(({ nativeObservation }) => nativeObservation.capabilities[0].id),
      expectedComponents.map(({ capabilityId }) => capabilityId),
    );
    assert.ok(extracted.every(Object.isFrozen));
  }
});

test("rejects source-carrier order, carrier count, and policy/source-set drift", () => {
  const hdiutil = nativeObservation("hdiutil", "udzo-image");
  const appVerifier = nativeObservation("codesign", "app-signature-verification");
  const expectedComponents = operationToolLineage["PROD-APPLE-005"].dmg;
  assert.throws(
    () =>
      extractAppleOperationToolObservations({
        operationId: "PROD-APPLE-005",
        product: "dmg",
        carriers: [combinedObservation(appVerifier, hdiutil)],
        expectedComponents,
      }),
    /primary hdiutil/u,
  );
  assert.throws(
    () =>
      extractAppleOperationToolObservations({
        operationId: "PROD-APPLE-008",
        product: "app",
        carriers: [combinedObservation(
          nativeObservation("notarytool", "notarization"),
          nativeObservation("codesign", "signature-verification"),
        )],
        expectedComponents: operationToolLineage["PROD-APPLE-008"].app,
      }),
    /exactly 2 source carriers/u,
  );
  assert.throws(
    () =>
      extractAppleOperationToolObservations({
        operationId: "PROD-APPLE-005",
        product: "dmg",
        carriers: [combinedObservation(hdiutil, appVerifier)],
        expectedComponents: expectedComponents.slice(0, 1),
      }),
    /do not cover the exact source-carrier tools/u,
  );
  assert.throws(
    () =>
      extractAppleOperationToolObservations({
        operationId: "PROD-APPLE-005",
        product: "dmg",
        carriers: [combinedObservation(hdiutil, appVerifier)],
        expectedComponents: expectedComponents.map((component, index) =>
          index === 0 ? { ...component, capabilityId: "wrong-capability" } : component
        ),
      }),
    /is not an exact source-carrier tool/u,
  );
});
