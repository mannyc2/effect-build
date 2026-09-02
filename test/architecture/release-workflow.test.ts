import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowStep {
  readonly id?: string;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly environment?: string;
  readonly if?: string;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly "runs-on"?: string;
  readonly steps?: ReadonlyArray<WorkflowStep>;
  readonly "timeout-minutes"?: number;
}

interface ReleaseWorkflow {
  readonly on: {
    readonly workflow_dispatch?: {
      readonly inputs?: Readonly<
        Record<string, {
          readonly options?: ReadonlyArray<string>;
          readonly required?: boolean;
        }>
      >;
    };
  };
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: boolean };
  readonly permissions?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface CombinedContract {
  readonly npmRegistryBoundary: {
    readonly publicationAdmission: {
      readonly packages: ReadonlyArray<string>;
      readonly target: { readonly version: string };
    };
  };
  readonly releaseCertification: {
    readonly candidate: {
      readonly protocol: string;
    };
    readonly githubAuthority: {
      readonly environment: string;
    };
    readonly modes: ReadonlyArray<string>;
    readonly npmOidcCertification: {
      readonly evidence: {
        readonly orderedFiles: ReadonlyArray<string>;
      };
    };
    readonly readiness: {
      readonly bundleFraming: string;
    };
  };
}

const workflowPath = resolve(root, ".github/workflows/release.yml");
const source = await readFile(workflowPath, "utf8");
const hypotheticalPublisherSource = await readFile(
  resolve(root, "test/fixtures/release/hypothetical-publisher.mjs"),
  "utf8",
);
const workflow = parse(source) as ReleaseWorkflow;
const contract = JSON.parse(
  await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
) as CombinedContract;
const steps = (job: WorkflowJob | undefined) => job?.steps ?? [];
const script = (job: WorkflowJob | undefined) => steps(job).map(({ run }) => run ?? "").join("\n");
const named = (job: WorkflowJob | undefined, name: string) => steps(job).filter((step) => step.name === name);
const embeddedNode = (body: string) => {
  const matches = [...body.matchAll(/<<'NODE'\n([\s\S]*?)\n\s*NODE(?:\n|$)/gu)];
  const source = matches.at(-1)?.[1];
  if (source === undefined) throw new Error("workflow step has no embedded Node body");
  return source;
};

