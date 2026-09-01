import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// @ts-expect-error Apple certification workflow helpers are intentionally private Node script modules.
import * as fakeExecutor from "../../scripts/apple-certification/fake-executor.mjs";
// @ts-expect-error Apple certification workflow helpers are intentionally private Node script modules.
import * as workflowModel from "../../scripts/apple-certification/workflow.mjs";

const { a7SyntheticEvidenceCases, runSyntheticCleanHostCase, runSyntheticJournalCase } = fakeExecutor;
const { deriveAppleWorkflowPlan } = workflowModel;
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const workflowPath = resolve(root, ".github/workflows/apple-certification.yml");
const source = await readFile(workflowPath, "utf8");
const workflow = parse(source) as {
  readonly on: {
    readonly workflow_dispatch: {
      readonly inputs: Readonly<Record<string, { readonly required: boolean; readonly type: string }>>;
    };
  };
  readonly permissions: Readonly<Record<string, string>>;
  readonly concurrency: Readonly<Record<string, unknown>>;
  readonly jobs: Readonly<
    Record<string, {
      readonly environment?: string;
      readonly needs?: string;
      readonly permissions?: Readonly<Record<string, string>>;
      readonly steps?: ReadonlyArray<{ readonly name?: string; readonly run?: string; readonly uses?: string }>;
    }>
  >;
};
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.apple;
const plan = deriveAppleWorkflowPlan(contract);
const stage = (id: string) => plan.stages.find((entry: { readonly id: string }) => entry.id === id);
const jobBody = (id: string) => workflow.jobs[id]?.steps?.map(({ run }) => run ?? "").join("\n") ?? "";

