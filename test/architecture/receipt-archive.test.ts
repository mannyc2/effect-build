import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = new URL("../../", import.meta.url);

describe("M5/D14 durable receipt archive", () => {
  it("is one manually dispatched protected writer and has no automatic privileged bridge", async () => {
    const source = await readFile(new URL(".github/workflows/receipt-archive.yml", root), "utf8");
    const workflow = parse(source) as {
      readonly on: Readonly<Record<string, unknown>>;
      readonly permissions: Readonly<Record<string, string>>;
      readonly jobs: Readonly<
        Record<string, {
          readonly environment: { readonly name: string };
          readonly permissions: Readonly<Record<string, string>>;
          readonly steps: readonly Readonly<Record<string, unknown>>[];
        }>
      >;
    };
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys((workflow.on.workflow_dispatch as { readonly inputs: Record<string, unknown> }).inputs)).toEqual(
      [
        "receiptClass",
        "producerRunId",
        "producerRunAttempt",
        "receiptArtifactId",
        "receiptArtifactDigest",
        "certifiedSourceSha",
      ],
    );
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["archive"]);
    const archiveJob = workflow.jobs.archive;
    if (archiveJob === undefined) throw new Error("receipt archive workflow has no archive job");
    expect(archiveJob.environment.name).toBe("receipt-archive");
    expect(archiveJob.permissions).toEqual({ actions: "read", contents: "write" });
    expect(source.match(/contents: write/gu)).toHaveLength(1);
    expect(source).not.toContain("workflow_run");
    expect(source).not.toContain("pull_request_target");
    expect(source).not.toContain("actions/checkout");
    expect(source).not.toContain("actions/download-artifact");
    expect(source).not.toMatch(/\bgit\s/u);
  });

  it("materializes only an externally approved validator and names every external control", async () => {
    const source = await readFile(new URL(".github/workflows/receipt-archive.yml", root), "utf8");
    for (
      const name of [
        "RECEIPT_ARCHIVE_VALIDATOR_BLOB_SHA",
        "RECEIPT_ARCHIVE_REPOSITORY_ID",
        "RECEIPT_ARCHIVE_ENVIRONMENT_ID",
        "RECEIPT_ARCHIVE_RULESET_ID",
        "RECEIPT_ARCHIVE_REVIEWER_ID",
        ...["CERTIFICATION", "RELEASE"].flatMap((receiptClass) => [
          `RECEIPT_ARCHIVE_${receiptClass}_WORKFLOW_ID`,
          `RECEIPT_ARCHIVE_${receiptClass}_WORKFLOW_PATH`,
          `RECEIPT_ARCHIVE_${receiptClass}_WORKFLOW_BLOB_SHA`,
          `RECEIPT_ARCHIVE_${receiptClass}_EVENT`,
          `RECEIPT_ARCHIVE_${receiptClass}_REF`,
          `RECEIPT_ARCHIVE_${receiptClass}_ACTOR_ID`,
          `RECEIPT_ARCHIVE_${receiptClass}_TRIGGERING_ACTOR_ID`,
          `RECEIPT_ARCHIVE_${receiptClass}_ARTIFACT_NAME_PREFIX`,
          `RECEIPT_ARCHIVE_${receiptClass}_EXPECTED_CONCLUSIONS_SHA256`,
          `RECEIPT_ARCHIVE_${receiptClass}_EXPECTED_INNER_RECEIPT_NAMES_SHA256`,
        ]),
      ]
    ) expect(source).toContain(name);
    expect(source).not.toContain("RECEIPT_ARCHIVE_PRODUCER_");
    expect(source).not.toContain("RECEIPT_ARCHIVE_EXPECTED_CONCLUSIONS_SHA256");
    expect(source).not.toContain("RECEIPT_ARCHIVE_EXPECTED_INNER_RECEIPT_NAMES_SHA256");
    expect(source).toContain("metadata.sha !== approvedBlob");
    expect(source).toContain('createHash("sha1").update(`blob ${bytes.length}\\0`)');
    expect(source).toContain("/tmp/effect-build-receipt-archive.mjs");
    expect(source).toContain("node /tmp/effect-build-receipt-archive.mjs");
  });

  it("keeps validation and Git database mutation deterministic and incapable of executing S", async () => {
    const source = await readFile(new URL("scripts/receipt-archive/archive.mjs", root), "utf8");
    expect(source).toContain('export const archiveRef = "refs/heads/evidence/receipts-v1"');
    expect(source).toContain("receipts/v1/certifications/");
    expect(source).toContain("receipts/v1/releases/");
    expect(source).toContain('"effect-build/release-activation-receipt@1"');
    expect(source).toContain('"effect-build/release-attempt-receipt@1"');
    expect(source).toContain('receipt.schema !== "effect-build/certification-receipt@1"');
    expect(source).toContain("readReceiptZip(wrapperBytes, expectedName)");
    expect(source).toContain("workflowFile.sha !== policy.workflowBlobSha");
    expect(source).toContain("artifact.workflow_run?.head_sha !== request.sourceSha");
    expect(source).toContain("updateRef(repository, archiveRefApiName, commit.sha, false)");
    expect(source).not.toContain("node:child_process");
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("force: true");
    expect(source).not.toMatch(/deleteRef|deleteFile|checkout|execFile|spawn\(/u);
  });
});
