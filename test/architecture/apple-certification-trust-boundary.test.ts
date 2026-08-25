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
          readonly steps?: ReadonlyArray<{
            readonly env?: Readonly<Record<string, string>>;
            readonly run?: string;
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
    for (const name of ["distribution", "clean-host", "certification-cells", "aggregate"]) {
      const job = workflow.jobs[name];
      expect(job?.environment).toBe("apple-certification");
      const execution = job?.steps?.find(({ run }) => run?.includes("scripts/apple-certification/") === true);
      expect(execution).toBeDefined();
      for (const variable of protectedVariables) {
        expect(execution?.env?.[variable]).toBe(`\${{ vars.${variable} }}`);
      }
    }
    expect(source).toContain("${{ runner.temp }}/apple-coordinate/*");
    expect(source).toContain("${{ runner.temp }}/prior-evidence");
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
    expect(receipt).toContain("appleCertification.protocols.request");
    expect(receipt).toContain("appleCertification.protocols.receipt");
    expect(receipt).toContain("appleCertification.protocols.evidence");
    expect(receipt).toContain("appleCertification.protocols.bundle");
    expect(priorEvidence).toContain("validateCertificationEvidenceCrossLinks(records)");
    expect(harness).toContain("reauthenticatePriorEvidenceSnapshot(authenticatedPriorEvidence)");
    expect(harness).toContain("priorEvidenceDirectory: authenticatedPriorEvidence.snapshotRoot");
    expect(`${harness}\n${receipt}`).not.toMatch(/apple-certification-(?:request|receipt|evidence|bundle)@1/u);
    expect(receipt).toContain("`${slug}.prior-evidence.json`");
    expect(receipt).toContain("const evidenceName = `${slug}.evidence.json`");
    expect(receipt).not.toContain(".evidence.bin");
  });
});
