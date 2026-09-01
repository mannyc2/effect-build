import { Buffer } from "node:buffer";
import { link, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error Apple certification protocols are intentionally unprotected Node script modules.
import * as aggregateProtocol from "../../scripts/apple-certification/aggregate.mjs";
// @ts-expect-error Apple certification protocols are intentionally unprotected Node script modules.
import * as canonicalProtocol from "../../scripts/apple-certification/canonical.mjs";
// @ts-expect-error Apple certification protocols are intentionally unprotected Node script modules.
import * as cliProtocol from "../../scripts/apple-certification/cli.mjs";
// @ts-expect-error Apple tool-observation helpers are intentionally private Node script modules.
import * as toolObservationProtocol from "../../scripts/apple-certification/tool-observation.mjs";

const { buildAppleAggregate, validateAppleAggregate } = aggregateProtocol;
const { artifactCoordinate: validateArtifactCoordinate, canonicalBytes, canonicalJson, sha256Digest } =
  canonicalProtocol;
const { authenticateGeneratedAppleContract, parseAppleAggregateArguments, runAppleAggregateCli } = cliProtocol;
const { compactToolObservation } = toolObservationProtocol;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const release = contract.releaseCertification;
const policy = release.apple;
const sourceSha = "a".repeat(40);
const observedAt = "2026-08-30T14:00:00.000Z";
const workflow = (name: string) => `mannyc2/effect-build/.github/workflows/${name}@refs/heads/main`;

const coordinate = (name: string, index: number) => ({
  workflow: workflow(name),
  sourceSha,
  runId: `${1000 + index}`,
  runAttempt: "1",
  artifactId: `${2000 + index}`,
  artifactDigest: sha256Digest(`synthetic artifact ${name} ${index}`),
});

const candidateCoordinate = coordinate("release.yml", 1);
const workflowCoordinate = {
  ...coordinate("apple-certification.yml", 2),
  workflow: policy.workflow,
};
const digest = (label: string) => sha256Digest(`synthetic ${label}`);

const operationNames = new Map<string, string>([
  ...contract.providerOperationRegister.operations.flatMap((entry: any) =>
    entry.implementation === null ? [] : [[entry.operationId, entry.implementation.export] as const]
  ),
  ...contract.producerCapabilityRegister.capabilities.flatMap((entry: any) =>
    entry.exports.length === 1 ? [[entry.id, entry.exports[0]] as const] : []
  ),
]);

const toolObservation = (name: string, version = "synthetic-1") => ({
  name,
  version,
  executableDigest: digest(`${name} executable`),
  observationDigest: digest(`${name} observation`),
});

const appleProbeEvidence: Readonly<Record<string, string>> = {
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
};

const nativeAppleToolObservation = (name: string, capabilityId: string) => ({
  name,
  participants: [{
    role: "selected-command",
    name,
    version: "synthetic-1",
    revision: "caller-adjudicated-system-build",
    channel: "system",
    content: {
      bytes: "123",
      digest: { algorithm: "sha256", value: digest(`${name} executable`).slice("sha256:".length) },
    },
  }],
  capabilities: [{
    _tag: "Present",
    id: capabilityId,
    evidence: appleProbeEvidence[name],
  }],
});

const appleToolObservation = (name: string, capabilityId: string) => {
  const nativeObservation = nativeAppleToolObservation(name, capabilityId);
  return {
    ...compactToolObservation(nativeObservation, name, capabilityId),
    nativeObservation,
  };
};

const appleOperationToolObservations = (operationId: string, product: string) => {
  const expected = policy.operationToolLineage.byOperationId[operationId]?.[product];
  if (!Array.isArray(expected)) throw new Error(`${operationId}/${product} has no synthetic Apple tool lineage`);
  return expected.map(({ name, capabilityId }: { readonly name: string; readonly capabilityId: string }) =>
    appleToolObservation(name, capabilityId)
  );
};

const operationFact = (
  operationId: string,
  label: string,
  outputDigests = [digest(`${label} output`)],
  product?: "app" | "dmg" | "pkg",
) => ({
  operationId,
  operation: operationNames.get(operationId),
  inputDigests: [digest(`${label} input`)],
  outputDigests,
  toolObservations: product === undefined
    ? [toolObservation(`tool-${operationId}`)]
    : appleOperationToolObservations(operationId, product),
});

const artifactIdentity = (product: "app" | "dmg" | "pkg", architecture: string, label: string) =>
  product === "app"
    ? { product, architecture, totalBytes: "123", manifestDigest: digest(`${label} manifest`) }
    : { product, architecture, bytes: "123", digest: digest(`${label} bytes`) };

const artifactDigest = (identity: any) => identity.digest ?? identity.manifestDigest;

const nativeExecutableDigest = (provider: "bun" | "deno", architecture: string) =>
  digest(`N-native-mechanics|${architecture} ${provider === "bun" ? "Bun" : "Deno"} executable`);

const pair = (product: "app" | "dmg" | "pkg", provider: string, label: string) => {
  const members = policy.pairArchitectureOrder.map((architecture: string) => ({
    architecture,
    artifactIdentity: artifactIdentity(product, architecture, `${label} ${architecture}`),
  }));
  return { product, provider, pairDigest: sha256Digest(canonicalBytes(members)), members };
};

const pairedAppManifests = Object.fromEntries(
  ["bun", "deno"].map((provider) => {
    const identity = pair("app", provider, `unsigned ${provider} App pair`);
    return [provider, {
      provider,
      version: policy.providerVersions[provider],
      pairDigest: identity.pairDigest,
      members: identity.members,
      operationFacts: [{
        ...operationFact(
          "PROD-APPLE-001",
          `${provider} buildAppBundles`,
          [
            identity.pairDigest,
            ...identity.members.map(({ artifactIdentity }: any) => artifactDigest(artifactIdentity)),
          ],
          "app",
        ),
        inputDigests: policy.pairArchitectureOrder.map((architecture: string) =>
          nativeExecutableDigest(provider as "bun" | "deno", architecture)
        ),
      }],
    }];
  }),
);
const notarizedPairs = Object.fromEntries(
  (["app", "dmg", "pkg"] as const).map((product) => [product, pair(product, "bun", `stapled ${product} pair`)]),
);

const certificateFacts = (product: "app" | "dmg" | "pkg") => ({
  class: policy.certificatePolicy.classByProduct[product],
  teamId: "ABCDE12345",
  sha1: (product === "pkg" ? "b" : "a").repeat(40),
  notBefore: "2026-01-01T00:00:00.000Z",
  notAfter: "2027-01-01T00:00:00.000Z",
});

const evidenceBytes = new Map<string, Uint8Array>(
  policy.evidenceDescriptorOrder.map((id: string) => [id, Buffer.from(`synthetic-only evidence for ${id}`)]),
);

const common = (rule: any) => ({
  protocol: policy.protocols.receipt,
  coordinate: rule.coordinate,
  sourceSha,
  candidateCoordinate,
  workflowCoordinate,
  producerDigest: digest("one synthetic producer"),
  verifierDigest: digest("one synthetic verifier"),
  observedAt,
  runnerIdentity: {
    platform: rule.architecture === null ? "linux" : "macos",
    architecture: rule.architecture ?? "linux-x64",
    image: rule.architecture === null ? "synthetic-ubuntu" : "synthetic-macos",
    imageVersion: "synthetic-1",
    runnerEnvironment: rule.fieldValues.runnerEnvironment ?? "synthetic-ephemeral",
  },
  evidenceDigest: sha256Digest(evidenceBytes.get(rule.coordinate)!),
  dependencies: rule.dependencies,
  verdict: policy.encoding.terminalVerdict,
});

const nativeReceipt = (rule: any) => {
  const bunExecutableIdentity = {
    provider: "bun",
    version: policy.providerVersions.bun,
    architecture: rule.architecture,
    target: rule.architecture,
    nativeFormat: "mach-o",
    bytes: "123",
    digest: nativeExecutableDigest("bun", rule.architecture),
  };
  const denoExecutableIdentity = {
    provider: "deno",
    version: policy.providerVersions.deno,
    architecture: rule.architecture,
    target: rule.architecture,
    nativeFormat: "mach-o",
    bytes: "123",
    digest: nativeExecutableDigest("deno", rule.architecture),
  };
  const nativeToolObservations = [
    toolObservation("bun", policy.providerVersions.bun),
    toolObservation("deno", policy.providerVersions.deno),
  ];
  return {
    ...common(rule),
    architecture: rule.architecture,
    nativeToolObservations,
    operationFacts: [
      {
        ...operationFact(rule.operationIds[0], `${rule.coordinate} Bun compile`, [bunExecutableIdentity.digest]),
        toolObservations: [nativeToolObservations[0]],
      },
      {
        ...operationFact(rule.operationIds[1], `${rule.coordinate} Deno compile`, [denoExecutableIdentity.digest]),
        toolObservations: [nativeToolObservations[1]],
      },
    ],
    bunExecutableIdentity,
    denoExecutableIdentity,
  };
};

const signedAppReceipt = (rule: any) => {
  const artifact = artifactIdentity("app", rule.architecture, `signed ${rule.provider} App ${rule.architecture}`);
  const certificate = certificateFacts("app");
  const source = pairedAppManifests[rule.provider]!.members.find(
    ({ architecture }: any) => architecture === rule.architecture,
  )!.artifactIdentity;
  const verifierTools = appleOperationToolObservations("PROD-APPLE-002", "app");
  return {
    ...common(rule),
    architecture: rule.architecture,
    pairedAppManifest: pairedAppManifests[rule.provider],
    artifactIdentity: artifact,
    certificateFacts: certificate,
    hardenedRuntime: true,
    secureTimestamp: true,
    verifierFacts: {
      artifactDigest: artifactDigest(artifact),
      certificateSha1: certificate.sha1,
      operationFacts: [{
        ...operationFact(rule.operationIds[1], `${rule.coordinate} signApp`, [artifactDigest(artifact)], "app"),
        inputDigests: [artifactDigest(source)],
        toolObservations: verifierTools,
      }],
      toolObservations: verifierTools,
    },
  };
};

const notarizedReceipt = (rule: any, receiptsByCoordinate: Map<string, any>) => {
  const product = rule.product as "app" | "dmg" | "pkg";
  const pairMember = notarizedPairs[product]!.members.find(
    ({ architecture }: any) => architecture === rule.architecture,
  )!.artifactIdentity;
  const artifact = structuredClone(pairMember);
  const signedAppReceipt = receiptsByCoordinate.get(rule.fieldValues.signedAppDependency);
  const signedApp = signedAppReceipt.artifactIdentity;
  const stapleTarget = product === "app"
    ? signedApp
    : artifactIdentity(product, rule.architecture, `pre-staple ${product} ${rule.architecture}`);
  const pairBuilderOutputs = policy.pairArchitectureOrder.map((architecture: string) =>
    digest(`one unsigned ${product} pair ${architecture}`)
  );
  const architectureIndex = policy.pairArchitectureOrder.indexOf(rule.architecture);
  const id = `${rule.architecture === "macos-aarch64" ? "1" : "2"}2345678-1234-1234-1234-123456789abc`;
  const notary = appleOperationToolObservations("PROD-APPLE-009", product)[0];
  const assessmentTools = appleOperationToolObservations("PROD-APPLE-013", product);
  const acceptedInfoDigest = digest(`${rule.coordinate} accepted info`);
  const acceptedLogDigest = digest(`${rule.coordinate} accepted private log`);
  const assessmentDigest = digest(`${rule.coordinate} assessment`);
  const journalReference = {
    protocol: policy.notaryJournal.protocol,
    journalId: `synthetic-${rule.coordinate}`,
    submissionId: id,
    intentRecordDigest: digest(`${rule.coordinate} intent record`),
    intentSequence: "1",
    intentTransaction: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    intentRereadRecordDigest: digest(`${rule.coordinate} intent record`),
    submissionRecordDigest: digest(`${rule.coordinate} submission record`),
    submissionSequence: "2",
    submissionTransaction: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    submissionRereadRecordDigest: digest(`${rule.coordinate} submission record`),
    submissionCodec: policy.notaryJournal.submissionCodec,
    submissionBytesDigest: digest(`${rule.coordinate} native submission bytes`),
  };
  const stapleTicket = {
    submissionId: id,
    submittedKind: product === "app" ? "zip" : product,
    submittedBytes: "123",
    submittedDigest: digest(`${rule.coordinate} submission transport`),
    targetKind: product,
    targetIdentityKind: product === "app" ? "tree-manifest" : "file-bytes",
    targetBytes: stapleTarget.totalBytes ?? stapleTarget.bytes,
    targetDigest: artifactDigest(stapleTarget),
    targetArchitecture: rule.architecture,
    ticketDigest: digest(`${rule.coordinate} staple ticket`),
  };
  if (product !== "app") stapleTicket.submittedDigest = stapleTicket.targetDigest;
  return {
    ...common(rule),
    signedAppDependency: rule.fieldValues.signedAppDependency,
    artifactIdentity: artifact,
    pairIdentity: notarizedPairs[product],
    certificateFacts: certificateFacts(product),
    journalReference,
    acceptedInfo: {
      submissionId: id,
      providerStatus: policy.receiptSchemaRules.providerStatus,
      observationDigest: acceptedInfoDigest,
      toolObservation: notary,
    },
    acceptedLog: {
      submissionId: id,
      providerStatus: policy.receiptSchemaRules.providerStatus,
      logDigest: acceptedLogDigest,
      issueCount: "0",
      toolObservation: notary,
    },
    stapleTicket,
    assessment: {
      product,
      architecture: rule.architecture,
      accepted: true,
      evidenceDigest: assessmentDigest,
      toolObservations: assessmentTools,
    },
    toolObservations: rule.operationIds.map((operationId: string) => {
      const name = operationNames.get(operationId);
      if (name === "signApp") return structuredClone(signedAppReceipt.verifierFacts.operationFacts[0]);
      if (name === "createDiskImages" || name === "buildInstallerPackages") {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, pairBuilderOutputs, product),
          inputDigests: rule.dependencies.map((coordinate: string) =>
            artifactDigest(receiptsByCoordinate.get(coordinate).artifactIdentity)
          ),
        };
      }
      if (name === "signDiskImage" || name === "signInstallerPackage") {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, [artifactDigest(stapleTarget)], product),
          inputDigests: [pairBuilderOutputs[architectureIndex]],
        };
      }
      if (name === (product === "app" ? "submitApp" : "submit")) {
        return {
          ...operationFact(
            operationId,
            `${rule.coordinate} ${name}`,
            [journalReference.submissionBytesDigest],
            product,
          ),
          inputDigests: [stapleTicket.submittedDigest],
        };
      }
      if (name === "info") {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, [acceptedInfoDigest], product),
          inputDigests: [journalReference.submissionBytesDigest],
        };
      }
      if (name === "log") {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, [acceptedLogDigest], product),
          inputDigests: [journalReference.submissionBytesDigest],
        };
      }
      if (name === (product === "app" ? "stapleApp" : "stapleFile")) {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, [artifactDigest(artifact)], product),
          inputDigests: [stapleTicket.targetDigest],
        };
      }
      if (name === "assess") {
        return {
          ...operationFact(operationId, `${rule.coordinate} ${name}`, [assessmentDigest], product),
          inputDigests: [artifactDigest(artifact)],
        };
      }
      return operationFact(operationId, `${rule.coordinate} ${name}`, [artifactDigest(artifact)], product);
    }),
  };
};

