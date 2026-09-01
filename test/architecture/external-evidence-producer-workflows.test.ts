import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const inputShaExpression = "$" + "{{ inputs.source_sha }}";
const exactSourceGuard = "github.ref == 'refs/heads/main' && inputs.source_sha == github.sha";
const activation = contract.releaseCertification.readiness.externalEvidenceAuthentication.signer.activation;

const cases = [
  {
    role: "npm-authority",
    path: ".github/workflows/npm-authority.yml",
    observerStop: "npm authority observer STOP: exact isolated Node and observer-source bootstrap not established",
    signerStop: "npm authority signer STOP: exact isolated Node and signer-source bootstrap not established",
  },
  {
    role: "github-release-governance",
    path: ".github/workflows/github-release-governance.yml",
    observerStop:
      "GitHub Release governance observer STOP: exact isolated Node and observer-source bootstrap not established",
    signerStop:
      "GitHub Release governance signer STOP: exact isolated Node and signer-source bootstrap not established",
  },
] as const;

const loadWorkflow = async (path: string) => {
  const source = await readFile(resolve(root, path), "utf8");
  return { source, workflow: parse(source) as any };
};

const assertBlockedWorkflowTopology = (
  workflow: any,
  role: (typeof cases)[number]["role"],
  observerStop: string,
  signerStop: string,
) => {
  if (!isDeepStrictEqual(workflow.permissions, activation.workflowPermissions)) {
    throw new Error("workflow-level permissions changed");
  }
  if (!isDeepStrictEqual(Object.keys(workflow.jobs), ["observe", "sign", "upload"])) {
    throw new Error("producer job topology changed");
  }
  const { observe, sign, upload } = workflow.jobs;
  for (const job of [observe, sign, upload]) {
    if (job.if !== exactSourceGuard || job.environment !== undefined || job.env !== undefined) {
      throw new Error("producer source guard or environment changed");
    }
  }
  if (
    observe.needs !== undefined
    || sign.needs !== activation.observerJob
    || upload.needs !== activation.signerJob
  ) throw new Error("producer job dependency changed");
  if (
    !isDeepStrictEqual(observe.permissions, activation.permissions.observer)
    || !isDeepStrictEqual(sign.permissions, activation.permissions.signer)
    || !isDeepStrictEqual(upload.permissions, activation.permissions.upload)
  ) throw new Error("blocked producer permissions changed");
  if (
    !isDeepStrictEqual(Object.keys(observe.outputs), activation.handoff.observerToSigner)
    || !isDeepStrictEqual(Object.keys(sign.outputs), activation.handoff.signerToUpload)
  ) throw new Error("producer handoff outputs changed");

  const assertStop = (job: any, id: string, marker: string) => {
    if (
      job.steps.length !== 1
      || job.steps[0].id !== id
      || job.steps[0].uses !== undefined
      || job.steps[0].env !== undefined
      || !job.steps[0].run.includes(marker)
      || job.steps[0].run.trimEnd().split("\n").at(-1)?.trim() !== "exit 1"
    ) throw new Error(`${id} bootstrap STOP changed`);
  };
  assertStop(observe, activation.observerJob + "r", observerStop);
  assertStop(sign, activation.signerJob + "er", signerStop);

  if (
    upload.steps.length !== 2
    || upload.steps[0].uses !== undefined
    || upload.steps[0].env?.BUNDLE_BASE64 !== "$" + "{{ needs.sign.outputs.bundle-base64 }}"
    || upload.steps[0].env?.REFERENCE_BASE64 !== "$" + "{{ needs.sign.outputs.reference-base64 }}"
    || !upload.steps[0].run.includes("node --input-type=module")
    || !upload.steps[0].run.includes('const referenceBytes = decode(process.env.REFERENCE_BASE64, "reference", 4096)')
    || !upload.steps[0].run.includes('const bundleBytes = decode(process.env.BUNDLE_BASE64, "bundle", 32768)')
    || !upload.steps[0].run.includes("bytes.length > maximumBytes")
    || upload.steps[0].run.includes("scripts/")
    || upload.steps[1].uses !== "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
    || upload.steps[1].with?.name
      !== `effect-build-v0.6.0-external-evidence-producer-${role}-${inputShaExpression}`
    || upload.steps[1].with?.["if-no-files-found"] !== "error"
    || upload.steps[1].with?.["retention-days"] !== 1
    || upload.steps[1].with?.["compression-level"] !== 0
  ) throw new Error("signed-byte-only upload boundary changed");

  const uses = Object.values(workflow.jobs).flatMap((job: any) =>
    job.steps.flatMap((step: any) => step.uses === undefined ? [] : [step.uses])
  );
  if (!isDeepStrictEqual(uses, ["actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"])) {
    throw new Error("third-party action escaped the upload-only boundary");
  }
};

