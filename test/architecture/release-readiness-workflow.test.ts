import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// @ts-expect-error The readiness collector is an intentionally unprotected Node script module.
import * as collector from "../../scripts/release/collect-release-readiness.mjs";
// @ts-expect-error The readiness protocol is an intentionally unprotected Node script module.
import { validateReadinessDirectObservation } from "../../scripts/release/readiness-protocol.mjs";
// @ts-expect-error The canonical release helper is an intentionally unprotected Node script module.
import { canonicalJson, sha256Digest, sha512Integrity } from "../../scripts/release/protocol.mjs";
// @ts-expect-error Exact GitHub artifact ZIP fixture.
import { githubArtifactZip } from "../fixtures/release/github-artifact-zip.mjs";

const { collectDirectObservation, collectReadinessAggregate, extractFlatZip, parseDispatchEnvironment } = collector;
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const policy = contract.releaseCertification.readiness;
const blocker = policy.externalEvidenceAuthentication.blocker;

describe("release readiness workflow", () => {
  it("keeps the current STOP before an activation-complete read-only aggregate finalizer", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release-readiness.yml"), "utf8");
    const collectorSource = await readFile(resolve(root, "scripts/release/collect-release-readiness.mjs"), "utf8");
    const workflow = parse(source) as any;
    const expectedInputs = [
      policy.dispatch.sourceInput,
      policy.dispatch.candidateInput,
      ...policy.dispatch.evidenceInputs.map(({ input }: { readonly input: string }) => input),
    ];
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(expectedInputs);
    for (
      const { input } of policy.dispatch.evidenceInputs.filter(
        ({ role }: { readonly role: string }) => policy.externalEvidenceIngress.roles.includes(role),
      )
    ) {
      expect(workflow.on.workflow_dispatch.inputs[input].description).toContain("ingress artifact reference");
    }
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read", deployments: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["aggregate"]);
    expect(workflow.jobs.aggregate.environment).toBeUndefined();
    expect(source).toContain("Refuse readiness while external producer authentication is not established");
    expect(source).toContain("scripts/release/collect-release-readiness.mjs");
    const steps = workflow.jobs.aggregate.steps;
    const collect = steps.find(({ id }: { readonly id?: string }) => id === "collect");
    const upload = steps.find(({ id }: { readonly id?: string }) => id === "upload");
    const coordinate = steps.find(({ id }: { readonly id?: string }) => id === "readiness-coordinate");
    expect(source).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(source).toContain("bun-version: 1.3.14");
    expect(source).toContain("node scripts/release/install-frozen-release-dependencies.mjs");
    expect(Object.keys(collect.env).sort()).toEqual([
      "APPLE_CERTIFICATION_REFERENCE_JSON",
      "CANDIDATE_REFERENCE_JSON",
      "EXACT_MAIN_CI_REFERENCE_JSON",
      "FAKE_REGISTRY_REFERENCE_JSON",
      "GITHUB_RELEASE_GOVERNANCE_EVIDENCE_JSON",
      "GITHUB_TOKEN",
      "NPM_AUTHORITY_EVIDENCE_JSON",
      "NPM_OIDC_CERTIFICATION_REFERENCE_JSON",
      "OPERATIONAL_JOURNAL_EVIDENCE_JSON",
      "OUTPUT_DIRECTORY",
      "SOURCE_SHA",
    ]);
    expect(collect.env.NPM_AUTHORITY_EVIDENCE_JSON).toBe("${{ inputs.npm_authority_evidence_json }}");
    expect(collect.env.OPERATIONAL_JOURNAL_EVIDENCE_JSON).toBe(
      "${{ inputs.operational_journal_evidence_json }}",
    );
    expect(collect.env.GITHUB_RELEASE_GOVERNANCE_EVIDENCE_JSON).toBe(
      "${{ inputs.github_release_governance_evidence_json }}",
    );
    expect(upload.uses).toBe("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(upload.with).toEqual({
      name: "${{ steps.collect.outputs.artifact-name }}",
      path: "${{ runner.temp }}/release-readiness",
      "if-no-files-found": "error",
      "retention-days": "${{ steps.collect.outputs.retention-days }}",
      "compression-level": 0,
    });
    expect(coordinate.env.UPLOAD_ACTION_BARE_DIGEST).toBe("${{ steps.upload.outputs.artifact-digest }}");
    expect(coordinate.run).toContain("sha256:$UPLOAD_ACTION_BARE_DIGEST");
    expect(coordinate.run).toContain("scripts/release/post-upload-artifact-observation.mjs");
    expect(coordinate.run).not.toContain("curl ");
    expect(coordinate.run).toContain("main.object?.sha !== sourceSha");
    expect(workflow.jobs.aggregate.outputs["artifact-digest"]).toBe(
      "${{ steps.readiness-coordinate.outputs.artifact-digest }}",
    );
    expect(source).not.toContain("GH_TOKEN");
    expect(source).not.toContain("id-token: write");
    expect(source).not.toContain("NPM_TOKEN");
    expect(source).not.toContain("NODE_AUTH_TOKEN");
    expect(source).not.toMatch(/\bnpm\s+publish\b/u);
    expect(collectorSource).toContain("assertReadinessArtifactAllowed(arguments_?.contract);");
    const mainObservations = [
      ...collectorSource.matchAll(/await currentMain\(\{ github, contract, sourceSha \}\)/gu),
    ];
    expect(mainObservations).toHaveLength(4);
    const validationIndex = collectorSource.indexOf("validate: async () => await buildReadinessAggregate");
    const terminalMainIndex = mainObservations.at(-1)?.index ?? -1;
    expect(terminalMainIndex).toBeGreaterThan(validationIndex);
    expect(collectorSource).toContain("return await finalizeAfterTerminalObservation");
  });

  it("rejects dispatch parsing and collection before any untrusted reference or GitHub endpoint is used", () => {
    let reads = 0;
    const github = {
      readJson: () => {
        reads += 1;
        throw new Error("must not be called");
      },
      readArtifactZip: () => {
        reads += 1;
        throw new Error("must not be called");
      },
    };
    expect(() => parseDispatchEnvironment(contract, {})).toThrow(blocker);
    expect(() => collectReadinessAggregate({ contract, github })).toThrow(blocker);
    expect(reads).toBe(0);
  });

  it("the checked-in CLI exits closed and writes no aggregate files", async () => {
    const output = await mkdtemp(join(tmpdir(), "effect-build-readiness-stop-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/release/collect-release-readiness.mjs",
          "--observed-at",
          "2026-08-30T16:00:00.000Z",
          "--output",
          output,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: { PATH: process.env.PATH ?? "" },
          shell: false,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("release readiness collection failed closed\n");
      expect(await readdir(output)).toEqual([]);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });

  it("collects exact GitHub authority and all twelve anonymous npm namespace coordinates without inventing repository fields", async () => {
    const changed = structuredClone(contract);
    const release = changed.releaseCertification;
    const registry = changed.npmRegistryBoundary;
    const workflowBytes = await readFile(resolve(root, release.readiness.workflowPath));
    const placeholderBytes = new Map<string, Buffer>();
    for (const ledger of registry.bootstrap.placeholderLedger) {
      const bytes = Buffer.from(`placeholder:${ledger.name}\n`);
      ledger.bytes = bytes.byteLength;
      ledger.sha256 = sha256Digest(bytes).slice("sha256:".length);
      ledger.integrity = sha512Integrity(bytes);
      placeholderBytes.set(ledger.name, bytes);
    }
    const expectedLatest = new Map(
      registry.publicationAdmission.target.expectedLatestBeforePublication.map((
        { name, version }: any,
      ) => [name, version]),
    );
    const ledgers = new Map(registry.bootstrap.placeholderLedger.map((entry: any) => [entry.name, entry]));
    const names = [
      ...Object.keys(changed.publicApiProjection.packages).sort(),
      ...registry.reservation.packages,
    ];
    const repository = {
      type: "git",
      url: "git+https://github.com/mannyc2/effect-build.git",
    };
    const packuments = new Map(names.map((name) => {
      const ledger: any = ledgers.get(name);
      const version = expectedLatest.get(name) ?? ledger.version;
      return [`https://registry.npmjs.org/${name}`, {
        repository,
        versions: {
          [version]: {
            repository,
            ...(ledger === undefined ? {} : {
              dist: {
                integrity: ledger.integrity,
                tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
              },
            }),
          },
        },
        "dist-tags": ledger === undefined
          ? { latest: version }
          : { latest: version, reserved: version },
      }];
    }));
    let extraProtectionRule = false;
    const github = {
      readJson: (endpoint: string) => {
        if (endpoint === "repos/mannyc2/effect-build") {
          return { full_name: "mannyc2/effect-build", id: 1331906770, owner: { id: 126291407 }, visibility: "public" };
        }
        if (endpoint === "repos/mannyc2/effect-build/environments/npm") {
          return {
            name: "npm",
            deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
            protection_rules: [
              { type: "branch_policy" },
              {
                type: "required_reviewers",
                prevent_self_review: false,
                reviewers: [{ type: "User", reviewer: { id: 126291407, login: "mannyc2" } }],
              },
              ...(extraProtectionRule ? [{ type: "wait_timer", wait_timer: 1 }] : []),
            ],
          };
        }
        if (endpoint.includes("deployment-branch-policies")) {
          return { total_count: 1, branch_policies: [{ name: "main", type: "branch" }] };
        }
        if (endpoint.endsWith("actions/oidc/customization/sub")) return release.githubAuthority.oidcSubjectPolicy;
        if (endpoint.includes("contents/.github/workflows/release-readiness.yml")) {
          return {
            path: release.readiness.workflowPath,
            type: "file",
            encoding: "base64",
            content: workflowBytes.toString("base64"),
          };
        }
        if (endpoint.endsWith("git/ref/heads/main")) {
          return { ref: "refs/heads/main", object: { type: "commit", sha: "a".repeat(40) } };
        }
        throw new Error(`unexpected GitHub endpoint ${endpoint}`);
      },
    };
    const npm = {
      readJson: async (url: string) => packuments.get(url),
      readTarball: async (url: string) => {
        const name = names.find((candidate) => url.includes(`/${candidate}/-/${candidate}-`));
        return placeholderBytes.get(name!);
      },
    };
    const observedAt = "2026-08-30T16:00:00.000Z";
    const observation = await collectDirectObservation({
      contract: changed,
      sourceSha: "a".repeat(40),
      observedAt,
      github,
      npm,
      workflowBytes,
    });
    expect(observation.npm.packages).toHaveLength(12);
    expect(observation.npm.packages.at(-1).name).toBe("effect-build-rolldown");
    expect(observation.npm.packages[1].repository).toEqual(repository);
    expect(observation.npm.packages[1].repository).not.toHaveProperty("directory");
    expect(validateReadinessDirectObservation({
      contract: changed,
      sourceSha: "a".repeat(40),
      observedAt,
      observation,
    })).toEqual(observation);
    const hostile = structuredClone(observation);
    hostile.npm.packages[0].versions.push("0.7.0");
    expect(() =>
      validateReadinessDirectObservation({
        contract: changed,
        sourceSha: "a".repeat(40),
        observedAt,
        observation: hostile,
      })
    ).toThrow(/public state/u);
    extraProtectionRule = true;
    await expect(collectDirectObservation({
      contract: changed,
      sourceSha: "a".repeat(40),
      observedAt,
      github,
      npm,
      workflowBytes,
    })).rejects.toThrow(/protection rules changed/u);
  });

  it("extracts only one exact unique flat regular ZIP file set", () => {
    const one = Buffer.from(canonicalJson({ one: true }));
    expect([
      ...extractFlatZip({
        zipBytes: githubArtifactZip([["one.json", one]]),
        expectedFiles: ["one.json"],
        label: "fixture",
        policy: contract.releaseCertification.readiness.zipExtraction,
      }).keys(),
    ]).toEqual(["one.json"]);
    expect(() =>
      extractFlatZip({
        zipBytes: githubArtifactZip([
          ["one.json", one],
          ["extra.json", Buffer.from(canonicalJson({ extra: true }))],
        ]),
        expectedFiles: ["one.json"],
        label: "fixture",
        policy: contract.releaseCertification.readiness.zipExtraction,
      })
    ).toThrow(/unexpected or duplicate/u);
  });
});
