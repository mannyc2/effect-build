import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error The canonical release helper is an intentionally unprotected Node module.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";
// @ts-expect-error The readiness protocol is an intentionally unprotected Node module.
import * as readiness from "../../scripts/release/readiness-protocol.mjs";

const { assertReadinessArtifactAllowed, validateGithubArtifactEvidence } = readiness;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.readiness;
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
  it("hard-cuts directly to exactly three hosted proofs and two aggregate files", async () => {
    expect(() => assertReadinessArtifactAllowed(contract)).not.toThrow();
    expect(policy.protocol).toBe("effect-build/release-readiness@3");
    expect(policy.bundleProtocol).toBe("effect-build/release-readiness-evidence-bundle@3");
    expect(policy.event).toBe("workflow_dispatch");
    expect(policy.orderedFiles).toEqual([policy.manifest, policy.evidenceBundle]);
    expect(policy.evidenceRoles.map(({ role, type }: { role: string; type: string }) => ({ role, type }))).toEqual([
      { role: "exact-main-ci", type: "githubRun" },
      { role: "fake-registry", type: "githubArtifact" },
      { role: "npm-oidc-certification", type: "githubArtifact" },
    ]);
    expect(Object.keys(policy.referenceShapes).sort()).toEqual(["candidate", "githubArtifact", "githubRun"]);
    expect(policy).not.toHaveProperty("externalEvidenceAuthentication");
    expect(policy).not.toHaveProperty("externalEvidenceIngress");
    expect(policy).not.toHaveProperty("externalEvidenceManifest");
    expect(policy).not.toHaveProperty("externalReceipts");

    const source = await readFile(resolve(root, "scripts/release/readiness-protocol.mjs"), "utf8");
    expect(source).not.toContain("externalObservation");
    expect(source).not.toContain("validateExternalReceipt");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(/\bspawnSync\s*\(/u);
    expect(source).not.toMatch(/\b(?:writeFile|appendFile|rename|unlink|rm)\w*\s*\(/u);
  });

  it("rejects policy mutations instead of accepting an activation branch", () => {
    const changed = structuredClone(contract);
    changed.releaseCertification.readiness.protocol = "effect-build/release-readiness@2";
    expect(() => assertReadinessArtifactAllowed(changed)).toThrow(/closed release-readiness policy/u);

    const extraRole = structuredClone(contract);
    extraRole.releaseCertification.readiness.evidenceRoles.push({
      ...extraRole.releaseCertification.readiness.evidenceRoles[0],
      role: "peer-proof",
    });
    expect(() => assertReadinessArtifactAllowed(extraRole)).toThrow(/ambiguous files, candidate, or evidence roles/u);
  });

  it("semantically admits only the candidate-bound fake protected-body receipt", () => {
    const release = contract.releaseCertification;
    const definition = policy.evidenceRoles.find(({ role }: { role: string }) => role === "fake-registry");
    const candidateCoordinate = coordinate(release.candidate.workflow, "10");
    const workflowCoordinate = coordinate(definition.workflow, "11");
    const certification = release.fakeRegistry.exactProtectedBodyCertification;
    expect(certification.protocol).toBe("effect-build/fake-registry-exact-protected-body-certification@2");
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
    const contractDigest = sha256Digest(canonicalJson(contract));
    const receipt = {
      schema: certification.protocol,
      sourceSha,
      observedAt: "2026-08-30T16:00:00.000Z",
      workflow: certification.workflow,
      contractDigest,
      readinessProtocol: policy.protocol,
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
    const reference = {
      coordinate: workflowCoordinate,
      evidenceObservedAt: receipt.observedAt,
      observedAt: "2026-08-30T16:01:00.000Z",
    };
    const validate = (value: unknown) =>
      validateGithubArtifactEvidence({
        contract,
        definition,
        reference,
        sourceSha,
        candidateCoordinate,
        candidateManifestDigest,
        contractDigest,
        files: new Map([[certification.orderedFiles[0], Buffer.from(canonicalJson(value))]]),
      });
    expect(validate(receipt)).toEqual(receipt);
    expect(() => validate({ ...receipt, readinessProtocol: "effect-build/release-readiness@2" }))
      .toThrow(/protected-body certification/u);
    expect(() => validate({ ...receipt, candidateManifestDigest: `sha256:${"0".repeat(64)}` }))
      .toThrow(/protected-body certification/u);
  });

  it("accepts ordered npm OIDC completion independently of one sampled JWT's exact iat and exp", () => {
    const release = contract.releaseCertification;
    const definition = policy.evidenceRoles.find(
      ({ role }: { role: string }) => role === "npm-oidc-certification",
    );
    const candidateCoordinate = coordinate(release.candidate.workflow, "20");
    const workflowCoordinate = coordinate(definition.workflow, "21");
    const evidence = release.npmOidcCertification.evidence;
    const authority = release.githubAuthority;
    const iat = Date.parse("2026-08-30T16:00:00.000Z") / 1_000;
    const claimsObservedAt = "2026-08-30T16:00:05.000Z";
    const npmObservedAt = "2026-08-30T16:10:05.000Z";
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
      observedAt: claimsObservedAt,
      claims,
      claimsDigest: sha256Digest(Buffer.from(canonicalJson(claims))),
      jwtValidation: {
        alg: "RS256",
        kid: "fixture",
        iat,
        nbf: iat - 1,
        exp: iat + 600,
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
      observedAt: npmObservedAt,
      packages,
      exchanges: packages.map((name) => ({ name, accepted: true, markerCount: 1 })),
      beforeRegistryStateDigest: stateDigest,
      afterRegistryStateDigest: stateDigest,
      sourceDigests,
      registryMutation: false,
      proves: evidence.receiptClaims.npmOidcExchangeAccepted.proves,
      doesNotProve: evidence.receiptClaims.npmOidcExchangeAccepted.doesNotProve,
    };
    const reference = {
      coordinate: workflowCoordinate,
      evidenceObservedAt: npmObservedAt,
      observedAt: "2026-08-30T16:10:06.000Z",
      aggregateObservedAt: Date.parse("2026-08-30T16:10:07.000Z"),
    };
    const validate = (claimsValue: any, npmValue: any, referenceValue = reference) =>
      validateGithubArtifactEvidence({
        contract,
        definition,
        reference: referenceValue,
        sourceSha,
        candidateCoordinate,
        candidateManifestDigest: `sha256:${"5".repeat(64)}`,
        files: new Map([
          [evidence.orderedFiles[0], Buffer.from(canonicalJson(claimsValue))],
          [evidence.orderedFiles[1], Buffer.from(canonicalJson(npmValue))],
        ]),
      });

    expect(claimsReceipt.observedAt).not.toBe(new Date(iat * 1_000).toISOString());
    expect(Date.parse(npmReceipt.observedAt)).toBeGreaterThan(claimsReceipt.jwtValidation.exp * 1_000);
    expect(validate(claimsReceipt, npmReceipt)).toEqual({ claims: claimsReceipt, npm: npmReceipt });

    expect(() =>
      validate(
        { ...claimsReceipt, observedAt: "2026-08-30T15:59:58.000Z" },
        npmReceipt,
      )
    ).toThrow(/receipt times/u);
    expect(() =>
      validate(
        claimsReceipt,
        { ...npmReceipt, observedAt: "2026-08-30T16:10:07.000Z" },
        {
          ...reference,
          evidenceObservedAt: "2026-08-30T16:10:07.000Z",
          observedAt: "2026-08-30T16:10:06.000Z",
        },
      )
    ).toThrow(/receipt times/u);
    expect(() =>
      validate(claimsReceipt, npmReceipt, {
        ...reference,
        aggregateObservedAt: Date.parse(npmObservedAt) + (definition.maximumAgeSeconds + 1) * 1_000,
      })
    ).toThrow(/receipt times/u);
  });
});