describe("release workflow hard cut", () => {
  it("admits exactly three modes and keeps preparation separate from one protected npm job", () => {
    const inputs = workflow.on.workflow_dispatch?.inputs ?? {};
    const prepare = workflow.jobs["prepare-candidate"];
    const protectedJob = workflow.jobs["protected-npm"];

    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(inputs.mode?.options).toEqual(contract.releaseCertification.modes);
    expect(inputs.source_sha?.required).toBe(true);
    expect(Object.keys(inputs).sort()).toEqual([
      "candidate_artifact_digest",
      "candidate_artifact_id",
      "candidate_run_attempt",
      "candidate_run_id",
      "mode",
      "readiness_artifact_digest",
      "readiness_artifact_id",
      "readiness_run_attempt",
      "readiness_run_id",
      "source_sha",
    ]);
    expect(workflow.concurrency).toEqual({ group: "effect-build-npm-release", "cancel-in-progress": false });
    expect(prepare?.if).toBe("inputs.mode == 'prepare-exact-sha'");
    expect(prepare?.environment).toBeUndefined();
    expect(prepare?.permissions).toEqual({ actions: "read", contents: "read" });
    expect(prepare?.outputs?.["artifact-digest"]).toBe(
      "${{ steps.candidate-coordinate.outputs.artifact-digest }}",
    );
    expect(prepare?.outputs?.["artifact-digest"]).not.toContain("steps.upload.outputs");
    expect(prepare?.outputs).toEqual({
      workflow: "${{ steps.candidate-coordinate.outputs.workflow }}",
      "source-sha": "${{ steps.candidate-coordinate.outputs.source-sha }}",
      "run-id": "${{ steps.candidate-coordinate.outputs.run-id }}",
      "run-attempt": "${{ steps.candidate-coordinate.outputs.run-attempt }}",
      "artifact-digest": "${{ steps.candidate-coordinate.outputs.artifact-digest }}",
      "artifact-id": "${{ steps.candidate-coordinate.outputs.artifact-id }}",
    });
    expect(protectedJob?.if).toBe(
      "inputs.mode == 'certify-exact-sha' || inputs.mode == 'publish-certified-bytes'",
    );
    expect(protectedJob?.environment).toBe(contract.releaseCertification.githubAuthority.environment);
    expect(protectedJob?.permissions).toEqual({ actions: "read", contents: "read", "id-token": "write" });
    expect(protectedJob?.["runs-on"]).toBe("ubuntu-24.04");
    expect(protectedJob?.["timeout-minutes"]).toBe(45);
    expect(protectedJob?.outputs).toEqual({
      "certification-workflow": "${{ steps.certification-coordinate.outputs.workflow }}",
      "certification-source-sha": "${{ steps.certification-coordinate.outputs.source-sha }}",
      "certification-run-id": "${{ steps.certification-coordinate.outputs.run-id }}",
      "certification-run-attempt": "${{ steps.certification-coordinate.outputs.run-attempt }}",
      "certification-artifact-digest": "${{ steps.certification-coordinate.outputs.artifact-digest }}",
      "certification-artifact-id": "${{ steps.certification-coordinate.outputs.artifact-id }}",
    });
    expect(named(protectedJob, "Re-observe protected authority after environment approval")).toHaveLength(1);
    expect(named(protectedJob, "Adopt, compare, and publish only certified bytes")).toHaveLength(1);
    expect(steps(protectedJob).filter(({ uses }) => uses?.startsWith("actions/checkout@"))).toEqual([]);
    expect(steps(protectedJob).filter(({ uses }) => uses?.startsWith("oven-sh/setup-bun@"))).toEqual([]);
    expect(script(protectedJob)).not.toMatch(/\b(?:node|bun)\s+scripts\/release\//u);
    expect(script(protectedJob)).not.toMatch(/\bimport\s*\(\s*["']scripts\/release\//u);
    expect(script(protectedJob)).not.toContain("bun install");
  });

  it("re-observes GITHUB_TOKEN-visible authority and derives runtime auth rejection from raw contract bytes", () => {
    const dispatch = named(workflow.jobs["admit-dispatch"], "Admit only one exact fail-closed protocol mode")[0]
      ?.run ?? "";
    const protectedJob = workflow.jobs["protected-npm"];
    const reauthorization = named(
      protectedJob,
      "Re-observe protected authority after environment approval",
    )[0]?.run ?? "";
    const publisher = named(protectedJob, "Adopt, compare, and publish only certified bytes")[0]?.run ?? "";

    for (
      const endpoint of [
        "environments/npm/deployment-branch-policies",
        "actions/oidc/customization/sub",
      ]
    ) expect(reauthorization).toContain(endpoint);
    expect(reauthorization).not.toContain("actions/secrets");
    expect(reauthorization).not.toContain("actions/variables");
    expect(reauthorization).not.toContain("environments/npm/secrets");
    expect(reauthorization).not.toContain("environments/npm/variables");
    const forbiddenContextAuth = /(?:secrets|vars)\s*(?:\.\s*|\[\s*["'])\s*(?:NPM|NODE_AUTH|SIGSTORE)/u;
    expect(source).not.toMatch(forbiddenContextAuth);
    expect(reauthorization).toContain("npmOidcCertification?.forbiddenEnvironmentNames");
    expect(reauthorization).toContain('if [[ -n "${!forbidden+x}" ]]');
    expect(reauthorization).toContain("authority.oidcSubjectPolicy");
    expect(reauthorization).toContain("authority.reviewer");
    expect(reauthorization).toContain("repository.visibility !== authority.repositoryVisibility");
    expect(publisher).toContain("application/vnd.github.raw+json");
    expect(publisher).toContain("{ encoding: null }");
    expect(publisher).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(publisher).toContain("const authority = policy?.githubAuthority");
    expect(publisher).toContain("authority.expectedEnvironmentSubject");
    expect(publisher).toContain('Object.hasOwn(candidate, "registry")');
    expect(publisher).not.toContain("candidate.registry");
    expect(dispatch).toContain('import { request as httpsRequest } from "node:https"');
    expect(dispatch).toContain('import { rootCertificates } from "node:tls"');
    expect(dispatch).toContain("metadataTotalTimeoutMilliseconds");
    expect(dispatch).not.toContain("curl ");
    expect(reauthorization.match(/\bcurl\b/gu)).toHaveLength(1);
    expect(reauthorization.indexOf('if [[ -n "${EFFECT_BUILD_FAKE_EXECUTION_ROOT+x}" ]]')).toBeLessThan(
      reauthorization.indexOf("curl"),
    );
    expect(reauthorization.indexOf("curl")).toBeLessThan(reauthorization.indexOf("else\n"));
    expect(reauthorization).toContain('import { request as httpsRequest } from "node:https"');
    expect(reauthorization).toContain('import { rootCertificates } from "node:tls"');
    expect(reauthorization).toContain("metadataTotalTimeoutMilliseconds");
    expect(reauthorization).toContain("ca: rootCertificates");
    expect(publisher.match(/command\("curl"/gu)).toHaveLength(3);
    expect(publisher).toContain("if (fixtureTransportSelected)");
    expect(publisher).toContain("inlineGithubTransport.artifactTotalTimeoutMilliseconds");
    expect(publisher).toContain("transport.request.oidcSequenceTotalTimeoutMilliseconds");
    expect(publisher).toContain("requestInactivityTimeoutMilliseconds");
    expect(publisher).toContain('import { performance } from "node:perf_hooks"');
    expect(source).not.toMatch(
      /(?:deadline\s*-\s*Date\.now\(\)|Date\.now\(\)\s*\+\s*[^\n;]*TimeoutMilliseconds)/u,
    );
    expect(publisher).toContain("ca: rootCertificates");
  });

  it("authenticates candidate bytes and emits only the two generated secret-free certification receipts", () => {
    const prepare = workflow.jobs["prepare-candidate"];
    const protectedJob = workflow.jobs["protected-npm"];
    const publisher = named(protectedJob, "Adopt, compare, and publish only certified bytes")[0]?.run ?? "";
    const upload = steps(protectedJob).find(({ id }) => id === "upload-certification");

    expect(contract.releaseCertification.candidate.protocol).toBe("effect-build/npm-release-candidate@2");
    expect(source).toContain("UPLOAD_ACTION_BARE_DIGEST: ${{ steps.upload.outputs.artifact-digest }}");
    expect(source).toContain('canonical_digest="sha256:$UPLOAD_ACTION_BARE_DIGEST"');
    expect(source.match(/UPLOAD_ACTION_BARE_DIGEST:/gu)).toHaveLength(2);
    expect(script(prepare)).toContain("run.run_attempt !== Number(runAttempt)");
    expect(script(prepare)).toContain("metadata.workflow_run?.head_sha !== sourceSha");
    expect(script(prepare)).toContain('run.status !== "in_progress"');
    expect(script(prepare)).toContain("run.conclusion !== null");
    expect(publisher).toContain("!status.isFile()");
    expect(publisher).toContain("status.nlink !== 1");
    expect(publisher).toContain("manifest.private !== undefined");
    expect(publisher).toContain('!isDeepStrictEqual(manifest.publishConfig, { access: "public", provenance: true })');
    expect(publisher).toContain("entry.manifestDigest !== `sha256:");
    expect(publisher).toContain("Object.keys(contract.publicApiProjection.packages).sort()");
    expect(publisher).toContain('policy.publicAdmission.packageSource !== "publicApiProjection.packages"');
    expect(publisher).toContain("markerCount: 1");
    expect(publisher).toContain("beforeRegistryStateDigest");
    expect(publisher).toContain("afterRegistryStateDigest");
    expect(publisher).toContain("evidencePolicy.receiptSchemas.githubOidcClaims");
    expect(upload?.with?.name).toBe("${{ steps.publisher.outputs.artifact-name }}");
    expect(upload?.with?.path).toBe("${{ runner.temp }}/npm-oidc-certification");
    expect(script(protectedJob)).toContain('run.status !== "in_progress"');
    expect(script(protectedJob)).toContain("run.conclusion !== null");
    expect(contract.releaseCertification.npmOidcCertification.evidence.orderedFiles).toEqual([
      "github-oidc-claims.json",
      "npm-oidc-exchange-accepted.json",
    ]);
  });

  it("rejects forged terminal self-run metadata at both upload finalization boundaries", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "effect-build-upload-finalizer-"));
    try {
      const sourceSha = "1".repeat(40);
      const runId = "123";
      const runAttempt = "1";
      const artifactId = "456";
      const zip = Buffer.from("authenticated upload artifact ZIP bytes");
      const digest = `sha256:${createHash("sha256").update(zip).digest("hex")}`;
      const metadataPath = resolve(directory, "artifact.json");
      const zipPath = resolve(directory, "artifact.zip");
      const runPath = resolve(directory, "run.json");
      const metadata = {
        digest,
        expired: false,
        id: Number(artifactId),
        workflow_run: {
          head_branch: "main",
          head_repository_id: 789,
          head_sha: sourceSha,
          id: Number(runId),
          repository_id: 789,
        },
      };
      const forgedTerminalRun = {
        conclusion: "success",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: sourceSha,
        id: Number(runId),
        path: ".github/workflows/release.yml",
        repository: { full_name: "mannyc2/effect-build", id: 789 },
        run_attempt: Number(runAttempt),
        status: "completed",
        head_repository: { full_name: "mannyc2/effect-build", id: 789 },
      };
      await Promise.all([
        writeFile(zipPath, zip),
        writeFile(runPath, JSON.stringify(forgedTerminalRun)),
      ]);
      const boundaries = [
        {
          args: [
            metadataPath,
            zipPath,
            runPath,
            artifactId,
            digest,
            sourceSha,
            runId,
            runAttempt,
            `npm-release-candidate-${sourceSha}`,
            "workflow_dispatch",
            "main",
            "mannyc2/effect-build",
            "789",
            "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
            ".github/workflows/release.yml",
          ],
          artifactName: `npm-release-candidate-${sourceSha}`,
          name: "Canonicalize and verify the upload-action artifact digest boundary",
        },
        {
          args: [
            metadataPath,
            zipPath,
            runPath,
            artifactId,
            digest,
            sourceSha,
            runId,
            runAttempt,
            "effect-build-v0.6.0-npm-oidc-certification",
            "workflow_dispatch",
            "main",
            "mannyc2/effect-build",
            "789",
            "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
            ".github/workflows/release.yml",
          ],
          artifactName: "effect-build-v0.6.0-npm-oidc-certification",
          name: "Canonicalize and re-observe certification evidence bytes",
        },
      ];
      for (const boundary of boundaries) {
        await Promise.all([
          writeFile(metadataPath, JSON.stringify({ ...metadata, name: boundary.artifactName })),
          writeFile(runPath, JSON.stringify(forgedTerminalRun)),
        ]);
        const step = Object.values(workflow.jobs)
          .flatMap(({ steps }) => steps ?? [])
          .find(({ name }) => name === boundary.name);
        const result = spawnSync(process.execPath, ["--input-type=module", "-", ...boundary.args], {
          encoding: "utf8",
          input: embeddedNode(step?.run ?? ""),
        });
        expect(result.status, boundary.name).not.toBe(0);
        expect(result.stderr, boundary.name).toContain("changed");
        await writeFile(runPath, JSON.stringify({ ...forgedTerminalRun, conclusion: null, status: "in_progress" }));
        const currentResult = spawnSync(process.execPath, ["--input-type=module", "-", ...boundary.args], {
          encoding: "utf8",
          input: embeddedNode(step?.run ?? ""),
        });
        expect(currentResult.status, `${boundary.name}: ${currentResult.stderr}`).toBe(0);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps certify dry-run-only and requires three-proof semantic readiness for real publication", () => {
    const publisher = named(
      workflow.jobs["protected-npm"],
      "Adopt, compare, and publish only certified bytes",
    )[0]?.run ?? "";

    expect(publisher.match(/"publish", entry\.tarball/gu)).toHaveLength(2);
    expect(publisher).toContain('if (mode === "certify-exact-sha")');
    expect(publisher).toContain('"--dry-run"');
    expect(publisher).not.toContain("Sole real npm publish mutation site");
    expect(publisher).toContain("npm publish outcome is unknown");
    expect(publisher).not.toContain("npm dist-tag");
    expect(publisher).not.toContain("npm unpublish");
    expect(publisher).toContain("const readinessCoordinate");
    expect(publisher).toContain("release readiness is not bound to the dispatched candidate bytes");
    expect(publisher).toContain("release readiness evidence bundle has trailing or additional frames");
    expect(publisher).toContain("real publication has no authenticated readiness npm baseline");
    expect(publisher).toContain('readiness?.protocol !== "effect-build/release-readiness@3"');
    expect(publisher).toContain('readiness?.bundleProtocol !== "effect-build/release-readiness-evidence-bundle@3"');
    expect(publisher).toContain('readiness?.event !== "workflow_dispatch"');
    expect(publisher).toContain("authenticated contract has an unknown three-proof readiness policy");
    expect(publisher).toContain('fakePurpose.protocol !== "effect-build/fake-registry-exact-protected-body-purpose@2"');
    expect(publisher).not.toContain("externalAuthentication");
    expect(publisher.indexOf('if (["certify-exact-sha", "publish-certified-bytes"].includes(mode))')).toBeLessThan(
      publisher.indexOf("const candidateCoordinate"),
    );
    expect(publisher.indexOf("const readinessCoordinate")).toBeLessThan(
      publisher.indexOf("const npmEnvironmentNames"),
    );
    expect(hypotheticalPublisherSource).toContain("runHypotheticalPublisher");
    expect(hypotheticalPublisherSource).not.toMatch(/\bnpm\s+(?:publish|dist-tag|unpublish)\b/u);
    expect(publisher).toContain("credentialFreeChildEnvironment");
    expect(publisher).toContain("npmOidcEnvironment");
    expect(publisher).toContain("credential reached provenance verifier");
    expect(publisher).toContain("expectedAttestationUrl");
    expect(publisher).toContain('name: "@sigstore/verify"');
    expect(publisher).toContain('version: "3.1.0"');
    expect(publisher).toContain("new verifyClient.Verifier(verifyClient.toTrustMaterial(trustedRoot)");
    expect(publisher).toContain("publicationTrustedRootPath");
    expect(publisher).toContain("if (fakePurposeSelected)");
    expect(publisher).toContain("resolve(exactFakeRepositoryRoot, trustedRootPolicy.path)");
    expect(publisher).toContain('if (mode === "publish-certified-bytes" && !fakePurposeSelected)');
    expect(publisher).toContain("githubDocument(");
    expect(publisher).toContain("`${api}/contents/${trustedRootPolicy.path}?ref=${sourceSha}`");
    expect(publisher).toContain("published provenance has no exact contract-bound trusted root");
    expect(publisher).toContain("network access is forbidden in provenance verifier");
    expect(publisher).toContain("Resolver?.prototype, resolverMethods");
    expect(publisher).not.toContain("node_modules/sigstore/dist/index.js");
    expect(publisher).not.toMatch(/\bsigstore\.verify\s*\(/u);
  });

  it("keeps every other workflow free of real npm registry mutation authority", async () => {
    const workflowRoot = resolve(root, ".github/workflows");
    const names = (await readdir(workflowRoot)).filter((name) => /\.ya?ml$/u.test(name)).sort();
    const mutation = /\bnpm\s+(?:access|deprecate|dist-tag|owner|stage|token|unpublish|login)\b/gu;
    for (const name of names) {
      const workflowSource = await readFile(resolve(workflowRoot, name), "utf8");
      expect(workflowSource.match(mutation) ?? [], name).toEqual([]);
      if (name !== "release.yml") expect(workflowSource).not.toMatch(/\bnpm\s+publish\b/u);
    }
    expect(contract.npmRegistryBoundary.publicationAdmission.packages).toHaveLength(11);
    expect(contract.npmRegistryBoundary.publicationAdmission.target.version).toBe("0.6.0");
  });

  it("parses every workflow with duplicate mapping keys forbidden", async () => {
    const workflowRoot = resolve(root, ".github/workflows");
    const names = (await readdir(workflowRoot)).filter((name) => /\.ya?ml$/u.test(name)).sort();
    for (const name of names) {
      const document = parseDocument(await readFile(resolve(workflowRoot, name), "utf8"), {
        uniqueKeys: true,
      });
      expect(document.errors, name).toEqual([]);
    }
  });
});
