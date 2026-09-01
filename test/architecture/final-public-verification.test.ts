import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// @ts-expect-error Unprotected contract model module.
import * as contractModel from "../../scripts/effect-build-contract/model.mjs";
// @ts-expect-error Unprotected release verification module.
import * as finalVerifier from "../../scripts/release/final-public-verification.mjs";
// @ts-expect-error Unprotected release protocol module.
import * as releaseProtocol from "../../scripts/release/protocol.mjs";

const { renderJson } = contractModel;
const { validateFinalPublicState } = finalVerifier;
const { canonicalJson, derivePublicModules, derivePublicPackageNames, sha256Digest, sha512Integrity } = releaseProtocol;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const generated = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const sourceSha = "a".repeat(40);
const observedAt = "2026-08-30T16:00:00.000Z";
const validationTime = "2026-08-30T16:05:00.000Z";
const evidenceObservedAt = "2026-08-30T15:30:00.000Z";
const expiresAt = "2026-08-30T17:00:00.000Z";

const derUtf8 = (value: string) => {
  const payload = Buffer.from(value);
  return Buffer.concat([Buffer.from([0x0c, payload.byteLength]), payload]);
};

const fixture = () => {
  const contract = structuredClone(generated);
  const release = contract.releaseCertification;
  release.finalPublicVerification.status = "ready";
  release.finalPublicVerification.artifactDisposition = "allowed";
  const authentication = release.readiness.externalEvidenceAuthentication;
  authentication.status = "supported";
  authentication.artifactDisposition = "required-on-terminal-workflow-success";
  authentication.signer.activation.permissions = {
    observer: { contents: "read" },
    signer: { "id-token": "write" },
    upload: {},
  };
  authentication.signer.activation.hostedBootstrap.status = "qualified";
  authentication.producerIdentities = release.readiness.evidenceRoles
    .filter(({ type }: { type: string }) => type === "externalObservation")
    .map(({ role }: { role: string }) => {
      const workflow = `mannyc2/effect-build/.github/workflows/${role}.yml@refs/heads/main`;
      return {
        role,
        certificateIssuer: authentication.verifier.certificateIssuer,
        certificateIdentityURI: `https://github.com/${workflow}`,
        workflow,
        repository: "mannyc2/effect-build",
        ref: "refs/heads/main",
        sourceBinding: { kind: "release-source-sha" },
      };
    });
  const reservationBytes = Buffer.from("fixture reservation bytes\n");
  const reservationLedger = release.finalPublicVerification.implementation.reservation.ledger;
  reservationLedger.bytes = reservationBytes.byteLength;
  reservationLedger.sha256 = sha256Digest(reservationBytes).slice("sha256:".length);
  reservationLedger.integrity = sha512Integrity(reservationBytes);
  const contractBytes = Buffer.from(renderJson(contract));
  const names = derivePublicPackageNames(contract);
  const modules = derivePublicModules(contract);
  const packageBytes = new Map<string, Buffer>();
  const packageManifests = new Map<string, { bytes: Buffer; manifest: object }>();
  const packages = names.map((name: string) => {
    const tarball = Buffer.from(`candidate tarball bytes for ${name}\n`);
    const manifest = {
      name,
      version: release.finalPublicVerification.version,
      publishConfig: { access: "public", provenance: true },
      repository: {
        type: "git",
        url: "git+https://github.com/mannyc2/effect-build.git",
        directory: `packages/${name}`,
      },
    };
    const manifestBytes = Buffer.from(canonicalJson(manifest));
    packageBytes.set(name, tarball);
    packageManifests.set(name, { bytes: manifestBytes, manifest });
    return {
      name,
      file: `${name}-0.6.0.tgz`,
      bytes: tarball.byteLength,
      sha256: sha256Digest(tarball),
      integrity: sha512Integrity(tarball),
      manifestDigest: sha256Digest(manifestBytes),
    };
  });
  const candidateManifest = {
    schema: release.candidate.protocol,
    sourceSha,
    version: "0.6.0",
    contract: { schema: contract.schema, digest: sha256Digest(contractBytes) },
    toolchain: {
      bun: { name: "bun", version: release.finalPublicVerification.implementation.consumerSmoke.bun.version },
      node: { name: "node", version: release.npmOidcCertification.client.node },
      npm: { name: "npm", version: release.npmOidcCertification.client.npm },
    },
    publicModules: modules,
    packages,
  };
  const candidateManifestBytes = Buffer.from(canonicalJson(candidateManifest));
  const coordinate = (workflow: string, digestByte: string) => ({
    workflow,
    sourceSha,
    runId: "10",
    runAttempt: "1",
    artifactId: "20",
    artifactDigest: `sha256:${digestByte.repeat(64)}`,
  });
  const candidate = {
    reference: {
      protocol: release.candidate.protocol,
      coordinate: coordinate(release.candidate.workflow, "1"),
      artifactName: release.candidate.artifactName.replace("<sourceSha>", sourceSha),
      manifestDigest: sha256Digest(candidateManifestBytes),
      observedAt: evidenceObservedAt,
      expiresAt,
      bytes: `${candidateManifestBytes.byteLength}`,
    },
    manifestBytes: candidateManifestBytes,
    files: [release.candidate.manifest, ...packages.map(({ file }: { file: string }) => file)],
    packageBytes,
    packageManifests,
  };
  const readinessManifestBytes = Buffer.from(canonicalJson({ fixture: "authenticated readiness" }));
  const readiness = {
    reference: {
      protocol: release.readiness.protocol,
      coordinate: coordinate(release.readiness.workflow, "2"),
      artifactName: release.readiness.artifactName,
      manifestDigest: sha256Digest(readinessManifestBytes),
      observedAt: evidenceObservedAt,
      expiresAt,
      bytes: `${readinessManifestBytes.byteLength}`,
    },
    manifestBytes: readinessManifestBytes,
    bundleBytes: Buffer.from("authenticated readiness bundle\n"),
    files: release.readiness.orderedFiles,
  };
  const npmPackageBytes = new Map(packageBytes);
  const npmPackages = packages.map((entry: any) => ({
    name: entry.name,
    version: "0.6.0",
    latest: "0.6.0",
    bytes: entry.bytes,
    sha256: entry.sha256,
    integrity: entry.integrity,
    tarballUrl: `https://registry.npmjs.org/${entry.name}/-/${entry.file}`,
  }));
  const releaseAssetBytes = new Map<string, Buffer>([
    ...packages.map((entry: any) => [entry.file, packageBytes.get(entry.name)] as [string, Buffer]),
    [release.candidate.manifest, candidateManifestBytes],
  ]);
  const releaseAssets = [...releaseAssetBytes].map(([name, assetBytes], index) => ({
    name,
    assetId: `${index + 1}`,
    bytes: assetBytes.byteLength,
    digest: sha256Digest(assetBytes),
    apiUrl: `https://api.github.com/repos/mannyc2/effect-build/releases/assets/${index + 1}`,
    browserDownloadUrl: `https://github.com/mannyc2/effect-build/releases/download/v0.6.0/${name}`,
  }));
  const provenanceBundles = new Map<string, object>();
  const provenance = names.map((name: string) => {
    const sha512 = createHash("sha512").update(packageBytes.get(name)!).digest("hex");
    const statement = {
      _type: release.finalPublicVerification.implementation.provenance.statementType,
      predicateType: release.finalPublicVerification.implementation.provenance.predicateType,
      subject: [{ digest: { sha512 }, name: `pkg:npm/${name}@0.6.0` }],
      predicate: {
        buildDefinition: {
          buildType: release.finalPublicVerification.implementation.provenance.buildType,
          externalParameters: {
            workflow: {
              path: ".github/workflows/release.yml",
              ref: "refs/heads/main",
              repository: "https://github.com/mannyc2/effect-build",
            },
          },
          internalParameters: {
            github: { event_name: "workflow_dispatch", repository_id: "1331906770", repository_owner_id: "126291407" },
          },
          resolvedDependencies: [{
            digest: { gitCommit: sourceSha },
            uri: "git+https://github.com/mannyc2/effect-build@refs/heads/main",
          }],
        },
        runDetails: {
          builder: { id: release.finalPublicVerification.implementation.provenance.builderId },
          metadata: { invocationId: "https://github.com/mannyc2/effect-build/actions/runs/10/attempts/1" },
        },
      },
    };
    const bundle = {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
        payloadType: release.finalPublicVerification.implementation.provenance.payloadType,
        signatures: [{ sig: "fixture" }],
      },
    };
    provenanceBundles.set(name, bundle);
    return {
      name,
      attestationUrl: `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(name)}@0.6.0`,
      bundleDigest: sha256Digest(canonicalJson(bundle)),
      subjectDigest: `sha512:${sha512}`,
      workflow: release.candidate.workflow,
      sourceSha,
    };
  });
  const consumerSmoke = {
    schema: release.finalPublicVerification.implementation.consumerSmoke.protocol,
    version: "0.6.0",
    node: {
      executor: "node",
      version: release.finalPublicVerification.implementation.consumerSmoke.node.version,
      npm: release.finalPublicVerification.implementation.consumerSmoke.node.npm,
      cache: release.finalPublicVerification.implementation.consumerSmoke.node.cache,
      publicModules: modules,
      pipelines: release.finalPublicVerification.implementation.consumerSmoke.representativePipelines,
      passed: true,
    },
    bun: {
      executor: "bun",
      version: release.finalPublicVerification.implementation.consumerSmoke.bun.version,
      cache: release.finalPublicVerification.implementation.consumerSmoke.bun.cache,
      publicModules: modules,
      pipelines: release.finalPublicVerification.implementation.consumerSmoke.representativePipelines,
      passed: true,
    },
    publicModules: modules,
    pipelines: release.finalPublicVerification.implementation.consumerSmoke.representativePipelines,
    passed: true,
  };
  const reservation = {
    name: reservationLedger.name,
    version: reservationLedger.version,
    versions: [reservationLedger.version],
    latest: reservationLedger.bootstrapTags.latest,
    reserved: reservationLedger.bootstrapTags.reserved,
    bytes: reservationBytes.byteLength,
    sha256: sha256Digest(reservationBytes),
    integrity: sha512Integrity(reservationBytes),
  };
  return {
    contract,
    contractBytes,
    sourceSha,
    observedAt,
    validationTime,
    candidate,
    readiness,
    tag: {
      repository: "mannyc2/effect-build",
      name: "v0.6.0",
      targetSha: sourceSha,
      objectType: "commit",
      form: "lightweight-direct-commit",
    },
    release: {
      repository: "mannyc2/effect-build",
      releaseId: "30",
      tagName: "v0.6.0",
      targetSha: sourceSha,
      draft: false,
      prerelease: false,
      immutable: true,
      observedAt,
    },
    npmPackages,
    npmPackageBytes,
    releaseAssets,
    releaseAssetBytes,
    provenance,
    provenanceBundles,
    consumerSmoke,
    reservation,
    reservationBytes,
    sigstoreVerify: vi.fn(async () => {
      const verifier = release.readiness.externalEvidenceAuthentication.verifier;
      const identity = `https://github.com/${release.candidate.workflow}`;
      return {
        identity: {
          subjectAlternativeName: identity,
          extensions: { issuer: verifier.certificateIssuer },
          oids: [
            {
              oid: { id: verifier.certificateOids.buildSignerUri.split(".").map(Number) },
              value: derUtf8(identity),
            },
            {
              oid: { id: verifier.certificateOids.sourceRepositoryUri.split(".").map(Number) },
              value: derUtf8(`https://github.com/${release.githubAuthority.repository}`),
            },
            {
              oid: { id: verifier.certificateOids.sourceRepositoryDigest.split(".").map(Number) },
              value: derUtf8(sourceSha),
            },
          ],
        },
      };
    }),
    readinessVerify: vi.fn(async () => ({
      manifest: { schema: release.readiness.protocol, candidate: candidate.reference },
      authenticatedExternalReceipts: new Map([["github-release-governance", { enabled: true }]]),
    })),
  };
};

