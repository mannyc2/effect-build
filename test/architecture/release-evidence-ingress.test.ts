import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { bundleFromJSON, bundleToJSON } from "@sigstore/bundle";

// @ts-expect-error The ingress helper is an intentionally unprotected Node release module.
import { prepareEvidenceIngress } from "../../scripts/release/evidence-ingress-protocol.mjs";
// @ts-expect-error The canonical protocol helper is an intentionally unprotected Node release module.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const readiness = contract.releaseCertification.readiness;
const ingress = readiness.externalEvidenceIngress;
const verifier = readiness.externalEvidenceAuthentication.verifier;
const sourceSha = "a".repeat(40);
const role = "npm-authority";
const definition = readiness.evidenceRoles.find((entry: { role: string }) => entry.role === role);

const bundleBytes = () => {
  const bundle = bundleToJSON(bundleFromJSON({
    mediaType: verifier.bundleMediaType,
    verificationMaterial: {
      certificate: { rawBytes: Buffer.from("fixture certificate").toString("base64") },
      tlogEntries: [{
        logIndex: "1",
        logId: { keyId: Buffer.alloc(32, 1).toString("base64") },
        kindVersion: { kind: "dsse", version: "0.0.1" },
        integratedTime: "1",
        inclusionPromise: { signedEntryTimestamp: Buffer.alloc(64, 2).toString("base64") },
        inclusionProof: {
          logIndex: "1",
          rootHash: Buffer.alloc(32, 3).toString("base64"),
          treeSize: "2",
          hashes: [Buffer.alloc(32, 4).toString("base64")],
          checkpoint: { envelope: "fixture checkpoint" },
        },
        canonicalizedBody: Buffer.from("{}").toString("base64"),
      }],
      timestampVerificationData: {},
    },
    dsseEnvelope: {
      payload: Buffer.from(canonicalJson({ fixture: true })).toString("base64"),
      payloadType: verifier.payloadType,
      signatures: [{ sig: Buffer.alloc(64, 5).toString("base64") }],
    },
  }));
  return Buffer.from(canonicalJson(bundle));
};

const fixture = () => {
  const bytes = bundleBytes();
  const reference = {
    role,
    type: definition.type,
    protocol: definition.protocol,
    identity: readiness.externalReceipts.npmAuthority.identity,
    sourceSha,
    terminal: definition.terminal,
    observedAt: "2026-08-30T16:00:00.000Z",
    expiresAt: "2026-08-30T19:00:00.000Z",
    bytes: `${bytes.byteLength}`,
    digest: sha256Digest(bytes),
  };
  return {
    bytes,
    reference,
    referenceJson: canonicalJson(reference).trimEnd(),
    bundleBase64: bytes.toString("base64"),
  };
};

describe("external release-evidence ingress", () => {
  it("freezes one bounded transport-only dispatch and authenticated artifact finalizer", async () => {
    const source = await readFile(resolve(root, ingress.workflowPath), "utf8");
    const workflow = parse(source) as any;
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      ingress.dispatch.sourceInput,
      ingress.dispatch.roleInput,
      ingress.dispatch.referenceInput,
      ingress.dispatch.bundleInput,
    ]);
    expect(workflow.on.workflow_dispatch.inputs.role.options).toEqual(ingress.roles);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    const steps = workflow.jobs.ingress.steps;
    const prepare = steps.find(({ id }: { id?: string }) => id === "prepare");
    const upload = steps.find(({ id }: { id?: string }) => id === "upload");
    const coordinate = steps.find(({ id }: { id?: string }) => id === "coordinate");
    expect(prepare.run).toContain("scripts/release/evidence-ingress-protocol.mjs");
    expect(upload.uses).toBe("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(upload.with.path).toBe("${{ runner.temp }}/release-evidence-ingress");
    expect(coordinate.run).toContain("createGitHubReadOnlyBoundary");
    expect(coordinate.run).toContain("github.readArtifactZip");
    expect(coordinate.run).toContain("release.readiness.zipExtraction.maximumArchiveBytes");
    expect(coordinate.run).toContain("terminalMain");
    expect(source).not.toContain("id-token: write");
    expect(source).not.toMatch(/\bnpm\s+publish\b/u);
    expect(source).not.toContain("--location");
    expect(
      ingress.dispatch.maximumReferenceCharacters
        + ingress.dispatch.maximumEncodedBundleCharacters
        + sourceSha.length
        + Math.max(...ingress.roles.map((value: string) => value.length))
        + 1_024,
    ).toBeLessThan(ingress.dispatch.maximumTotalPayloadCharacters);
  });

  it("admits only canonical role/source/reference/bundle bytes without authenticating their producer", () => {
    const value = fixture();
    const result = prepareEvidenceIngress({
      contract,
      sourceSha,
      role,
      referenceJson: value.referenceJson,
      bundleBase64: value.bundleBase64,
    });
    expect(result.reference).toEqual(value.reference);
    expect(result.bundleBytes).toEqual(value.bytes);
    expect(result.artifactName).toBe(
      ingress.artifact.nameTemplate.replace("<role>", role).replace("<sourceSha>", sourceSha),
    );
    expect(ingress.authority).toContain("transport-only");
  });

  it("rejects reference, role, digest, canonicalization, and dispatch-size mutations", () => {
    const base = fixture();
    const cases = [
      { role: "peer", referenceJson: base.referenceJson, bundleBase64: base.bundleBase64 },
      { role, referenceJson: `${base.referenceJson} `, bundleBase64: base.bundleBase64 },
      {
        role,
        referenceJson: canonicalJson({ ...base.reference, digest: `sha256:${"0".repeat(64)}` }).trimEnd(),
        bundleBase64: base.bundleBase64,
      },
      { role, referenceJson: base.referenceJson, bundleBase64: `${base.bundleBase64}=` },
      {
        role,
        referenceJson: "x".repeat(ingress.dispatch.maximumReferenceCharacters + 1),
        bundleBase64: base.bundleBase64,
      },
    ];
    for (const value of cases) {
      expect(() => prepareEvidenceIngress({ contract, sourceSha, ...value })).toThrow();
    }
  });
});
