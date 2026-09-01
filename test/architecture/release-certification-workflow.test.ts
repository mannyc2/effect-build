import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const source = await readFile(resolve(root, ".github/workflows/release-certification.yml"), "utf8");
const stateSource = await readFile(resolve(root, "test/fixtures/release/release-state.mjs"), "utf8");
const workflow = parse(source) as {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions: Readonly<Record<string, string>>;
  readonly jobs: Readonly<
    Record<string, {
      readonly environment?: string;
      readonly outputs?: Readonly<Record<string, string>>;
      readonly permissions?: Readonly<Record<string, string>>;
      readonly steps?: ReadonlyArray<{
        readonly id?: string;
        readonly if?: string;
        readonly name?: string;
        readonly run?: string;
        readonly uses?: string;
        readonly with?: Readonly<Record<string, unknown>>;
      }>;
      readonly "timeout-minutes"?: number;
    }>
  >;
};
const contract = JSON.parse(
  await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
);
const embeddedNode = (body: string) => {
  const match = /<<'NODE'\n([\s\S]*?)\nNODE\n/u.exec(body);
  if (match?.[1] === undefined) throw new Error("workflow step has no embedded Node body");
  return match[1];
};

describe("fake-registry exact protected-body certification workflow", () => {
  it("executes the sealed exact body while retaining a distinct local-only qualification", () => {
    const job = workflow.jobs["fake-registry"];
    const body = job?.steps?.map(({ run }) => run ?? "").join("\n") ?? "";

    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(job?.permissions).toBeUndefined();
    expect(job?.environment).toBeUndefined();
    expect(job?.["timeout-minutes"]).toBe(60);
    expect(source).not.toContain("id-token: write");
    expect(source).not.toContain("GH_TOKEN");
    expect(source).not.toContain("NPM_TOKEN");
    expect(source).not.toMatch(/\bnpm\s+publish\b/u);
    expect(body).toContain("test/architecture/release-publisher-state-machine.test.ts");
    expect(body).not.toContain("--skip");
    expect(body).not.toContain("skipIf");
    expect(body).toContain("report.numPendingTests !== 0");
    expect(body).toContain("release.fakeRegistry.exactProtectedBody");
    expect(body).toContain("release.fakeRegistry.hypotheticalStateMachine");
    expect(body).toContain("release.fakeRegistry.localQualification");
    expect(body).toContain("release.fakeRegistry.exactProtectedBodyCertification");
    expect(body).toContain("two-purpose-hard-cut");
    expect(body).toContain("independent-oracle-compared-with-exact-protected-body");
    expect(body).toContain("observedRealMutationCount: exactPolicy.realBlockedMutationCount");
    expect(body).toContain("doesNotProve: hypotheticalPolicy.doesNotProve");
    expect(body).toContain("realRegistryMutation: false");
    expect(body).toContain("realNpmOrRegistryCredentialsUsed: false");
    expect(body).toContain("readinessAdmissible: qualification.readinessAdmissible");
    expect(body).toContain("hypotheticalFakeRegistryEvidenceLedger");
    expect(stateSource).toContain("exactProtectedBodyCertification.exactMutationLedger");
    expect(body).toContain("fake-registry-results.json");
    expect(body).toContain("digest: sha256Digest(resultsBytes)");
    expect(body).toContain("certificationChecks.length !== 3");
    expect(body).toContain("executes exact protected fake-registry state-machine case");
    expect(body).toContain("candidateManifestDigest: reference.manifestDigest");
    expect(body).toContain(
      "externalAuthenticationStatus: contract.releaseCertification.readiness.externalEvidenceAuthentication.status",
    );
    expect(body).toContain("candidateBinding: entry.candidateBinding");
    expect(body).toContain("JSON.stringify(Object.keys(receipt)) !== JSON.stringify(policy.receiptFields)");
  });

  it("keeps local qualification bytes off hosted artifacts and uploads only supported exact evidence", () => {
    const job = workflow.jobs["fake-registry"];
    const uploads = job?.steps?.filter(({ uses }) => uses?.startsWith("actions/upload-artifact@")) ?? [];
    const qualification = contract.releaseCertification.fakeRegistry.localQualification;
    const futureCertification = contract.releaseCertification.fakeRegistry.exactProtectedBodyCertification;
    const externalAuthenticationStatus = contract.releaseCertification.readiness.externalEvidenceAuthentication.status;
    const expectedDisposition = externalAuthenticationStatus === "blocked"
      ? "forbidden-while-external-authentication-blocked"
      : "required-on-supported-terminal-workflow-success";

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.id).toBe("exact-upload");
    expect(uploads[0]?.with?.name).toBe("${{ steps.exact-evidence.outputs.artifact-name }}");
    expect(uploads[0]?.with?.path).toBe("${{ runner.temp }}/fake-registry-exact-protected-body-certification");
    expect(uploads[0]?.if).toBe("steps.evidence.outputs.exact-artifact-allowed == 'true'");
    expect(uploads.some(({ with: options }) => options?.name === qualification.artifactName)).toBe(false);
    expect(
      uploads.some(({ with: options }) => options?.path === "${{ runner.temp }}/fake-registry-local-qualification"),
    )
      .toBe(false);
    expect(qualification).toMatchObject({
      artifactName: "effect-build-v0.6.0-fake-registry-local-qualification",
      protocol: "effect-build/fake-registry-local-qualification@1",
      readinessAdmissible: false,
      terminal: "local-qualification",
      workflowPath: ".github/workflows/release-certification.yml",
    });
    expect(futureCertification).toMatchObject({
      artifactDisposition: expectedDisposition,
      implementationStatus: "implemented",
      protocol: "effect-build/fake-registry-exact-protected-body-certification@1",
      status: externalAuthenticationStatus,
    });
    expect(["blocked", "supported"]).toContain(externalAuthenticationStatus);
    expect(source).toContain("${{ steps.exact-evidence.outputs.artifact-name }}");
    expect(source).toContain("${{ inputs.candidate_reference_json }}");
    expect(source).not.toContain("steps.evidence.outputs.artifact-name");
    expect(source).not.toContain("steps.evidence.outputs.retention-days");
  });

  it("maps exactly blocked and supported external authentication to exact artifact admission", () => {
    const job = workflow.jobs["fake-registry"];
    const builder = job?.steps?.find(({ id }) => id === "evidence");
    const body = builder?.run ?? "";

    expect(builder?.name).toBe("Build one canonical secret-free local qualification receipt");
    expect(body).toContain(
      "const externalAuthenticationStatus = release.readiness.externalEvidenceAuthentication.status;",
    );
    expect(body).toContain("const externalAuthenticationOutcomes = Object.freeze({");
    expect(body).toMatch(
      /blocked: Object\.freeze\(\{\s+status: "blocked",\s+artifactDisposition: "forbidden-while-external-authentication-blocked",\s+exactArtifactAllowed: false,\s+\}\)/u,
    );
    expect(body).toMatch(
      /supported: Object\.freeze\(\{\s+status: "supported",\s+artifactDisposition: "required-on-supported-terminal-workflow-success",\s+exactArtifactAllowed: true,\s+\}\)/u,
    );
    expect(body).toContain(
      "const externalAuthenticationOutcome = externalAuthenticationOutcomes[externalAuthenticationStatus];",
    );
    expect(body).toContain("externalAuthenticationOutcome === undefined");
    expect(body).toContain("futureCertification?.status !== externalAuthenticationOutcome.status");
    expect(body).toContain(
      "futureCertification?.artifactDisposition !== externalAuthenticationOutcome.artifactDisposition",
    );
    expect(body).toContain("`exact-artifact-allowed=${externalAuthenticationOutcome.exactArtifactAllowed}`");
    expect(body).toContain("qualification?.readinessAdmissible !== false");
    expect(body).not.toContain('futureCertification?.status !== "blocked"');
    expect(body).not.toContain(
      'futureCertification?.artifactDisposition !== "forbidden-while-external-authentication-blocked"',
    );
  });

  it("normalizes the upload digest only once and exposes the fully re-observed six-field coordinate", () => {
    const job = workflow.jobs["fake-registry"];
    const finalizer = job?.steps?.find(({ name }) =>
      name === "Canonicalize and re-observe fake-registry exact protected-body bytes"
    );
    const body = finalizer?.run ?? "";

    expect(finalizer).toBeDefined();
    expect(source.match(/UPLOAD_ACTION_BARE_DIGEST:/gu)).toHaveLength(1);
    expect(body).toContain('canonical_digest="sha256:$UPLOAD_ACTION_BARE_DIGEST"');
    expect(body).toContain('[[ "$API_ROOT" != "https://api.github.com"');
    expect(body).toContain("metadata.workflow_run?.head_branch !== expectedBranch");
    expect(body).toContain("metadata.workflow_run?.head_sha !== sourceSha");
    expect(body).toContain("run.run_attempt !== Number(runAttempt)");
    expect(body).toContain("run.path !== expectedWorkflowPath");
    expect(body).toContain('run.status !== "in_progress"');
    expect(body).toContain("zipDigest !== digest.slice");
    expect(body).toContain("scripts/release/post-upload-artifact-observation.mjs");
    expect(body).not.toContain("curl ");
    expect(body).toContain('echo "- workflow: \\`$EXPECTED_WORKFLOW\\`"');
    expect(body).toContain('echo "- artifactDigest: \\`$canonical_digest\\`"');
    expect(body).not.toContain("echo '- workflow:");
    expect(job?.outputs).toEqual({
      workflow: "${{ steps.fake-registry-coordinate.outputs.workflow }}",
      "source-sha": "${{ steps.fake-registry-coordinate.outputs.source-sha }}",
      "run-id": "${{ steps.fake-registry-coordinate.outputs.run-id }}",
      "run-attempt": "${{ steps.fake-registry-coordinate.outputs.run-attempt }}",
      "artifact-id": "${{ steps.fake-registry-coordinate.outputs.artifact-id }}",
      "artifact-digest": "${{ steps.fake-registry-coordinate.outputs.artifact-digest }}",
      "evidence-observed-at": "${{ steps.exact-evidence.outputs.evidence-observed-at }}",
    });
  });

  it("rejects a forged completed/success self-run before exposing the coordinate", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "effect-build-fake-cert-finalizer-"));
    try {
      const job = workflow.jobs["fake-registry"];
      const finalizer = job?.steps?.find(({ name }) =>
        name === "Canonicalize and re-observe fake-registry exact protected-body bytes"
      );
      const sourceSha = "1".repeat(40);
      const repository = "mannyc2/effect-build";
      const workflowPath = ".github/workflows/release-certification.yml";
      const workflowIdentity = `${repository}/${workflowPath}@refs/heads/main`;
      const zip = Buffer.from("authenticated fake-registry local qualification ZIP bytes");
      const digest = `sha256:${createHash("sha256").update(zip).digest("hex")}`;
      const metadataPath = resolve(directory, "artifact.json");
      const zipPath = resolve(directory, "artifact.zip");
      const runPath = resolve(directory, "run.json");
      await Promise.all([
        writeFile(zipPath, zip),
        writeFile(
          metadataPath,
          JSON.stringify({
            digest,
            expired: false,
            id: 456,
            name: "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
            workflow_run: {
              head_branch: "main",
              head_repository_id: 789,
              head_sha: sourceSha,
              id: 123,
              repository_id: 789,
            },
          }),
        ),
        writeFile(
          runPath,
          JSON.stringify({
            conclusion: "success",
            event: "workflow_dispatch",
            head_branch: "main",
            head_repository: { full_name: repository, id: 789 },
            head_sha: sourceSha,
            id: 123,
            path: workflowPath,
            repository: { full_name: repository, id: 789 },
            run_attempt: 1,
            status: "completed",
          }),
        ),
      ]);
      const result = spawnSync(process.execPath, [
        "--input-type=module",
        "-",
        metadataPath,
        zipPath,
        runPath,
        "456",
        digest,
        sourceSha,
        "123",
        "1",
        "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
        workflowIdentity,
        workflowPath,
        repository,
      ], {
        encoding: "utf8",
        input: embeddedNode(finalizer?.run ?? ""),
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("exact protected-body artifact coordinate or bytes changed");
      const currentRun = JSON.parse(await readFile(runPath, "utf8"));
      await writeFile(runPath, JSON.stringify({ ...currentRun, conclusion: null, status: "in_progress" }));
      const currentResult = spawnSync(process.execPath, [
        "--input-type=module",
        "-",
        metadataPath,
        zipPath,
        runPath,
        "456",
        digest,
        sourceSha,
        "123",
        "1",
        "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
        workflowIdentity,
        workflowPath,
        repository,
      ], {
        encoding: "utf8",
        input: embeddedNode(finalizer?.run ?? ""),
      });
      expect(currentResult.status, currentResult.stderr).toBe(0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