describe("Apple certification workflow external-interface hard stop", () => {
  it("derives the full logical DAG and exact protected-stage allowlist from the generated canon", () => {
    expect(plan.workflowPath).toBe(policy.workflowPath);
    expect(plan.workflow).toBe(policy.workflow);
    expect(plan.coordinates).toEqual(policy.coordinates);
    expect(plan.evidenceDescriptorOrder).toEqual(policy.evidenceDescriptorOrder);
    expect(plan.hostedExecution).toEqual(policy.hostedExecution);
    expect(plan.stages.map(({ id }: { readonly id: string }) => id)).toEqual([
      "admission",
      "native",
      "paired-app",
      "sign-app",
      "distribution-pairs",
      "submit-product",
      "continue-notary",
      "clean-host",
      "verdict",
      "aggregate",
    ]);
    expect(plan.protectedStageIds).toEqual(policy.hostedExecution.protectedStageIds);
    expect(
      plan.stages.filter(({ protectedEnvironment }: { readonly protectedEnvironment: boolean }) => protectedEnvironment)
        .map(({ id }: { readonly id: string }) => id),
    ).toEqual(policy.hostedExecution.protectedStageIds);
    expect(stage("native")?.coordinates).toEqual(policy.coordinates.slice(0, 2));
    expect(stage("paired-app")?.coordinates).toEqual(["paired-app:bun", "paired-app:deno"]);
    expect(stage("sign-app")?.coordinates).toHaveLength(4);
    expect(stage("distribution-pairs")?.coordinates).toEqual(["paired-product:dmg", "paired-product:pkg"]);
    expect(stage("submit-product")?.coordinates).toEqual(stage("continue-notary")?.coordinates);
    expect(stage("submit-product")?.coordinates).toHaveLength(6);
    expect(stage("clean-host")?.coordinates).toHaveLength(6);
    expect(stage("verdict")?.coordinates).toEqual(policy.coordinates.slice(18));
    expect(stage("aggregate")?.needs).toEqual(["verdict"]);
    expect(plan.coordinates.some((coordinate: string) => /(?:public-zip|G-ZIP|node-sea)/iu.test(coordinate))).toBe(
      false,
    );
  });

  it("makes hosted success impossible before external interfaces are frozen", () => {
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(Object.keys(inputs).sort()).toEqual([
      "candidate_artifact_digest",
      "candidate_artifact_id",
      "candidate_run_attempt",
      "candidate_run_id",
      "source_sha",
    ]);
    expect(Object.values(inputs).every(({ required, type }) => required && type === "string")).toBe(true);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "effect-build-apple-certification-v0.6.0",
      "cancel-in-progress": false,
    });
    expect(Object.keys(workflow.jobs)).toEqual(["local-protocol-qualification", "external-interface-stop"]);
    expect(workflow.jobs["external-interface-stop"]?.needs).toBe("local-protocol-qualification");
    expect(jobBody("local-protocol-qualification")).toContain(
      "test/architecture/apple-certification-workflow.test.ts",
    );
    expect(jobBody("local-protocol-qualification")).toContain("packages/effect-build-apple test");
    expect(jobBody("local-protocol-qualification")).toContain("scripts/release/assert-current-main.mjs");
    expect(jobBody("external-interface-stop")).toContain("workflow.mjs --assert-hosted-ready");
    expect(Object.values(workflow.jobs).some(({ environment }) => environment !== undefined)).toBe(false);
    expect(source).not.toContain("id-token: write");
    expect(source).not.toContain("${{ secrets.");
    expect(source).not.toContain("${{ vars.");
    expect(source).not.toContain("actions/upload-artifact@");
    expect(source).not.toContain("actions/download-artifact@");
    expect(source).not.toContain(policy.artifact.name);
    expect(source).not.toContain("git ls-remote");
    expect(source).not.toMatch(/\bcurl\b/u);

    const stopped = spawnSync(process.execPath, [
      resolve(root, "scripts/apple-certification/workflow.mjs"),
      "--assert-hosted-ready",
    ], { encoding: "utf8" });
    expect(stopped.status).toBe(78);
    expect(stopped.stdout).toBe("");
    expect(stopped.stderr).toContain("external-interface-stop:");
    expect(plan.hostedExecution.status).toBe("blocked");
    expect(plan.hostedExecution.artifactDisposition).toBe("forbidden-while-blocked");
    for (const blocker of plan.hostedExecution.blockerIds) expect(stopped.stderr).toContain(blocker);
  });

  it("maps every A7 subordinate evidence ID to exact synthetic-only journal cases", () => {
    const subordinateEvidence =
      policy.coordinateRules.find(({ coordinate }: { readonly coordinate: string }) => coordinate === "A7").fieldValues
        .subordinateEvidence;
    expect(Object.keys(a7SyntheticEvidenceCases)).toEqual(subordinateEvidence);

    for (const evidenceId of subordinateEvidence) {
      const scenario = a7SyntheticEvidenceCases[evidenceId];
      const architectures = evidenceId.endsWith("both-architectures") ? ["arm64", "x64"] : ["arm64"];
      for (const architecture of architectures) {
        const result = runSyntheticJournalCase(scenario, { architecture });
        expect(result).toMatchObject({
          architecture,
          providerCalls: evidenceId === "interruption" ? 0 : 1,
          retryCalls: 0,
        });
        expect(result.protocol).toBe("effect-build/apple-synthetic-executor@1");
        expect(result.terminal).not.toBe("success");
        expect(result).not.toHaveProperty("verdict");
        expect(result).not.toHaveProperty("evidenceDigest");
      }
    }

    expect(runSyntheticJournalCase(a7SyntheticEvidenceCases["accepted-both-architectures"]).terminal).toBe(
      "synthetic-only-accepted",
    );
    expect(runSyntheticJournalCase(a7SyntheticEvidenceCases["pending-both-architectures"]).terminal).toBe(
      "synthetic-only-pending",
    );
    expect(runSyntheticJournalCase(a7SyntheticEvidenceCases["rejected-both-architectures"]).terminal).toBe(
      "synthetic-only-rejected",
    );
    expect(runSyntheticJournalCase(a7SyntheticEvidenceCases["info-and-log"]).observationCalls).toBe(2);
  });

  it("fake-journal cases prove canonical restart, every crash boundary, and exact no-retry control flow", () => {
    const complete = runSyntheticJournalCase("complete");
    const resumed = runSyntheticJournalCase("fresh-runner-resume");
    const intentAcknowledgementLoss = runSyntheticJournalCase("intent-acknowledgement-loss");
    const intentRereadMismatch = runSyntheticJournalCase("intent-reread-mismatch");
    const crash = runSyntheticJournalCase("crash-before-provider");
    const serviceFailure = runSyntheticJournalCase("service-failure");
    const responseLoss = runSyntheticJournalCase("provider-response-loss");
    const postProviderCrash = runSyntheticJournalCase("post-provider-pre-journal-crash");
    const acknowledgementLoss = runSyntheticJournalCase("submission-acknowledgement-loss");
    const rereadMismatch = runSyntheticJournalCase("submission-reread-mismatch");
    const interruption = runSyntheticJournalCase("interruption");

    expect(complete).toMatchObject({
      terminal: "synthetic-only-complete",
      providerCalls: 1,
      retryCalls: 0,
      journalAppends: 2,
      journalReads: 2,
    });
    expect(resumed.restartProof).toMatchObject({
      acknowledgementReinstantiated: true,
      journalReinstantiated: true,
      persistedBytesDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      recordObjectsReinstantiated: true,
    });
    expect(resumed.trace).toContain("fresh-runner-restored-canonical-persisted-bytes-without-shared-objects");
    expect(intentAcknowledgementLoss).toMatchObject({
      terminal: "journal-acknowledgement-stop",
      providerCalls: 0,
      retryCalls: 0,
      journalAppends: 1,
      journalReads: 0,
    });
    expect(intentRereadMismatch).toMatchObject({
      terminal: "journal-reread-stop",
      providerCalls: 0,
      retryCalls: 0,
      journalAppends: 1,
      journalReads: 1,
    });
    expect(crash).toMatchObject({ terminal: "injected-stop", providerCalls: 0, retryCalls: 0 });
    expect(interruption).toMatchObject({ terminal: "injected-stop", providerCalls: 0, retryCalls: 0 });
    expect(serviceFailure).toMatchObject({
      terminal: "unknown-outcome-stop",
      providerCalls: 1,
      retryCalls: 0,
      journalAppends: 1,
      journalReads: 1,
    });
    expect(responseLoss).toMatchObject({ terminal: "unknown-outcome-stop", providerCalls: 1, retryCalls: 0 });
    expect(postProviderCrash).toMatchObject({
      terminal: "unknown-outcome-stop",
      providerCalls: 1,
      retryCalls: 0,
      journalAppends: 1,
      journalReads: 1,
    });
    expect(acknowledgementLoss).toMatchObject({
      terminal: "unknown-outcome-stop",
      providerCalls: 1,
      retryCalls: 0,
      journalAppends: 2,
      journalReads: 1,
    });
    expect(rereadMismatch).toMatchObject({ terminal: "unknown-outcome-stop", providerCalls: 1, retryCalls: 0 });
    for (
      const result of [
        complete,
        resumed,
        intentAcknowledgementLoss,
        intentRereadMismatch,
        crash,
        serviceFailure,
        responseLoss,
        postProviderCrash,
        acknowledgementLoss,
        rereadMismatch,
        interruption,
      ]
    ) {
      expect(result.terminal).not.toBe("success");
      expect(result.retryCalls).toBe(0);
    }
  });

  it("fake clean hosts enforce exact preflight, quarantine, normal flow, and cleanup labels without receipts", () => {
    const rules = policy.coordinateRules.filter(({ category }: { readonly category: string }) =>
      category === "G-clean-host"
    );
    expect(rules).toHaveLength(6);
    for (const rule of rules) {
      const complete = runSyntheticCleanHostCase(rule, "complete");
      expect(complete).toMatchObject({ coordinate: rule.coordinate, terminal: "synthetic-only-complete" });
      expect(complete).not.toHaveProperty("verdict");
      expect(complete).not.toHaveProperty("evidenceDigest");
      expect(runSyntheticCleanHostCase(rule, "preexisting-state").terminal).toBe("blocked-before-acquisition");
      expect(runSyntheticCleanHostCase(rule, "quarantine-bypass").terminal).toBe(
        "blocked-forbidden-quarantine-action",
      );
      expect(runSyntheticCleanHostCase(rule, "cleanup-failure").terminal).toBe("blocked-incomplete-cleanup");
    }
  });
});
