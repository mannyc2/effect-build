import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error The canonical release helper is an intentionally unprotected Node module.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";

// @ts-expect-error The readiness protocol is an intentionally unprotected Node script module.
import * as readiness from "../../scripts/release/readiness-protocol.mjs";

const {
  assertReadinessArtifactAllowed,
  buildReadinessAggregate,
  validateReadinessAggregate,
  validateGithubArtifactEvidence,
} = readiness;
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const policy = contract.releaseCertification.readiness;
const blocker = "contract-pinned-external-producer-identities-and-isolated-observer-signer-bootstraps-not-established";
const sourceSha = "a".repeat(40);
const coordinate = (workflow: string, seed: string) => ({
  workflow,
  sourceSha,
  runId: seed,
  runAttempt: "1",
  artifactId: `${Number(seed) + 100}`,
  artifactDigest: `sha256:${seed.padStart(64, "0")}`,
});

describe("release readiness protocol", () => {
  it("freezes an explicit no-artifact STOP until authenticated external producer identities exist", () => {
    expect(policy.externalEvidencePolicy).toBe(
      "closed-receipts-require-contract-pinned-sigstore-dsse-authentication",
    );
    expect(policy.externalEvidenceManifest).toEqual({
      validation: "closed-shape-source-time-terminal-identity-digest-and-byte-correlation",
      producerAuthentication: "required-before-readiness-artifact-production",
      authenticationRequiredRoles: [
        "npm-authority",
        "operational-journal",
        "github-release-governance",
      ],
    });
    expect(policy.externalEvidenceAuthentication).toEqual({
      status: "blocked",
      artifactDisposition: "forbidden-while-blocked",
      blocker,
      requiredEnvelope: "sigstore-bundle-v0.3-dsse",
      requiredBindings: [
        "producer-workflow-identity",
        "producer-source-sha",
        "release-source-sha",
        "receipt-protocol",
        "receipt-digest",
        "observed-at",
        "expiration",
      ],
      signer: policy.externalEvidenceAuthentication.signer,
      verifier: {
        status: "implemented",
        module: "scripts/release/sigstore-dsse-verifier.mjs",
        client: { package: "@sigstore/verify", version: "3.1.1" },
        bundleClient: { package: "@sigstore/bundle", version: "4.0.0" },
        protobufClient: { package: "@sigstore/protobuf-specs", version: "0.5.2" },
        runtime: { executable: "node", version: "24.14.1" },
        networkGuard: {
          path: "scripts/release/deny-network.cjs",
          bytes: 4379,
          digest: "sha256:acb4f347c8abb4dbc98d138b487b7cf316a3ccbbbf3a2da2108e68e9b343de77",
          strategy: "preload-standard-node-network-api-denial-plus-audited-direct-verifier-closure",
        },
        trustedRoot: {
          path: "tooling/sigstore/trusted_root.json",
          artifactFile: "sigstore-trusted-root.json",
          mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
          bytes: 6787,
          digest: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
          tuf: {
            mirror: "https://tuf-repo-cdn.sigstore.dev",
            target: "trusted_root.json",
            targetsMetadataVersion: 14,
            targetLength: 6787,
            targetSha256: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
            acquisition: {
              retrievedAt: "2026-08-30T15:07:03.000Z",
              cache: "fresh-empty-temporary-directory",
              home: "isolated-empty-directory",
              network: "exact-official-mirror-only",
              evidenceEncoding: "base64-of-exact-retrieved-bytes",
              verificationModule: "scripts/release/verify-sigstore-tuf-provenance.mjs",
              clients: [
                {
                  package: "@sigstore/tuf",
                  version: "4.0.2",
                  integrity:
                    "sha512-TCAzTy0xzdP79EnxSjq9KQ3eaR7+FmudLC6eRKknVKZbV7ZNlGLClAAQb/HMNJ5n2OBNk2GT1tEmU0xuPr+SLQ==",
                },
                {
                  package: "tuf-js",
                  version: "4.1.0",
                  integrity:
                    "sha512-50QV99kCKH5P/Vs4E2Gzp7BopNV+KzTXqWeaxrfu5IQJBOULRsTIS9seSsOVT8ZnGXzCyx55nYWAi4qJzpZKEQ==",
                },
                {
                  package: "@tufjs/models",
                  version: "4.1.0",
                  integrity:
                    "sha512-Y8cK9aggNRsqJVaKUlEYs4s7CvQ1b1ta2DVPyAimb0I2qhzjNk+A+mxvll/klL0RlfuIUei8BF7YWiua4kQqww==",
                },
              ],
              seedRoot: {
                path: "tooling/sigstore/tuf/seed-root-v14.json.base64",
                version: 14,
                expiresAt: "2026-06-22T13:27:01.000Z",
                bytes: 5490,
                digest: "sha256:c8c41ec13f06ccabf5b48541ee2550098b4c7b5349e1d180390c29a7d5c2642c",
                clientSeedsBytes: 19326,
                clientSeedsDigest: "sha256:1300a33af16967e998983b364ab9988cd5c20e94c44e75d642dbeda1dbc255d9",
              },
              metadata: {
                root: {
                  path: "tooling/sigstore/tuf/root-v15.json.base64",
                  version: 15,
                  expiresAt: "2026-11-20T13:58:18.000Z",
                  bytes: 5630,
                  digest: "sha256:73747011d0857ada15479a16c4cae0f3ed03aac698b523b97e1de314ac9d9ca8",
                },
                timestamp: {
                  path: "tooling/sigstore/tuf/timestamp-v769.json.base64",
                  version: 769,
                  expiresAt: "2026-09-05T19:19:49.000Z",
                  bytes: 449,
                  digest: "sha256:fa85cf89eeeec634759809a793a6056940f57c47b9fa1da4d095b0f9852e18c4",
                },
                snapshot: {
                  path: "tooling/sigstore/tuf/snapshot-v165.json.base64",
                  version: 165,
                  expiresAt: "2036-05-15T08:09:16.000Z",
                  bytes: 1760,
                  digest: "sha256:8f784ab614ec62bfdd5f568eb2a2e3011668449ba235ed4eb7befa99f8469933",
                },
                targets: {
                  path: "tooling/sigstore/tuf/targets-v14.json.base64",
                  version: 14,
                  expiresAt: "2036-05-09T09:00:52.000Z",
                  bytes: 4942,
                  digest: "sha256:6a697f7f8908c8ab26c11786ecb490b54acec97fa8c802e399f065f8a0cc1acd",
                },
              },
              verification:
                "retained-seed-root-rotation-signatures-expiry-versions-descriptors-and-target-bytes-replay",
            },
          },
          verification: "offline-direct-verifier-no-tuf-network-or-cache-fallback",
        },
        bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        bundleFields: ["mediaType", "verificationMaterial", "dsseEnvelope"],
        verificationMaterialFields: ["certificate", "tlogEntries", "timestampVerificationData"],
        timestampVerificationDataFields: [],
        envelopeFields: ["payload", "payloadType", "signatures"],
        signatureFields: ["sig"],
        payloadType: "application/vnd.effect-build.release-evidence+json;version=1",
        payloadProtocol: "effect-build/authenticated-external-evidence@1",
        payloadFields: [
          "schema",
          "role",
          "producerWorkflow",
          "producerSourceSha",
          "releaseSourceSha",
          "receiptProtocol",
          "receiptBytes",
          "receiptDigest",
          "observedAt",
          "expiresAt",
          "receiptBase64",
        ],
        certificateIssuer: "https://token.actions.githubusercontent.com",
        certificateIdentityMatch: "exact-anchored-uri-from-contract-role-identity",
        certificateOids: {
          buildSignerUri: "1.3.6.1.4.1.57264.1.9",
          sourceRepositoryUri: "1.3.6.1.4.1.57264.1.12",
          sourceRepositoryDigest: "1.3.6.1.4.1.57264.1.13",
        },
        ctLogThreshold: 1,
        tlogThreshold: 1,
        minimumTlogEntries: 1,
        envelopeSignatureCount: 1,
        maximumBundleBytes: 32768,
        maximumReceiptBytes: 16384,
        forbiddenEnvironmentSource: "releaseCertification.npmOidcCertification.forbiddenEnvironmentNames",
        network: "forbidden-by-preload-guard-and-audited-direct-verifier-closure",
      },
      producerIdentityFields: [
        "role",
        "certificateIssuer",
        "certificateIdentityURI",
        "workflow",
        "repository",
        "ref",
        "sourceBinding",
      ],
      sourceBinding: {
        releaseSourceFields: ["kind"],
        releaseSourceKind: "release-source-sha",
        exactSourceFields: ["kind", "sourceSha"],
        exactSourceKind: "exact-source-sha",
      },
      producerIdentities: [],
    });
    expect(policy.dispatch.externalIngressReferenceFields).toEqual(policy.externalEvidenceIngress.referenceFields);
    expect(policy.dispatch.externalInputs).toBe(
      "three-compact-authenticated-ingress-artifact-references-only",
    );
    expect(policy.externalEvidenceIngress.dispatch).toEqual({
      sourceInput: "source_sha",
      roleInput: "role",
      referenceInput: "evidence_reference_json",
      bundleInput: "sigstore_bundle_base64",
      maximumReferenceCharacters: 4096,
      maximumBundleBytes: 32768,
      maximumEncodedBundleCharacters: 43692,
      maximumTotalPayloadCharacters: 65535,
    });
  });

  it("refuses build and validation before inspecting caller-authored aggregate values", () => {
    expect(() => assertReadinessArtifactAllowed(contract)).toThrow(blocker);
    expect(() => buildReadinessAggregate({ contract })).toThrow(blocker);
    expect(() => validateReadinessAggregate({ contract })).toThrow(blocker);
  });

  it("does not become permissive if a caller mutates blocked policy fields in memory", () => {
    const claimedVerified = structuredClone(contract);
    claimedVerified.releaseCertification.readiness.externalEvidenceAuthentication.status = "verified";
    claimedVerified.releaseCertification.readiness.externalEvidenceAuthentication.artifactDisposition = "allowed";
    claimedVerified.releaseCertification.readiness.externalEvidenceAuthentication.producerIdentities = [
      "https://github.com/peer/repository/.github/workflows/peer.yml@refs/heads/main",
    ];
    expect(() => assertReadinessArtifactAllowed(claimedVerified)).toThrow(/policy is not exact/u);

    const extraField = structuredClone(contract);
    extraField.releaseCertification.readiness.externalEvidenceAuthentication.fallback = true;
    expect(() => assertReadinessArtifactAllowed(extraField)).toThrow(/additional fields/u);
  });

  it("admits a future ready policy only with all three closed producer identities and source bindings", () => {
    const ready = structuredClone(contract);
    const authentication = ready.releaseCertification.readiness.externalEvidenceAuthentication;
    authentication.status = "supported";
    authentication.artifactDisposition = "required-on-terminal-workflow-success";
    authentication.signer.activation.permissions = {
      observer: { contents: "read" },
      signer: { "id-token": "write" },
      upload: {},
    };
    authentication.signer.activation.hostedBootstrap.status = "qualified";
    authentication.producerIdentities = ready.releaseCertification.readiness.evidenceRoles
      .filter(({ type }: { type: string }) => type === "externalObservation")
      .map(({ role }: { role: string }, index: number) => {
        const repository = index === 1 ? "effect-ts/ts-release" : "mannyc2/effect-build";
        const ref = "refs/heads/main";
        const sourceBinding = index === 1
          ? { kind: "exact-source-sha", sourceSha: "b".repeat(40) }
          : { kind: "release-source-sha" };
        const workflowRef = sourceBinding.kind === "exact-source-sha" ? sourceBinding.sourceSha : ref;
        const workflow = `${repository}/.github/workflows/${role}.yml@${workflowRef}`;
        return {
          role,
          certificateIssuer: authentication.verifier.certificateIssuer,
          certificateIdentityURI: `https://github.com/${workflow}`,
          workflow,
          repository,
          ref,
          sourceBinding,
        };
      });
    expect(() => assertReadinessArtifactAllowed(ready)).not.toThrow();
    for (
      const mutate of [
        (value: any) =>
          value.producerIdentities[0].sourceBinding = { kind: "release-source-sha", sourceSha: "c".repeat(40) },
        (value: any) => value.producerIdentities[1].sourceBinding.sourceSha = "caller-chosen",
        (value: any) => value.producerIdentities[2].workflow += "-peer",
      ]
    ) {
      const changed = structuredClone(authentication);
      mutate(changed);
      const hostile = structuredClone(ready);
      hostile.releaseCertification.readiness.externalEvidenceAuthentication = changed;
      expect(() => assertReadinessArtifactAllowed(hostile)).toThrow();
    }
  });

  it("keeps the future closed receipt validator local and side-effect free", async () => {
    const source = await readFile(resolve(root, "scripts/release/readiness-protocol.mjs"), "utf8");
    expect(source).toContain("readiness artifact may be built or admitted from caller-asserted bytes");
    expect(source).toContain("validateExternalReceipt");
    expect(source).toContain("assertReadinessArtifactAllowed(arguments_?.contract);");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(/\bspawnSync\s*\(/u);
    expect(source).not.toMatch(/\b(?:writeFile|appendFile|rename|unlink|rm)\w*\s*\(/u);
  });

  it("semantically admits only the exact fake protected-body receipt bound to the candidate", () => {
    const supportedContract = structuredClone(contract);
    supportedContract.releaseCertification.readiness.externalEvidenceAuthentication.status = "supported";
    supportedContract.releaseCertification.readiness.externalEvidenceAuthentication.artifactDisposition =
      "required-on-terminal-workflow-success";
    supportedContract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.status = "supported";
    supportedContract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.artifactDisposition =
      "required-on-supported-terminal-workflow-success";
    const supportedPolicy = supportedContract.releaseCertification.readiness;
    const definition = supportedPolicy.evidenceRoles.find(({ role }: { role: string }) => role === "fake-registry");
    const candidateCoordinate = coordinate(supportedContract.releaseCertification.candidate.workflow, "10");
    const workflowCoordinate = coordinate(definition.workflow, "11");
    const fake = supportedContract.releaseCertification.fakeRegistry;
    const certification = fake.exactProtectedBodyCertification;
    const candidateManifestDigest = `sha256:${"f".repeat(64)}`;
    const coordinates = certification.exactMutationLedger.map((entry: any, index: number) => ({
      coordinate: entry.coordinate,
      status: "passed",
      attemptedFakeMutations: entry.attemptedFakeMutations,
      committedFakeMutations: entry.committedFakeMutations,
      candidateBinding: entry.candidateBinding,
      candidateArtifactDigest: entry.candidateBinding === "exact-release-candidate"
        ? candidateCoordinate.artifactDigest
        : `sha256:${`${index + 1}`.padStart(64, "0")}`,
      candidateManifestDigest: entry.candidateBinding === "exact-release-candidate"
        ? candidateManifestDigest
        : `sha256:${`${index + 101}`.padStart(64, "0")}`,
    }));
    const contractDigest = sha256Digest(canonicalJson(supportedContract));
    const receipt = {
      schema: certification.protocol,
      sourceSha,
      observedAt: "2026-08-30T16:00:00.000Z",
      workflow: certification.workflow,
      contractDigest,
      externalAuthenticationStatus: "supported",
      candidate: candidateCoordinate,
      candidateManifestDigest,
      coordinates,
      coordinateCount: coordinates.length,
      claims: certification.requiredClaims,
      doesNotProve: certification.doesNotProve,
      realRegistryMutation: false,
      realNpmOrRegistryCredentialsUsed: false,
      terminal: certification.terminal,
    };
    const files = new Map([[certification.orderedFiles[0], Buffer.from(canonicalJson(receipt))]]);
    const reference = {
      coordinate: workflowCoordinate,
      evidenceObservedAt: receipt.observedAt,
      observedAt: "2026-08-30T16:01:00.000Z",
    };
    expect(validateGithubArtifactEvidence({
      contract: supportedContract,
      definition,
      reference,
      sourceSha,
      candidateCoordinate,
      candidateManifestDigest,
      contractDigest,
      files,
    })).toEqual(receipt);
    const hostile = structuredClone(receipt);
    hostile.candidateManifestDigest = `sha256:${"0".repeat(64)}`;
    expect(() =>
      validateGithubArtifactEvidence({
        contract: supportedContract,
        definition,
        reference,
        sourceSha,
        candidateCoordinate,
        candidateManifestDigest,
        contractDigest,
        files: new Map([[certification.orderedFiles[0], Buffer.from(canonicalJson(hostile))]]),
      })
    ).toThrow(/protected-body certification/u);
    const zeroed = structuredClone(receipt);
    zeroed.coordinates[0].attemptedFakeMutations = 0;
    zeroed.coordinates[0].committedFakeMutations = 0;
    expect(() =>
      validateGithubArtifactEvidence({
        contract: supportedContract,
        definition,
        reference,
        sourceSha,
        candidateCoordinate,
        candidateManifestDigest,
        contractDigest,
        files: new Map([[certification.orderedFiles[0], Buffer.from(canonicalJson(zeroed))]]),
      })
    ).toThrow(/protected-body certification/u);
  });

  it("semantically validates both npm OIDC receipts and their candidate, claims, marker, and state bindings", () => {
    const release = contract.releaseCertification;
    const definition = policy.evidenceRoles.find(({ role }: { role: string }) => role === "npm-oidc-certification");
    const candidateCoordinate = coordinate(release.candidate.workflow, "20");
    const workflowCoordinate = coordinate(definition.workflow, "21");
    const evidence = release.npmOidcCertification.evidence;
    const authority = release.githubAuthority;
    const observedAt = "2026-08-30T16:00:00.000Z";
    const observedSeconds = Date.parse(observedAt) / 1_000;
    const claims = {
      ...evidence.githubOidcClaims.staticClaims,
      environment: authority.environment,
      ref: "refs/heads/main",
      repository: authority.repository,
      repository_id: authority.repositoryId,
      repository_owner: authority.repositoryOwner,
      repository_owner_id: authority.repositoryOwnerId,
      run_attempt: workflowCoordinate.runAttempt,
      run_id: workflowCoordinate.runId,
      sha: sourceSha,
      sub: authority.expectedEnvironmentSubject,
      workflow_ref: release.candidate.workflow,
      workflow_sha: sourceSha,
    };
    const sourceDigests = release.npmOidcCertification.sourceDigests.map(({ path, sha256 }: any) => ({
      path,
      sha256: `sha256:${sha256}`,
    }));
    const claimsReceipt = {
      schema: evidence.protocols.githubOidcClaims,
      sourceSha,
      candidate: candidateCoordinate,
      client: release.npmOidcCertification.client,
      observedAt,
      claims,
      claimsDigest: sha256Digest(Buffer.from(canonicalJson(claims))),
      jwtValidation: {
        alg: "RS256",
        kid: "fixture",
        iat: observedSeconds,
        nbf: observedSeconds,
        exp: observedSeconds + 600,
        issuerConfigurationDigest: `sha256:${"1".repeat(64)}`,
        jwksDigest: `sha256:${"2".repeat(64)}`,
        signingKeyDigest: `sha256:${"3".repeat(64)}`,
        signatureVerified: true,
      },
      sourceDigests,
      registryMutation: false,
      proves: evidence.receiptClaims.githubOidcClaims.proves,
      doesNotProve: evidence.receiptClaims.githubOidcClaims.doesNotProve,
    };
    const packages = Object.keys(contract.publicApiProjection.packages).sort();
    const stateDigest = `sha256:${"4".repeat(64)}`;
    const npmReceipt = {
      schema: evidence.protocols.npmOidcExchangeAccepted,
      sourceSha,
      candidate: candidateCoordinate,
      client: release.npmOidcCertification.client,
      observedAt,
      packages,
      exchanges: packages.map((name) => ({ name, accepted: true, markerCount: 1 })),
      beforeRegistryStateDigest: stateDigest,
      afterRegistryStateDigest: stateDigest,
      sourceDigests,
      registryMutation: false,
      proves: evidence.receiptClaims.npmOidcExchangeAccepted.proves,
      doesNotProve: evidence.receiptClaims.npmOidcExchangeAccepted.doesNotProve,
    };
    const files = new Map([
      [evidence.orderedFiles[0], Buffer.from(canonicalJson(claimsReceipt))],
      [evidence.orderedFiles[1], Buffer.from(canonicalJson(npmReceipt))],
    ]);
    const artifactReference = {
      coordinate: workflowCoordinate,
      evidenceObservedAt: observedAt,
      observedAt: "2026-08-30T16:01:00.000Z",
      aggregateObservedAt: Date.parse("2026-08-30T16:01:00.000Z"),
    };
    expect(validateGithubArtifactEvidence({
      contract,
      definition,
      reference: artifactReference,
      sourceSha,
      candidateCoordinate,
      candidateManifestDigest: `sha256:${"5".repeat(64)}`,
      files,
    })).toEqual({ claims: claimsReceipt, npm: npmReceipt });
    const hostile = structuredClone(npmReceipt);
    hostile.exchanges[0]!.markerCount = 2;
    expect(() =>
      validateGithubArtifactEvidence({
        contract,
        definition,
        reference: artifactReference,
        sourceSha,
        candidateCoordinate,
        candidateManifestDigest: `sha256:${"5".repeat(64)}`,
        files: new Map([
          [evidence.orderedFiles[0], Buffer.from(canonicalJson(claimsReceipt))],
          [evidence.orderedFiles[1], Buffer.from(canonicalJson(hostile))],
        ]),
      })
    ).toThrow(/exchange receipt/u);
    const temporalMutations = [
      {
        claims: { ...claimsReceipt, observedAt: "2026-08-30T15:59:59.000Z" },
        npm: npmReceipt,
      },
      {
        claims: claimsReceipt,
        npm: { ...npmReceipt, observedAt: "2026-08-30T15:59:59.000Z" },
      },
      {
        claims: claimsReceipt,
        npm: { ...npmReceipt, observedAt: "2026-08-30T16:11:00.000Z" },
      },
    ];
    for (const mutation of temporalMutations) {
      expect(() =>
        validateGithubArtifactEvidence({
          contract,
          definition,
          reference: artifactReference,
          sourceSha,
          candidateCoordinate,
          candidateManifestDigest: `sha256:${"5".repeat(64)}`,
          files: new Map([
            [evidence.orderedFiles[0], Buffer.from(canonicalJson(mutation.claims))],
            [evidence.orderedFiles[1], Buffer.from(canonicalJson(mutation.npm))],
          ]),
        })
      ).toThrow(/receipt times/u);
    }
  });
});