const cleanHostReceipt = (rule: any, receiptsByCoordinate: Map<string, any>) => {
  const producer = receiptsByCoordinate.get(rule.fieldValues.producerDependency);
  const extracted = structuredClone(producer.artifactIdentity);
  return {
    ...common(rule),
    producerDependency: rule.fieldValues.producerDependency,
    acquisitionTransportIdentity: {
      kind: rule.fieldValues.acquisitionTransportKind,
      bytes: "123",
      digest: digest(`${rule.coordinate} acquisition envelope`),
      extractedProductDigest: artifactDigest(extracted),
    },
    extractedProductIdentity: extracted,
    quarantineEvidence: { applied: true, propagated: true, attributeDigest: digest(`${rule.coordinate} quarantine`) },
    hostIdentity: {
      image: "synthetic-macos",
      imageVersion: "synthetic-1",
      architecture: rule.architecture,
      uid: "501",
      fresh: true,
      forbiddenStateAbsent: policy.cleanHostForbiddenStateIds,
    },
    userFlowEvidence: {
      flow: rule.fieldValues.userFlow,
      orderedSteps: rule.fieldValues.userFlowSteps,
      evidenceDigest: digest(`${rule.coordinate} user flow`),
    },
    sentinelOrInstallEvidence: {
      kind: rule.fieldValues.sentinelOrInstallKind,
      evidenceDigest: digest(`${rule.coordinate} sentinel or install`),
    },
    cleanupEvidence: {
      orderedSteps: rule.fieldValues.cleanupSteps,
      complete: rule.fieldValues.cleanupComplete,
      evidenceDigest: digest(`${rule.coordinate} cleanup`),
    },
  };
};