describe("external evidence producer workflows", () => {
  it("freezes the inert observe-sign-upload hard cut without granting any job OIDC authority", async () => {
    expect(contract.releaseCertification.readiness.externalEvidenceAuthentication).toMatchObject({
      status: "blocked",
      artifactDisposition: "forbidden-while-blocked",
      blocker: "contract-pinned-external-producer-identities-and-isolated-observer-signer-bootstraps-not-established",
      producerIdentities: [],
    });
    expect(activation).toMatchObject({
      topology: "observe-sign-upload-three-job-hard-cut",
      workflowPermissions: {},
      permissions: { observer: {}, signer: {}, upload: {} },
      observerCredentialedThirdPartyActions: "forbidden",
      signerThirdPartyActions: "forbidden",
      hostedBootstrap: { status: "unqualified-stop" },
    });
    const modelSource = await readFile(resolve(root, "scripts/effect-build-contract/model.mjs"), "utf8");
    for (const { role, path, observerStop, signerStop } of cases) {
      const { source, workflow } = await loadWorkflow(path);
      expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(["source_sha"]);
      expect(workflow.concurrency).toEqual({
        group: ["effect-build-", role, "-", inputShaExpression].join(""),
        "cancel-in-progress": false,
      });
      assertBlockedWorkflowTopology(workflow, role, observerStop, signerStop);
      expect(source).not.toContain("$" + "{{ secrets.");
      expect(source).not.toContain("$" + "{{ github.token }}");
      expect(source).not.toMatch(/\b(?:NPM_ID_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN|SIGSTORE_ID_TOKEN)\b/u);
      expect(source).not.toMatch(/\bnpm\s+(?:publish|trust)\b/u);
      expect(source).not.toContain("gh api");
      expect(source).not.toContain("actions/checkout@");
      expect(source).not.toContain("actions/setup-node@");
      expect(source).not.toContain("oven-sh/setup-bun@");
      expect(source).not.toContain("actions/download-artifact@");
      expect(source).not.toContain("needs.sign.outputs.artifact-name");
      expect(modelSource).toContain('workflowPath: "' + path + '"');
      expect(modelSource).toContain('"' + role + '": {');
    }
  });

  it("rejects permission, action, dependency, path-handoff, naming, and STOP bypass mutations", async () => {
    const { workflow } = await loadWorkflow(cases[0].path);
    const hostileMutations: Array<(value: any) => void> = [
      (value) => value.permissions["id-token"] = "write",
      (value) => value.jobs.observe.permissions["id-token"] = "write",
      (value) => value.jobs.sign.permissions["id-token"] = "write",
      (value) => value.jobs.upload.permissions["id-token"] = "write",
      (value) => value.jobs.observe.steps.push({ uses: "actions/checkout@peer" }),
      (value) => value.jobs.sign.steps.push({ uses: "actions/setup-node@peer" }),
      (value) => value.jobs.upload.steps.unshift({ uses: "actions/checkout@peer" }),
      (value) => delete value.jobs.sign.needs,
      (value) => value.jobs.upload.needs = "observe",
      (value) => value.jobs.sign.env = { RECEIPT_PATH: "/tmp/receipt.json" },
      (value) => value.jobs.sign.outputs["artifact-name"] = "$" + "{{ steps.signer.outputs.artifact-name }}",
      (value) => value.jobs.upload.steps[1].with.name = "$" + "{{ needs.sign.outputs.artifact-name }}",
      (value) => value.jobs.observe.steps[0].run = "echo success",
      (value) => value.jobs.sign.steps[0].run = "echo success",
    ];
    for (const mutate of hostileMutations) {
      const changed = structuredClone(workflow);
      mutate(changed);
      expect(() => assertBlockedWorkflowTopology(changed, cases[0].role, cases[0].observerStop, cases[0].signerStop))
        .toThrow();
    }
  });

  it("materializes canonical handoff bytes only within both contract limits", async () => {
    const { workflow } = await loadWorkflow(cases[0].path);
    const run = workflow.jobs.upload.steps[0].run as string;
    const startMarker = "node --input-type=module <<'NODE'\n";
    const start = run.indexOf(startMarker);
    const end = run.lastIndexOf("\nNODE");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const materializer = run.slice(start + startMarker.length, end);
    const execute = async (reference: Buffer, bundle: Buffer) => {
      const outputDirectory = await mkdtemp(join(tmpdir(), "effect-build-signed-handoff-"));
      try {
        const result = spawnSync("node", ["--input-type=module"], {
          encoding: "utf8",
          env: {
            BUNDLE_BASE64: bundle.toString("base64"),
            LANG: "C.UTF-8",
            OUTPUT_DIRECTORY: outputDirectory,
            PATH: process.env.PATH,
            REFERENCE_BASE64: reference.toString("base64"),
          },
          input: materializer,
          maxBuffer: 1024 * 1024,
          shell: false,
          timeout: 5_000,
        });
        return { files: (await readdir(outputDirectory)).sort(), status: result.status };
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    };

    await expect(execute(Buffer.from("{}"), Buffer.from("{}"))).resolves.toEqual({
      files: ["external-evidence-reference.json", "sigstore-bundle.json"],
      status: 0,
    });
    await expect(execute(Buffer.alloc(4097), Buffer.from("{}"))).resolves.toEqual({ files: [], status: 1 });
    await expect(execute(Buffer.from("{}"), Buffer.alloc(32769))).resolves.toEqual({ files: [], status: 1 });
  });

  it("keeps observation implementations and the signer fail-closed behind the generated blocker", async () => {
    const governanceSource = await readFile(
      resolve(root, "scripts/release/produce-github-release-governance.mjs"),
      "utf8",
    );
    const signerSource = await readFile(resolve(root, "scripts/release/sigstore-dsse-signer.mjs"), "utf8");
    expect(governanceSource.indexOf("assertExternalEvidenceProducerEnabled"))
      .toBeLessThan(governanceSource.indexOf("assertGithubReleaseGovernanceObservationMechanismSupported"));
    expect(governanceSource).toContain("administrationReadBoundary.readJson(endpoint)");
    expect(governanceSource).not.toContain("process.env.GITHUB_TOKEN");
    expect(governanceSource).not.toContain("createGitHubReadOnlyBoundary");
    expect(governanceSource).not.toMatch(/\.(?:post|put|patch|deleteJson)\(/u);
    expect(signerSource).not.toContain("new CIContextProvider");
    expect(signerSource).not.toContain("process.env.SIGSTORE_ID_TOKEN");
    expect(signerSource).toContain("this.#authority = undefined");
    expect(signerSource).toContain("delete environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN");
    expect(signerSource).toContain("delete environment.ACTIONS_ID_TOKEN_REQUEST_URL");
    expect(signerSource).not.toContain("new FulcioSigner");
    expect(signerSource).not.toContain("new RekorWitness");
    expect(signerSource).toContain("new ExactFulcioSigner");
    expect(signerSource).toContain("new ExactRekorWitness");
    expect(signerSource).toContain("requestBoundedJsonNoRedirect");
    expect(signerSource).toContain("rootCertificates");
  });
});