describe("full inert final-public verifier", () => {
  it("produces one canonical receipt for exact npm, Release, provenance, smoke, and reservation state", async () => {
    const input = fixture();
    const result = await validateFinalPublicState(input);
    expect(result.receipt.verdict).toBe("success");
    expect(result.receipt.npmPackages).toHaveLength(11);
    expect(result.receipt.releaseAssets).toHaveLength(12);
    expect(result.receipt.provenance).toHaveLength(11);
    expect(result.receipt.consumerSmoke.publicModules).toHaveLength(42);
    expect(result.receiptBytes.toString()).toBe(canonicalJson(result.receipt));
    expect(input.sigstoreVerify).toHaveBeenCalledTimes(11);
    expect(input.readinessVerify).toHaveBeenCalledTimes(1);
  });

  it("rejects a separately valid candidate that is not the exact readiness-certified candidate", async () => {
    const input = fixture();
    input.readinessVerify = vi.fn(async () => ({
      manifest: {
        schema: input.contract.releaseCertification.readiness.protocol,
        candidate: {
          ...input.candidate.reference,
          coordinate: {
            ...input.candidate.reference.coordinate,
            artifactId: "999",
            artifactDigest: `sha256:${"9".repeat(64)}`,
          },
        },
      },
      authenticatedExternalReceipts: new Map([[
        "github-release-governance",
        { enabled: true },
      ]]),
    }));
    await expect(validateFinalPublicState(input)).rejects.toThrow(/readiness-certified candidate/u);
  });

  it("fails closed on bytes, provenance, smoke, reservation, or governance drift", async () => {
    const cases = [
      (input: any) => input.npmPackageBytes.set(input.npmPackages[0].name, Buffer.from("changed")),
      (input: any) => input.releaseAssetBytes.set(input.releaseAssets[0].name, Buffer.from("changed")),
      (input: any) => input.provenance[0].sourceSha = "b".repeat(40),
      (input: any) => input.consumerSmoke.publicModules.pop(),
      (input: any) => input.reservation.versions.push("0.6.0"),
      (input: any) => input.release.immutable = false,
    ];
    for (const mutate of cases) {
      const input = fixture();
      mutate(input);
      await expect(validateFinalPublicState(input)).rejects.toThrow();
    }
    const input = fixture();
    input.sigstoreVerify = vi.fn(async () => {
      throw new Error("signature rejected");
    });
    await expect(validateFinalPublicState(input)).rejects.toThrow(/signature rejected/u);

    const noncanonical = fixture();
    noncanonical.contractBytes = Buffer.from(` ${noncanonical.contractBytes.toString()}`);
    await expect(validateFinalPublicState(noncanonical)).rejects.toThrow(/exact generated rendering/u);
  });
});
