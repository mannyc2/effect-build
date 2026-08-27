import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../..");

describe("Apple certification trust boundary", () => {
  it("hard-cuts every certifier lane to protected distinct digest authority", async () => {
    const source = await readFile(resolve(root, ".github/workflows/apple-certification.yml"), "utf8");
    const workflow = parse(source) as {
      readonly jobs: Readonly<
        Record<string, {
          readonly environment?: string;
          readonly needs?: string | ReadonlyArray<string>;
          readonly outputs?: Readonly<Record<string, string>>;
          readonly steps?: ReadonlyArray<{
            readonly env?: Readonly<Record<string, string>>;
            readonly id?: string;
            readonly run?: string;
            readonly uses?: string;
            readonly with?: Readonly<Record<string, string | boolean>>;
          }>;
        }>
      >;
    };
    const protectedVariables = [
      "EFFECT_BUILD_APPLE_CERTIFIER",
      "EFFECT_BUILD_APPLE_CERTIFIER_SHA256",
      "EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER",
      "EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER_SHA256",
    ];
    expect(workflow.jobs.admission?.outputs?.candidateSourceSha).toBe(
      "${{ steps.candidate_source.outputs.sourceSha }}",
    );
    expect(workflow.jobs.admission?.steps?.find(({ id }) => id === "candidate_source")?.run).toContain(
      "scripts/apple-certification/resolve-candidate-source.mjs",
    );
    for (const name of ["distribution", "clean-host", "certification-cells", "aggregate"]) {
      const job = workflow.jobs[name];
      expect(job?.environment).toBe("apple-certification");
      expect(Array.isArray(job?.needs) ? job.needs : [job?.needs]).toContain("admission");
      const checkout = job?.steps?.find(({ uses }) => uses?.startsWith("actions/checkout@") === true);
      expect(checkout?.with?.ref).toBe("${{ needs.admission.outputs.candidateSourceSha }}");
      const execution = job?.steps?.find(({ run }) => run?.includes("scripts/apple-certification/") === true);
      expect(execution).toBeDefined();
      expect(execution?.env?.AUTHENTICATED_CANDIDATE_SOURCE_SHA).toBe(
        "${{ needs.admission.outputs.candidateSourceSha }}",
      );
      for (const variable of protectedVariables) {
        expect(execution?.env?.[variable]).toBe(`\${{ vars.${variable} }}`);
      }
    }
    expect(source).toContain("${{ runner.temp }}/apple-coordinate/*");
    expect(source).toContain("${{ runner.temp }}/prior-evidence");
  });

  it("keeps candidate source identity distinct from the workflow control-plane head", async () => {
    const [harness, build, authenticate] = await Promise.all([
      readFile(resolve(root, "scripts/apple-certification/run-harness.mjs"), "utf8"),
      readFile(resolve(root, "scripts/apple-certification/build.mjs"), "utf8"),
      readFile(resolve(root, "scripts/apple-certification/authenticate.mjs"), "utf8"),
    ]);
    for (const source of [harness, build]) {
      expect(source).toContain('requireEnvironment("AUTHENTICATED_CANDIDATE_SOURCE_SHA")');
      expect(source).toContain('requireEnvironment("GITHUB_SHA")');
    }
    expect(build).toContain("certificationWorkflowRunHeadSha,");
    expect(authenticate).toContain("index.certificationWorkflowRunHeadSha !== subject.workflowRunHeadSha");
    expect(authenticate).toContain("artifact.workflow_run?.head_sha !== workflowRunHeadSha");
    expect(authenticate).not.toContain("run.head_sha !== candidate.descriptor.sourceSha");
  });

  it("executes only a reauthenticated snapshot and admits only canonical @2 evidence", async () => {
    const [harness, certifier, priorEvidence, receipt, policyBytes] = await Promise.all([
      readFile(resolve(root, "scripts/apple-certification/run-harness.mjs"), "utf8"),
      readFile(resolve(root, "scripts/apple-certification/certifier.mjs"), "utf8"),
      readFile(resolve(root, "scripts/apple-certification/prior-evidence.mjs"), "utf8"),
      readFile(resolve(root, "scripts/apple-certification/receipt.mjs"), "utf8"),
      readFile(resolve(root, "tooling/research-complete-policy.json"), "utf8"),
    ]);
    const protocols = JSON.parse(policyBytes).evidenceControl.appleCertification.protocols;
    const sourceIdentity = JSON.parse(policyBytes).evidenceControl.appleCertification.sourceIdentity;
    expect(harness).toContain("snapshotApprovedCertifier");
    expect(harness).toContain("reauthenticateCertifierSnapshot(certifier)");
    expect(harness).toContain("execute(certifier.snapshotPath");
    expect(harness).not.toMatch(/execute\(certifier\.path/u);
    expect(certifier).toContain("distribution/cell and clean-host certifier digests must be distinct");
    expect(protocols).toEqual({
      request: "effect-build/apple-certification-request@2",
      receipt: "effect-build/apple-certification-receipt@2",
      evidence: "effect-build/apple-certification-evidence@2",
      bundle: "effect-build/apple-certification-bundle@2",
      priorEvidenceManifest: "effect-build/apple-certification-prior-evidence@1",
      index: "effect-build/apple-certification-index@1",
    });
    expect(sourceIdentity).toEqual({
      candidateFields: ["sourceSha", "checkedOutSourceSha"],
      workflowControlPlaneField: "certificationWorkflowRunHeadSha",
      rule:
        "candidate-fields-equal-the-authenticated-candidate-source-while-the-workflow-control-plane-field-equals-the-authoritative-certification-run-and-artifact-head-and-may-differ-after-main-advances",
    });
    expect(receipt).toContain("appleCertification.protocols.request");
    expect(receipt).toContain("appleCertification.protocols.receipt");
    expect(receipt).toContain("appleCertification.protocols.evidence");
    expect(receipt).toContain("appleCertification.protocols.bundle");
    expect(priorEvidence).toContain("validateCertificationEvidenceCrossLinks(records)");
    expect(harness).toContain("reauthenticatePriorEvidenceSnapshot(authenticatedPriorEvidence)");
    expect(harness).toContain("priorEvidenceDirectory: authenticatedPriorEvidence.snapshotRoot");
    expect(harness).toContain("captureCandidateSnapshot");
    expect(harness).toContain("captureRequestSnapshot");
    const execution = harness.indexOf("await execute(certifier.snapshotPath");
    const outputAcceptance = harness.indexOf("const outputEntries", execution);
    for (
      const reauthentication of [
        "await reauthenticateCandidateSnapshot(candidateSnapshot)",
        "await reauthenticateRequestSnapshot(requestSnapshot)",
      ]
    ) {
      const before = harness.lastIndexOf(reauthentication, execution);
      const after = harness.indexOf(reauthentication, execution);
      expect(before, `${reauthentication} before execution`).toBeGreaterThan(-1);
      expect(after, `${reauthentication} after execution`).toBeGreaterThan(execution);
      expect(after, `${reauthentication} before output acceptance`).toBeLessThan(outputAcceptance);
    }
    expect(`${harness}\n${receipt}`).not.toMatch(/apple-certification-(?:request|receipt|evidence|bundle)@1/u);
    expect(receipt).toContain("`${slug}.prior-evidence.json`");
    expect(receipt).toContain("const evidenceName = `${slug}.evidence.json`");
    expect(receipt).not.toContain(".evidence.bin");
  });
});