const makeSyntheticReceipts = () => {
  const receipts: any[] = [];
  const byCoordinate = new Map<string, any>();
  for (const rule of policy.coordinateRules) {
    let receipt;
    if (rule.category === "N-native") receipt = nativeReceipt(rule);
    else if (rule.category === "P-signed-app") receipt = signedAppReceipt(rule);
    else if (rule.category === "P-notarized-product") receipt = notarizedReceipt(rule, byCoordinate);
    else if (rule.category === "G-clean-host") receipt = cleanHostReceipt(rule, byCoordinate);
    else {
      receipt = {
        ...common(rule),
        namedClaims: rule.fieldValues.namedClaims,
        orderedDependencies: rule.fieldValues.orderedDependencies,
        subordinateEvidence: rule.fieldValues.subordinateEvidence,
      };
    }
    receipts.push(receipt);
    byCoordinate.set(rule.coordinate, receipt);
  }
  return receipts;
};

const receipts = makeSyntheticReceipts();
const build = (overrides: Record<string, unknown> = {}) =>
  buildAppleAggregate({
    contract,
    sourceSha,
    candidateCoordinate,
    workflowCoordinate,
    receipts: structuredClone(receipts),
    evidenceBytes: new Map(evidenceBytes),
    ...overrides,
  });
