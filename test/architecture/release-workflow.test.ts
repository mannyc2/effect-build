import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface WorkflowStep {
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly environment?: string;
  readonly if?: string;
  readonly needs?: string | ReadonlyArray<string>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly "runs-on"?: string;
  readonly steps?: ReadonlyArray<WorkflowStep>;
}

interface ReleaseWorkflow {
  readonly on: {
    readonly workflow_dispatch?: {
      readonly inputs?: {
        readonly approval?: { readonly options?: ReadonlyArray<string> };
      };
    };
  };
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: boolean };
  readonly permissions?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface CombinedContract {
  readonly npmRegistryBoundary: {
    readonly client: { readonly node: string; readonly npm: string };
    readonly publicationAdmission: {
      readonly target: {
        readonly version: string;
        readonly expectedLatestBeforePublication: ReadonlyArray<{ readonly name: string; readonly version: string }>;
      };
    };
  };
}

const scripts = (job: WorkflowJob | undefined) => job?.steps?.map((step) => step.run ?? "").join("\n") ?? "";
const action = (job: WorkflowJob | undefined, name: string) => job?.steps?.find((step) => step.uses?.startsWith(name));

describe("release workflow", () => {
  it("hands immutable bytes from an unprivileged verifier to one minimal protected publisher", async () => {
    const [source, prepareSource] = await Promise.all([
      readFile(resolve(root, ".github/workflows/release.yml"), "utf8"),
      readFile(resolve(root, "scripts/release/prepare-npm-candidate.mjs"), "utf8"),
    ]);
    const workflow = parse(source) as ReleaseWorkflow;
    const combinedContract = JSON.parse(
      await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
    ) as CombinedContract;
    const environment = workflow.jobs["environment-contract"];
    const prepare = workflow.jobs["prepare-candidate"];
    const publish = workflow.jobs.publish;
    const prepareScript = scripts(prepare);
    const publishScript = scripts(publish);

    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch?.inputs?.approval?.options).toEqual([
      "do-not-publish",
      "publish-exact-sha",
    ]);
    expect(workflow.concurrency).toEqual({
      group: "effect-build-npm-release",
      "cancel-in-progress": false,
    });
    for (const job of [environment, prepare, publish]) {
      expect(job?.if).toBe("inputs.approval == 'publish-exact-sha'");
    }
    expect(environment?.permissions).toEqual({ actions: "read", contents: "read" });
    expect(prepare?.permissions).toEqual({ contents: "read" });
    expect(prepare?.permissions?.["id-token"]).toBeUndefined();
    expect(prepare?.environment).toBeUndefined();
    expect(publish?.needs).toEqual(["environment-contract", "prepare-candidate"]);
    expect(publish?.environment).toBe("npm");
    expect(publish?.permissions).toEqual({ actions: "read", contents: "read", "id-token": "write" });
    expect(publish?.["runs-on"]).toBe("ubuntu-24.04");

    expect(action(prepare, "actions/checkout@")?.uses).toBe(
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    );
    expect(action(prepare, "actions/upload-artifact@")?.uses).toBe(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(action(prepare, "oven-sh/setup-bun@")?.with?.["bun-version"]).toBe("1.3.14");
    expect(action(publish, "actions/download-artifact@")).toBeUndefined();
    expect(action(publish, "actions/checkout@")).toBeUndefined();
    expect(action(publish, "oven-sh/setup-bun@")).toBeUndefined();
    expect(publish?.steps?.flatMap((step) => step.uses ?? [])).toEqual([
      "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    ]);
    expect(publishScript).not.toContain("bun install");
    expect(publishScript).not.toContain("bun run");
    expect(publishScript).not.toContain("scripts/release/");
    expect(publishScript).not.toContain("npx");

    expect(prepareScript).toContain("git ls-remote --exit-code origin refs/heads/main");
    expect(prepareScript).toContain("scripts/release/prepare-npm-candidate.mjs");
    expect(source).toContain("bun install --frozen-lockfile");
    expect(source).toContain("bun run verify");
    expect(source).toContain("npm-release-candidate-${{ inputs.source_sha }}");
    expect(source).toContain("artifact-digest: ${{ steps.upload.outputs.artifact-digest }}");
    expect(prepareSource).toContain('spawnSync("bun", ["--version"]');
    expect(prepareSource).toContain("requires contract Bun 1.3.14");
    expect(prepareSource).toContain("filename !== `${name}-${version}.tgz`");
    expect(publishScript).toContain('candidate.packer, { name: "bun", version: authorizedBun?.version }');
    expect(publishScript).toContain("/actions/artifacts/$ARTIFACT_ID/zip");
    expect(publishScript).toContain('actual_artifact_digest="$(openssl dgst -sha256');
    expect(publishScript).toContain('actual_artifact_digest" != "$EXPECTED_ARTIFACT_DIGEST');
    expect(publishScript).toContain("unsafe or non-flat release artifact entry");
    expect(publishScript).toContain(
      "/contents/tooling/effect-build-contract.json?ref=$EXPECTED_SHA",
    );
    expect(publishScript).toContain("!isDeepStrictEqual(registry, authorizedContract.npmRegistryBoundary)");

    for (const job of [prepare, publish]) {
      expect(action(job, "actions/setup-node@")?.with?.["node-version"]).toBe(
        combinedContract.npmRegistryBoundary.client.node,
      );
    }
    expect(source).toContain('writeFileSync(stage + "/npm-version.txt", registry.client.npm + "\\n")');
    expect(publishScript).toContain('if [[ "$(npm --version)" != "$npm_version" ]]');
  });

  it("re-observes exact environment and main authority before the OIDC mutation boundary", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const workflow = parse(source) as ReleaseWorkflow;
    const environmentScript = scripts(workflow.jobs["environment-contract"]);
    const publishScript = scripts(workflow.jobs.publish);

    expect(source).not.toContain("npm-production");
    expect(source).not.toContain("NPM_TOKEN");
    expect(source).not.toContain("npm login");
    expect(environmentScript).toContain("/environments/npm");
    expect(environmentScript).toContain("/environments/npm/deployment-branch-policies");
    expect(environmentScript).toContain('JSON.stringify(["branch_policy", "required_reviewers"])');
    expect(environmentScript).toContain('JSON.stringify([{ login: "mannyc2", type: "User" }])');
    expect(environmentScript).not.toContain("reviewers?.includes");
    expect(publishScript).toContain("post-approval environment or exact-main authority changed");
    expect(publishScript).toContain("main.object?.sha !== expectedSha");
    expect(publishScript).toContain("main advanced before publication");
    expect(source.match(/environments\/npm\/deployment-branch-policies/gu)).toHaveLength(2);
    expect(source.match(/git\/ref\/heads\/main/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  it("publishes only contract-admitted tarballs and preserves every reservation invariant", async () => {
    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const workflow = parse(source) as ReleaseWorkflow;
    const publishScript = scripts(workflow.jobs.publish);
    const combinedContract = JSON.parse(
      await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
    ) as CombinedContract;

    expect(source.match(/\bnpm publish\b/gu)).toHaveLength(1);
    expect(publishScript).toContain([
      'npm publish "${tarballs[$name]}" \\',
      "    --provenance \\",
      "    --access public \\",
      '    --tag "$publication_tag" \\',
      "    --ignore-scripts \\",
      '    --registry "$registry_url"',
    ].join("\n"));
    expect(publishScript).not.toContain("npm dist-tag");
    expect(publishScript).not.toContain("npm stage");
    expect(publishScript).toContain('export npm_config_cache="$NPM_CACHE"');
    expect(publishScript).toContain("export npm_config_prefer_online=true");
    expect(publishScript).toContain("export npm_config_ignore_scripts=true");

    expect(publishScript).toContain('names.includes("effect-build-rolldown")');
    expect(publishScript).toContain('JSON.stringify(reservedOnly) !== JSON.stringify(["effect-build-rolldown"])');
    expect(publishScript).toContain('tar -xOzf "$tarball" package/package.json');
    expect(publishScript).toContain("entry.file !== `${entry.name}-${candidate.version}.tgz`");
    expect(publishScript).toContain("embedded npm identity changed for admitted slot");
    expect(publishScript).toContain("candidate bytes changed for ${entry.name}");
    expect(publishScript).toContain("downloaded bytes do not match the frozen ledger");
    expect(publishScript).toContain('observed_latest" != "${expected_latest[$name]}"');
    expect(publishScript).toContain("has a version newer than the contract release target");
    expect(publishScript).toContain("exact prior $publication_tag=$observed_latest");
    expect(publishScript.match(/assert_only_placeholder_version "\$name" "\$placeholder_version"/gu)).toHaveLength(2);
    expect(publishScript).toContain('read_tag "$name" "$reservation_tag"');
    expect(publishScript).toContain('read_tag "$name" "$publication_tag"');
    expect(publishScript).not.toContain('read_tag "$name" "latest"');
    expect(publishScript).not.toContain('read_tag "$name" "reserved"');
    expect(publishScript).toContain('registry.publicationAdmission.tag !== "latest"');
    expect(publishScript).toContain('registry.bootstrap.placeholderTag !== "reserved"');
    expect(publishScript.indexOf('assert_no_newer_version "$name" "$version"')).toBeLessThan(
      publishScript.indexOf('remote_output="$(npm view "$name@$version"'),
    );

    expect(combinedContract.npmRegistryBoundary.publicationAdmission.target.version).toBe("0.6.0");
    expect(combinedContract.npmRegistryBoundary.publicationAdmission.target.expectedLatestBeforePublication)
      .toHaveLength(
        11,
      );
  });

  it("removes the obsolete token bootstrap workflow after trusted publishing is established", async () => {
    await expect(readFile(resolve(root, ".github/workflows/npm-bootstrap.yml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps every workflow outside the protected publish site registry-read-only", async () => {
    const workflowRoot = resolve(root, ".github/workflows");
    const workflowNames = (await readdir(workflowRoot)).filter((name) => /\.ya?ml$/u.test(name)).sort();
    const sources = await Promise.all(workflowNames.map(async (name) => ({
      name,
      source: await readFile(resolve(workflowRoot, name), "utf8"),
    })));
    const mutation =
      /\bnpm\s+(?:access|deprecate|dist-tag|owner|stage|token|unpublish)\b|\bNPM_TOKEN\b|\bnpm\s+login\b/gu;

    for (const { name, source } of sources) {
      expect(source.match(mutation) ?? [], name).toEqual([]);
      if (name !== "release.yml") expect(source).not.toMatch(/\bnpm\s+publish\b/u);
      if (name !== "release.yml") expect(source).not.toContain("id-token: write");
    }
    expect(sources.find(({ name }) => name === "release.yml")?.source.match(/\bnpm\s+publish\b/gu)).toHaveLength(1);
  });
});
