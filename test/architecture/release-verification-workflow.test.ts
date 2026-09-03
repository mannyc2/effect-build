import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// @ts-expect-error The final collector is an intentionally unprotected Node script module.
import * as finalCollector from "../../scripts/release/collect-final-public-verification.mjs";
// @ts-expect-error The final verifier is an intentionally unprotected Node script module.
import * as verifier from "../../scripts/release/final-public-verification.mjs";

const { assertFinalPublicVerificationAllowed, parseFinalPublicDispatch } = verifier;
const { collectFinalNpmState } = finalCollector;
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractBytes = await readFile(resolve(root, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const policy = contract.releaseCertification.finalPublicVerification;

describe("final public release verification", () => {
  it("derives exact public counts and the twelve-asset boundary without copying package or module sets", () => {
    expect(policy.protocol).toBe("effect-build/final-public-verification@2");
    expect(policy.receipt.protocol).toBe("effect-build/final-public-release-receipt@2");
    expect(policy.implementation.consumerSmoke.protocol).toBe("effect-build/final-public-consumer-smoke@1");
    expect(policy.status).toBe("ready");
    expect(policy.upstreamGateSource).toBe("releaseCertification.readiness");
    expect(policy.artifactDisposition).toBe("allowed-on-terminal-readiness-success");
    expect(policy.releasePolicy.immutabilityDecisionSource).toBe(
      "live-operator-admin-preflight-before-draft-and-public-release",
    );
    expect(policy.packageCount).toBe(11);
    expect(policy.moduleCount).toBe(42);
    expect(policy.releaseAssetCount).toBe(12);
    expect(policy.tag).toBe("v0.6.1");
    expect(policy.publicState.packageSource).toBe("publicApiProjection.packages");
    expect(policy.publicState.moduleSource).toBe("publicApiProjection.packages package roots and subpaths");
    expect(policy.publicState).not.toHaveProperty("packages");
    expect(policy.publicState).not.toHaveProperty("modules");
    expect(policy.publicState.requiredChecks).toEqual([
      "authenticated-current-main-exact-source",
      "authenticated-candidate-coordinate-and-downloaded-bytes",
      "authenticated-readiness-coordinate-and-downloaded-bytes",
      "lightweight-tag-directly-targets-source",
      "public-release-nondraft-nonprerelease-exact-tag-and-canonical-branch-presentation",
      "twelve-release-assets-candidate-exact-by-name-size-digest-and-download",
      "eleven-anonymous-npm-tarballs-candidate-exact-size-sha256-sha512",
      "eleven-latest-tags-exact-version",
      "eleven-sigstore-provenance-subject-workflow-and-source-exact",
      "fresh-node-and-bun-cache-consumer-smoke-all-public-modules",
      "rolldown-reservation-invariants-unchanged",
    ]);
  });

  it("keeps the directly active hosted path read-only", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release-verification.yml"), "utf8");
    const collectorSource = await readFile(
      resolve(root, "scripts/release/collect-final-public-verification.mjs"),
      "utf8",
    );
    const workflow = parse(source) as any;
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      policy.dispatch.sourceInput,
      policy.dispatch.candidateInput,
      policy.dispatch.readinessInput,
      policy.dispatch.tagInput,
      policy.dispatch.releaseInput,
    ]);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["verify"]);
    const steps = workflow.jobs.verify.steps as Array<Record<string, any>>;
    const collectIndex = steps.findIndex((step) => step.id === "collect");
    const install = steps.find((step) => step.name === "Install the exact read-only verifier dependency graph");
    const uploadIndex = steps.findIndex((step) => step.id === "upload");
    const finalizerIndex = steps.findIndex((step) => step.id === "final-coordinate");
    expect(collectIndex).toBeGreaterThan(0);
    expect(uploadIndex).toBeGreaterThan(collectIndex);
    expect(finalizerIndex).toBeGreaterThan(uploadIndex);
    const collect = steps[collectIndex]!;
    const upload = steps[uploadIndex]!;
    const finalizer = steps[finalizerIndex]!;
    expect(install?.run).not.toContain("npm install --global");
    expect(install?.run).toContain('[[ "$(npm --version)" == "11.11.0" ]]');
    expect(install?.run).toContain("node scripts/release/install-frozen-release-dependencies.mjs");
    expect(collect.run).toContain("scripts/release/collect-final-public-verification.mjs");
    expect(collect.env).toEqual({
      CANDIDATE_REFERENCE_JSON: "${{ inputs.candidate_reference_json }}",
      GITHUB_TOKEN: "${{ github.token }}",
      READINESS_REFERENCE_JSON: "${{ inputs.readiness_reference_json }}",
      RELEASE_REFERENCE_JSON: "${{ inputs.release_reference_json }}",
      SOURCE_SHA: "${{ inputs.source_sha }}",
      TAG_REFERENCE_JSON: "${{ inputs.tag_reference_json }}",
      OUTPUT_DIRECTORY: "${{ runner.temp }}/final-public-verification",
    });
    expect(upload.uses).toBe("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(upload).not.toHaveProperty("if");
    expect(finalizer.run).toContain("scripts/release/post-upload-artifact-observation.mjs");
    expect(finalizer.run).not.toContain("curl ");
    expect(finalizer.run).toContain("repository_id");
    expect(finalizer.run).toContain("head_repository_id");
    expect(finalizer.run).toContain("final-public-release.json");
    expect(source).not.toContain("id-token: write");
    expect(source).not.toContain("NPM_TOKEN");
    expect(source).not.toMatch(/\bnpm\s+publish\b/u);
    expect(source).not.toMatch(/\bgh\s+(?:release|api).*--method\b/u);
    expect(source).not.toMatch(/\bgit\s+(?:tag|push)\b/u);
    expect(collectorSource).toContain("releaseResponse?.target_commitish !== authority.branchPolicy.name");
    expect(collectorSource).not.toContain("releaseResponse?.target_commitish !== sourceSha");
    const mainObservations = [
      ...collectorSource.matchAll(/await currentMain\(\{ contract, github, sourceSha \}\)[;,]/gu),
    ];
    expect(mainObservations).toHaveLength(3);
    const terminalMainIndex = mainObservations.at(-1)?.index ?? -1;
    const publicComparisonIndex = collectorSource.indexOf(
      'throw new Error("public npm or GitHub Release state changed during final verification")',
    );
    const validationIndex = collectorSource.indexOf("validate: async () => await validateFinalPublicState");
    expect(validationIndex).toBeGreaterThan(publicComparisonIndex);
    expect(terminalMainIndex).toBeGreaterThan(validationIndex);
    expect(collectorSource).toContain("return await finalizeAfterTerminalObservation");
  });

  it("admits only the canonical policy and rejects malformed dispatch before network access", () => {
    expect(() => assertFinalPublicVerificationAllowed(contract)).not.toThrow();
    expect(() =>
      parseFinalPublicDispatch(contract, {
        READINESS_REFERENCE_JSON: JSON.stringify({ terminal: "success" }),
      })
    ).toThrow(/source SHA/u);
    const result = spawnSync(process.execPath, ["scripts/release/final-public-verification.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
      shell: false,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("final public verification failed closed\n");
  });

  it("passes the exact candidate byte ledger through both anonymous npm observations", async () => {
    const active = structuredClone(contract);
    const implementation = active.releaseCertification.finalPublicVerification.implementation;
    const reservationBytes = Buffer.from("exact reservation fixture\n");
    implementation.reservation.ledger.bytes = reservationBytes.byteLength;
    implementation.reservation.ledger.sha256 = createHash("sha256").update(reservationBytes).digest("hex");
    implementation.reservation.ledger.integrity = `sha512-${
      createHash("sha512").update(reservationBytes).digest("base64")
    }`;
    const names = Object.keys(active.publicApiProjection.packages).sort();
    const bytes = new Map(names.map((name) => [name, Buffer.from(`exact ${name} 0.6.1 bytes\n`)]));
    const packages = names.map((name) => {
      const value = bytes.get(name)!;
      return {
        name,
        file: `${name}-0.6.1.tgz`,
        bytes: value.byteLength,
        sha256: `sha256:${createHash("sha256").update(value).digest("hex")}`,
        integrity: `sha512-${createHash("sha512").update(value).digest("base64")}`,
      };
    });
    const candidate = { manifest: { packages } };
    let jsonReads = 0;
    let tarballReads = 0;
    const npm = {
      readJson: async (url: string) => {
        jsonReads += 1;
        if (url.includes("/-/npm/v1/attestations/")) {
          return {
            attestations: [{
              predicateType: implementation.provenance.predicateType,
              bundle: { fixture: "exact provenance bundle" },
            }],
          };
        }
        const name = decodeURIComponent(new URL(url).pathname.slice(1));
        if (name === implementation.reservation.package) {
          const ledger = implementation.reservation.ledger;
          return {
            "dist-tags": { ...ledger.bootstrapTags },
            versions: {
              [ledger.version]: {
                dist: {
                  integrity: ledger.integrity,
                  tarball: `${policy.registry}/${name}/-/${name}-${ledger.version}.tgz`,
                },
              },
            },
          };
        }
        const entry = packages.find((value) => value.name === name)!;
        return {
          "dist-tags": { latest: policy.version },
          versions: {
            [policy.version]: {
              name,
              version: policy.version,
              dist: {
                integrity: entry.integrity,
                tarball: `${policy.registry}/${name}/-/${entry.file}`,
              },
            },
          },
        };
      },
      readTarball: async (url: string) => {
        tarballReads += 1;
        if (url.endsWith(`/${implementation.reservation.package}-${implementation.reservation.ledger.version}.tgz`)) {
          return reservationBytes;
        }
        const entry = packages.find((value) => url.endsWith(`/${value.file}`));
        return bytes.get(entry!.name)!;
      },
    };
    const first = await collectFinalNpmState({ contract: active, npm, candidate });
    const second = await collectFinalNpmState({ contract: active, npm, candidate });
    expect(second.packages).toEqual(first.packages);
    expect(second.packageBytes).toEqual(first.packageBytes);
    expect(second.reservation).toEqual(first.reservation);
    expect(jsonReads).toBe(46);
    expect(tarballReads).toBe(24);

    const collectorSource = await readFile(
      resolve(root, "scripts/release/collect-final-public-verification.mjs"),
      "utf8",
    );
    expect(collectorSource.match(/collectFinalNpmState\(\{ contract, npm, candidate \}\)/gu)).toHaveLength(2);
    expect(collectorSource).not.toContain("collectFinalNpmState({ contract, npm })");
  });

  it("rejects caller mutations of the directly active policy", () => {
    const changed = structuredClone(contract);
    changed.releaseCertification.finalPublicVerification.artifactDisposition = "allowed";
    expect(() => assertFinalPublicVerificationAllowed(changed)).toThrow(/no exact final-public/u);
  });
});