const aggregate = build();
const validate = (
  indexBytes: Uint8Array = aggregate.indexBytes,
  bundleBytes: Uint8Array = aggregate.bundleBytes,
  files: ReadonlyArray<string> = policy.artifact.orderedFiles,
) =>
  validateAppleAggregate({
    contract,
    expectedSourceSha: sourceSha,
    expectedCandidateCoordinate: candidateCoordinate,
    expectedWorkflowCoordinate: workflowCoordinate,
    files,
    indexBytes,
    bundleBytes,
  });

describe("Apple v0.6 local protocol with synthetic-only vectors", () => {
  it("requires the generated 28-coordinate, 36-evidence, 13-operation hard cut", () => {
    expect(policy.counts).toEqual({ total: 28, N: 2, P: 10, G: 6, A: 10 });
    expect(policy.coordinates).toHaveLength(28);
    expect(new Set(policy.coordinates)).toHaveLength(28);
    expect(policy.evidenceDescriptorOrder).toHaveLength(36);
    const producerIds = contract.producerCapabilityRegister.capabilities
      .filter(({ family, visibility }: any) => family === "apple" && visibility === "public")
      .map(({ id }: any) => id);
    expect(producerIds).toHaveLength(13);
    expect(new Set(policy.coordinateRules.flatMap(({ operationIds }: any) => operationIds))).toEqual(
      new Set([...producerIds, ...policy.nativeOperationIds]),
    );
    expect(policy.coordinates.some((value: string) => /(?:public-zip|clean-host-zip|node-sea)/u.test(value))).toBe(
      false,
    );
    expect(
      policy.coordinateRules.filter(({ provider }: any) => provider === "deno").every(
        ({ category, product }: any) => category === "P-signed-app" && product === "app",
      ),
    ).toBe(true);
  });

  it("builds and revalidates one deterministic two-file byte lineage", () => {
    const again = build();
    expect(again.index).toEqual(aggregate.index);
    expect(again.indexBytes).toEqual(aggregate.indexBytes);
    expect(again.bundleBytes).toEqual(aggregate.bundleBytes);
    expect(validate()).toEqual(aggregate.index);
    expect(aggregate.index.protocol).toBe(policy.protocols.index);
    expect(aggregate.index.bundleFile).toBe(policy.artifact.orderedFiles[1]);
    expect(aggregate.index.orderedCoordinates).toEqual(policy.coordinates);
  });

  it("rejects missing, additional, duplicate, and reordered receipts or opaque evidence", () => {
    const receiptMutations: ReadonlyArray<(value: any[]) => void> = [
      (value) => value.pop(),
      (value) => value.push(structuredClone(value[0])),
      (value) => value[1] = structuredClone(value[0]),
      (value) => value.reverse(),
    ];
    for (const mutate of receiptMutations) {
      const changed = structuredClone(receipts);
      mutate(changed);
      expect(() => build({ receipts: changed })).toThrow();
    }
    const missing = new Map(evidenceBytes);
    missing.delete(policy.evidenceDescriptorOrder[0]);
    expect(() => build({ evidenceBytes: missing })).toThrow();
    const additional = new Map(evidenceBytes);
    additional.set("synthetic-extra", Buffer.from("synthetic extra"));
    expect(() => build({ evidenceBytes: additional })).toThrow();
    expect(() => build({ evidenceBytes: new Map([...evidenceBytes].reverse()) })).toThrow();
  });

  it("rejects wrong source, workflow, attempt, coordinate, digest, and evidence bytes", () => {
    expect(() =>
      validateArtifactCoordinate(
        contract,
        { ...candidateCoordinate, runAttempt: "2" },
        "synthetic adopted candidate",
      )
    ).not.toThrow();
    const mutations: ReadonlyArray<(value: any[]) => void> = [
      (value) => value[0].sourceSha = "b".repeat(40),
      (value) => value[0].workflowCoordinate.workflow = workflow("peer.yml"),
      (value) => value[0].workflowCoordinate.runAttempt = "2",
      (value) => value[0].candidateCoordinate.artifactId = "0",
      (value) => value[0].producerDigest = `sha256:${"A".repeat(64)}`,
      (value) => value[0].evidenceDigest = digest("wrong evidence"),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipts);
      mutate(changed);
      expect(() => build({ receipts: changed })).toThrow();
    }
    const changedEvidence = new Map(evidenceBytes);
    changedEvidence.set(policy.coordinates[0], Buffer.from("synthetic changed bytes"));
    expect(() => build({ evidenceBytes: changedEvidence })).toThrow(/evidence digest/u);
  });

  it("rejects wrong category, architecture, pair, provider, operation, dependency, claim, and lineage", () => {
    const mutations: ReadonlyArray<(value: any[]) => void> = [
      (value) => value[0].architecture = "macos-x64",
      (value) => value[0].operationFacts[0].toolObservations = [toolObservation("peer-bun")],
      (value) => value[1].producerDigest = digest("different synthetic producer"),
      (value) => value[2].pairedAppManifest.provider = "deno",
      (value) => value[2].pairedAppManifest.operationFacts[0].inputDigests[0] = digest("wrong native input"),
      (value) => value[2].pairedAppManifest.operationFacts[0].outputDigests = [digest("wrong build output")],
      (value) => value[3].pairedAppManifest.members[0].artifactIdentity.manifestDigest = digest("wrong pair"),
      (value) => value[4].verifierFacts.toolObservations = [toolObservation("peer-codesign")],
      (value) => value[6].artifactIdentity.manifestDigest = digest("wrong final pair member"),
      (value) => value[6].journalReference.submissionId = "32345678-1234-1234-1234-123456789abc",
      (value) => value[6].journalReference.intentRereadRecordDigest = digest("wrong intent reread"),
      (value) => value[6].journalReference.submissionRereadRecordDigest = digest("wrong submission reread"),
      (value) => value[6].journalReference.intentSequence = "0",
      (value) => value[6].journalReference.submissionSequence = "1",
      (value) => value[6].stapleTicket.targetDigest = digest("wrong signed App target"),
      (value) => value[6].toolObservations[0].outputDigests = [digest("wrong inherited sign output")],
      (value) => value[6].toolObservations[2].outputDigests = [digest("wrong info output")],
      (value) => value[6].toolObservations[0].operationId = "PROD-APPLE-013",
      (value) => value[8].toolObservations[1].outputDigests[0] = digest("wrong pair-builder output"),
      (value) => value[9].toolObservations[1].toolObservations = [toolObservation("peer-pair-builder")],
      (value) => value[8].dependencies.reverse(),
      (value) => {
        value[10].certificateFacts.teamId = "FGHIJ67890";
        value[11].certificateFacts.teamId = "FGHIJ67890";
      },
      (value) => value[12].extractedProductIdentity.manifestDigest = digest("wrong clean-host product"),
      (value) => value[12].hostIdentity.image = "synthetic-peer-image",
      (value) => value[12].hostIdentity.uid = "0",
      (value) => value[12].userFlowEvidence.flow = "synthetic-arbitrary-flow",
      (value) => value[18].namedClaims = ["synthetic-peer-claim"],
      (value) => value[25].subordinateEvidence.reverse(),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipts);
      mutate(changed);
      expect(() => build({ receipts: changed })).toThrow();
    }
  });

  it("binds every Apple operation to exact full native tool observations in first-use order", () => {
    const mutations: ReadonlyArray<(value: any[]) => void> = [
      (value) => {
        const wrongPurpose = appleToolObservation("codesign", "signature-verification");
        value[2].verifierFacts.toolObservations = [wrongPurpose];
        value[2].verifierFacts.operationFacts[0].toolObservations = [structuredClone(wrongPurpose)];
      },
      (value) => {
        value[8].toolObservations.find(({ operation }: any) => operation === "createDiskImages")
          .toolObservations.reverse();
      },
      (value) => {
        value[10].toolObservations.find(({ operation }: any) => operation === "buildInstallerPackages")
          .toolObservations.pop();
      },
      (value) => {
        value[6].toolObservations.find(({ operation }: any) => operation === "submitApp")
          .toolObservations.reverse();
      },
      (value) => {
        const info = value[6].toolObservations.find(({ operation }: any) => operation === "info").toolObservations[0];
        info.nativeObservation.capabilities[0].id = "rejection-fixture-notarization";
        value[6].acceptedInfo.toolObservation.nativeObservation.capabilities[0].id = "rejection-fixture-notarization";
      },
      (value) => {
        const log = value[6].toolObservations.find(({ operation }: any) => operation === "log").toolObservations[0];
        log.nativeObservation.capabilities[0].evidence = "caller asserted an arbitrary probe";
        value[6].acceptedLog.toolObservation.nativeObservation.capabilities[0].evidence =
          "caller asserted an arbitrary probe";
      },
      (value) => {
        const staple = value[6].toolObservations.find(({ operation }: any) => operation === "stapleApp")
          .toolObservations[0];
        staple.nativeObservation.participants[0].content.digest.value = "f".repeat(64);
      },
      (value) => {
        const assess = value[6].toolObservations.find(({ operation }: any) => operation === "assess");
        assess.toolObservations.pop();
        value[6].assessment.toolObservations.pop();
      },
      (value) => {
        const assess = value[10].toolObservations.find(({ operation }: any) => operation === "assess")
          .toolObservations[1];
        assess.executableDigest = digest("swapped package verifier executable");
      },
      (value) => {
        const submit = value[8].toolObservations.find(({ operation }: any) => operation === "submit")
          .toolObservations[1];
        submit.observationDigest = digest("fabricated notarization observation");
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipts);
      mutate(changed);
      expect(() => build({ receipts: changed })).toThrow();
    }

    const appleFacts = receipts.flatMap((receipt: any) => [
      ...(receipt.operationFacts ?? []),
      ...(receipt.pairedAppManifest?.operationFacts ?? []),
      ...(receipt.verifierFacts?.operationFacts ?? []),
      ...(receipt.toolObservations ?? []),
    ]).filter(({ operationId }: any) => operationId.startsWith("PROD-APPLE-"));
    expect(appleFacts.length).toBeGreaterThan(0);
    for (const fact of appleFacts) {
      expect(fact.toolObservations.every(({ nativeObservation }: any) => nativeObservation !== undefined)).toBe(true);
    }
  });

  it("rejects malformed or reused journal transaction UUIDs", () => {
    const malformedIntent = structuredClone(receipts);
    malformedIntent[6].journalReference.intentTransaction = "not-a-uuid";
    expect(() => build({ receipts: malformedIntent })).toThrow(/canonical lowercase UUID/u);

    const uppercaseSubmission = structuredClone(receipts);
    uppercaseSubmission[6].journalReference.submissionTransaction = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
    expect(() => build({ receipts: uppercaseSubmission })).toThrow(/canonical lowercase UUID/u);

    const reused = structuredClone(receipts);
    reused[6].journalReference.submissionTransaction = reused[6].journalReference.intentTransaction;
    expect(() => build({ receipts: reused })).toThrow(/must be distinct/u);
  });

  it("rejects missing, additional, credential, private-log, and malformed nested fields", () => {
    const mutations: ReadonlyArray<(value: any[]) => void> = [
      (value) => delete value[0].bunExecutableIdentity,
      (value) => value[0].extra = "synthetic-peer-field",
      (value) => value[2].credential = "synthetic-must-not-be-admitted",
      (value) => value[6].acceptedLog.privateLogBody = "synthetic-private-body",
      (value) => value[12].hostIdentity.signingIdentity = "synthetic-forbidden",
      (value) => value[18].productOutput = "synthetic-forbidden",
      (value) => value[2].certificateFacts.teamId = "lowercase1",
      (value) => value[2].secureTimestamp = false,
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipts);
      mutate(changed);
      expect(() => build({ receipts: changed })).toThrow();
    }
  });

  it("rejects index, bundle framing, payload bytes, file set, and noncanonical JSON mutations", () => {
    expect(() => validate(aggregate.indexBytes, aggregate.bundleBytes, [...policy.artifact.orderedFiles, "extra"]))
      .toThrow(
        /only the two/u,
      );
    const changedBundle = Buffer.from(aggregate.bundleBytes);
    const last = changedBundle.byteLength - 1;
    changedBundle[last] = changedBundle[last]! ^ 1;
    expect(() => validate(aggregate.indexBytes, changedBundle)).toThrow();

    const changedIndex = structuredClone(aggregate.index);
    changedIndex.bundleDigest = digest("wrong bundle");
    expect(() => validate(canonicalBytes(changedIndex), aggregate.bundleBytes)).toThrow(/index/u);
    expect(() => validate(Buffer.from(JSON.stringify(aggregate.index)), aggregate.bundleBytes)).toThrow(/canonical/u);
    expect(() => canonicalJson({ label: "synthetic-e\u0301" })).toThrow(/NFC/u);
  });

  it("writes and revalidates the exact deterministic two-file aggregate without overwriting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-apple-aggregate-"));
    try {
      const receiptsPath = join(directory, "receipts.json");
      const evidenceDirectory = join(directory, "evidence");
      const outputDirectory = join(directory, "aggregate");
      await mkdir(evidenceDirectory);
      await writeFile(receiptsPath, canonicalBytes(receipts));
      for (const id of policy.evidenceDescriptorOrder) {
        await writeFile(join(evidenceDirectory, id), evidenceBytes.get(id)!);
      }
      await runAppleAggregateCli([
        "--output-directory",
        outputDirectory,
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        evidenceDirectory,
      ]);
      expect((await readdir(outputDirectory)).sort()).toEqual([...policy.artifact.orderedFiles].sort());
      expect(await readFile(join(outputDirectory, policy.artifact.orderedFiles[0]))).toEqual(aggregate.indexBytes);
      expect(await readFile(join(outputDirectory, policy.artifact.orderedFiles[1]))).toEqual(aggregate.bundleBytes);
      expect((await stat(join(outputDirectory, policy.artifact.orderedFiles[0]))).mode & 0o777).toBe(0o600);
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        evidenceDirectory,
        "--output-directory",
        outputDirectory,
      ])).rejects.toThrow(/already exists/u);
      expect(await readFile(join(outputDirectory, policy.artifact.orderedFiles[1]))).toEqual(aggregate.bundleBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on noncanonical receipts, evidence aliases, directory drift, and CLI drift", async () => {
    expect(() => parseAppleAggregateArguments([])).toThrow(/usage/u);
    expect(() =>
      parseAppleAggregateArguments([
        "--receipts",
        "one",
        "--receipts",
        "two",
        "--output-directory",
        "three",
      ])
    ).toThrow(/usage/u);

    const directory = await mkdtemp(join(tmpdir(), "effect-build-apple-aggregate-hostile-"));
    try {
      const receiptsPath = join(directory, "receipts.json");
      const evidenceDirectory = join(directory, "evidence");
      await mkdir(evidenceDirectory);
      for (const id of policy.evidenceDescriptorOrder) {
        await writeFile(join(evidenceDirectory, id), evidenceBytes.get(id)!);
      }
      await writeFile(receiptsPath, JSON.stringify(receipts));
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        evidenceDirectory,
        "--output-directory",
        join(directory, "noncanonical-output"),
      ])).rejects.toThrow(/canonical/u);

      await writeFile(receiptsPath, canonicalBytes(receipts));
      await writeFile(join(evidenceDirectory, "additional-evidence"), "synthetic additional evidence");
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        evidenceDirectory,
        "--output-directory",
        join(directory, "additional-output"),
      ])).rejects.toThrow(/missing or additional/u);
      await unlink(join(evidenceDirectory, "additional-evidence"));

      const aliasedId = policy.evidenceDescriptorOrder[0];
      const aliasTarget = join(directory, "alias-target");
      await writeFile(aliasTarget, evidenceBytes.get(aliasedId)!);
      await unlink(join(evidenceDirectory, aliasedId));
      await symlink(aliasTarget, join(evidenceDirectory, aliasedId));
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        evidenceDirectory,
        "--output-directory",
        join(directory, "alias-output"),
      ])).rejects.toThrow(/non-symlink/u);

      const hardlinkEvidence = join(directory, "hardlink-evidence");
      await mkdir(hardlinkEvidence);
      for (const id of policy.evidenceDescriptorOrder) {
        await writeFile(join(hardlinkEvidence, id), evidenceBytes.get(id)!);
      }
      await link(join(hardlinkEvidence, aliasedId), join(directory, "evidence-hardlink-alias"));
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        hardlinkEvidence,
        "--output-directory",
        join(directory, "hardlink-output"),
      ])).rejects.toThrow(/single-link/u);

      const realParent = join(directory, "real-parent");
      const nestedEvidence = join(realParent, "nested-evidence");
      await mkdir(nestedEvidence, { recursive: true });
      for (const id of policy.evidenceDescriptorOrder) {
        await writeFile(join(nestedEvidence, id), evidenceBytes.get(id)!);
      }
      const parentAlias = join(directory, "parent-alias");
      await symlink(realParent, parentAlias);
      await expect(runAppleAggregateCli([
        "--receipts",
        receiptsPath,
        "--evidence-directory",
        nestedEvidence,
        "--output-directory",
        join(parentAlias, "nested-evidence", "aliased-inside-output"),
      ])).rejects.toThrow(/outside the immutable evidence/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the aggregate writer credential-free and offline", async () => {
    await expect(authenticateGeneratedAppleContract()).resolves.toEqual(contract);
    const directory = await mkdtemp(join(tmpdir(), "effect-build-apple-contract-hostile-"));
    try {
      const changedContract = join(directory, "effect-build-contract.json");
      const exactContract = await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8");
      await writeFile(changedContract, `${exactContract}\n`);
      await expect(authenticateGeneratedAppleContract({ outputPath: changedContract })).rejects.toThrow(
        /unauthenticated or stale/u,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const source = await readFile(resolve(root, "scripts/apple-certification/cli.mjs"), "utf8");
    expect(source).not.toMatch(/process\.env|node:(?:child_process|http|https|net|tls)|\bfetch\s*\(/u);
    expect(source).not.toMatch(/(?:APPLE|AWS|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)/u);
  });
});
