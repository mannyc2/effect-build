import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(new URL("../..", import.meta.url).pathname);
const publicPackages = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
] as const;
const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];
const consumerFixtures = [
  ...publicPackages.map((name) => `npm-${name}`),
  "npm-esbuild-node-sea",
  "npm-bun-node-sea",
  ...publicPackages.map((name) => `bun-${name}`),
  "bun-esbuild-node-sea",
  "bun-bun-node-sea",
] as const;

interface WorkflowStep {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  shell?: string;
  if?: string;
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  env?: Record<string, string>;
  environment?: string;
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "continue-on-error"?: unknown;
  "runs-on"?: string;
  steps?: WorkflowStep[];
  strategy?: {
    "fail-fast"?: boolean;
    matrix?: {
      runner?: string[];
      compiler?: string[];
      effect?: string[];
      include?: Array<{ gate: string; runner: string }>;
    };
  };
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  env?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

interface SupportCell {
  orchestrator: string;
  runner: string;
  target: string;
  compiler: string;
}

interface SupportMatrix {
  publicationHosts: string[];
  supportedCells: SupportCell[];
}

const loadScript = async <T>(name: string): Promise<T> =>
  await import(pathToFileURL(resolve(root, "scripts", name)).href) as T;

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<string, unknown>;

const jobRuns = (workflow: Workflow, name: string): string =>
  (workflow.jobs[name]?.steps ?? []).map((step) => step.run ?? "").join("\n");

const checkoutAction = "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const setupNodeAction = "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e";
const setupBunAction = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6";
const cacheAction = "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const uploadArtifactAction = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const qualifiedReleaseAction = "mannyc2/ts-release/apps/ts-release-action@105b6b5cc39757f5284c30b082e7cfd71b9959b2";
const approvedActions = new Set([
  checkoutAction,
  setupNodeAction,
  setupBunAction,
  cacheAction,
  uploadArtifactAction,
  qualifiedReleaseAction,
]);
const approvedPackageTree = "9ad55683899ec7447b608cff7997ac5a2572a996";
const packageTreeGuard = `test "$(git rev-parse HEAD:packages)" = "${approvedPackageTree}"`;
const forbiddenPublishPackageCommand =
  /\b(?:bun|npm|pnpm|yarn)\s+install\b|\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?build\b|\b(?:bun|npm|pnpm|yarn)\s+(?:(?:run|pm)\s+)?pack\b/;

const expectPinnedActionsWithoutEscapes = (workflow: Workflow): void => {
  for (const job of Object.values(workflow.jobs)) {
    if (job.if !== undefined) {
      expect(["${{ inputs.command == 'candidate' }}", "${{ inputs.command == 'publish' }}"]).toContain(job.if);
    }
    expect(job["continue-on-error"]).toBeUndefined();
    for (const step of job.steps ?? []) {
      if (step.uses !== undefined) {
        expect(approvedActions).toContain(step.uses);
      }
      expect(step["continue-on-error"]).toBeUndefined();
      if (step.if !== undefined) {
        expect(step.if).toMatch(
          /^\$\{\{ always\(\) && steps\.(?:prepare|publish)\.outputs\.report-ref != '' \}\}$/,
        );
      }
    }
  }
};

const workflowAuthorityErrors = (workflow: Workflow, kind: "ci" | "release"): string[] => {
  const errors: string[] = [];
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: "read" })) {
    errors.push("workflow permissions must be exactly contents: read");
  }
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const publishJob = kind === "release" && jobName === "publish";
    const expectedPermissions = publishJob
      ? { actions: "read", contents: "write", "id-token": "write" }
      : kind === "release" && jobName === "candidate"
      ? { actions: "read", contents: "read" }
      : { contents: "read" };
    if (job.permissions !== undefined && JSON.stringify(job.permissions) !== JSON.stringify(expectedPermissions)) {
      errors.push(`${jobName} job permissions must be exactly ${
        publishJob
          ? "release mutation permissions"
          : kind === "release" && jobName === "candidate"
          ? "candidate artifact read permissions"
          : "contents: read"
      }`);
    }
    if (!publishJob && job.permissions?.["id-token"] === "write") errors.push(`${jobName} grants id-token: write`);
    const steps = job.steps ?? [];
    for (const [index, step] of steps.entries()) {
      if (step.uses !== undefined && !approvedActions.has(step.uses)) {
        errors.push(`${jobName} step ${index} action is not the approved exact identity`);
      }
      if (step.run?.includes("${{")) errors.push(`${jobName} step ${index} interpolates workflow data in shell text`);
      if (step.run?.includes("GITHUB_ENV")) errors.push(`${jobName} step ${index} writes global workflow environment`);
    }
    if (kind === "ci") {
      const checkout = steps[0];
      const guard = steps[1];
      if (checkout?.uses !== checkoutAction) errors.push(`${jobName} must checkout first`);
      if (checkout?.with?.ref !== "${{ github.sha }}") errors.push(`${jobName} checkout ref is not github.sha`);
      if (checkout?.with?.["persist-credentials"] !== false) errors.push(`${jobName} checkout persists credentials`);
      if (jobName === "quality" && checkout?.with?.["fetch-depth"] !== 0) {
        errors.push("quality must fetch complete history for the frozen migration authority");
      }
      if (
        guard?.env?.SOURCE_SHA !== "${{ github.sha }}"
        || guard.shell !== "bash"
        || !guard.run?.includes("^[0-9a-f]{40}$")
        || !guard.run.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"')
      ) {
        errors.push(`${jobName} lacks the immediate exact-SHA HEAD guard`);
      }
    } else if (!publishJob) {
      const lexical = steps[0];
      const checkout = steps[1];
      const guard = steps[2];
      if (
        lexical?.id !== "source"
        || lexical.env?.REQUESTED_SOURCE !== "${{ inputs.commit }}"
        || lexical.env?.REQUESTED_COMMAND !== "${{ inputs.command }}"
        || lexical.env?.WORKFLOW_SOURCE !== "${{ github.sha }}"
        || lexical.env?.WORKFLOW_REF !== "${{ github.ref }}"
        || lexical.shell !== "bash"
        || !lexical.run?.includes("^[0-9a-f]{40}$")
        || !lexical.run.includes('test "$REQUESTED_COMMAND" = "candidate"')
        || !lexical.run.includes('test -z "$CANDIDATE_RUN_ID"')
        || !lexical.run.includes('test -z "$CANDIDATE_ARTIFACT_ID"')
        || !lexical.run.includes('test -z "$CANDIDATE_ARTIFACT_DIGEST"')
        || !lexical.run.includes('test -z "$PREPARED_REF"')
        || !lexical.run.includes('test "$REQUESTED_SOURCE" = "$WORKFLOW_SOURCE"')
        || !lexical.run.includes(
          'test "$WORKFLOW_REF" = "refs/heads/codex/granular-integration-program"',
        )
        || !lexical.run.includes(
          'test "$WORKFLOW_IDENTITY" = "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/codex/granular-integration-program"',
        )
        || !lexical.run.includes('test "$REPOSITORY" = "mannyc2/effect-build"')
        || !lexical.run.includes("GITHUB_OUTPUT")
      ) {
        errors.push(`${jobName} lacks the pre-checkout command/branch/workflow/source guard`);
      }
      if (checkout?.uses !== checkoutAction) errors.push(`${jobName} must checkout only after lexical validation`);
      if (checkout?.with?.ref !== "${{ steps.source.outputs.sha }}") {
        errors.push(`${jobName} checkout ref is not the validated source output`);
      }
      if (checkout?.with?.["persist-credentials"] !== false) errors.push(`${jobName} checkout persists credentials`);
      if (jobName === "candidate-gates" && checkout?.with?.["fetch-depth"] !== 0) {
        errors.push(`${jobName} must fetch complete history for the frozen migration authority`);
      }
      if (
        guard?.env?.REQUESTED_SOURCE !== "${{ steps.source.outputs.sha }}"
        || guard.env?.WORKFLOW_SOURCE !== "${{ github.sha }}"
        || guard.shell !== "bash"
        || !guard.run?.includes("^[0-9a-f]{40}$")
        || !guard.run.includes('test "$REQUESTED_SOURCE" = "$WORKFLOW_SOURCE"')
        || !guard.run.includes('test "$(git rev-parse HEAD)" = "$REQUESTED_SOURCE"')
      ) {
        errors.push(`${jobName} lacks the immediate input/workflow/HEAD equality guard`);
      }
      if (!guard?.run?.includes(packageTreeGuard)) {
        errors.push(`${jobName} lacks the exact approved package-tree guard`);
      }
    } else {
      const lexical = steps[0];
      if (
        lexical?.id !== "source"
        || lexical.env?.REQUESTED_COMMAND !== "${{ inputs.command }}"
        || lexical.env?.REQUESTED_SOURCE !== "${{ inputs.commit }}"
        || lexical.env?.WORKFLOW_SOURCE !== "${{ github.sha }}"
        || lexical.env?.WORKFLOW_REF !== "${{ github.ref }}"
        || lexical.shell !== "bash"
        || !lexical.run?.includes('test "$REQUESTED_COMMAND" = "publish"')
        || !lexical.run.includes("^[0-9a-f]{40}$")
        || !lexical.run.includes("^sha256:[0-9a-f]{64}$")
        || !lexical.run.includes("^prepared:gha:mannyc2/effect-build/")
        || !lexical.run.includes('test "$REQUESTED_SOURCE" = "$WORKFLOW_SOURCE"')
        || !lexical.run.includes(
          'test "$WORKFLOW_REF" = "refs/heads/codex/granular-integration-program"',
        )
        || !lexical.run.includes(
          'test "$WORKFLOW_IDENTITY" = "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/codex/granular-integration-program"',
        )
        || !lexical.run.includes('test "$REPOSITORY" = "mannyc2/effect-build"')
      ) {
        errors.push("publish lacks the pre-mutation command/branch/workflow/source guard");
      }
      if (steps.some((step) => step.uses === checkoutAction)) errors.push("publish checks out repository source");
    }
  }
  return errors;
};

const candidateTransportErrors = (workflow: Workflow): string[] => {
  const errors: string[] = [];
  const steps = workflow.jobs.candidate?.steps ?? [];
  if (steps.some((step) => step.uses?.startsWith("actions/download-artifact@"))) {
    errors.push("candidate trusts download-artifact extraction without proving the transferred ZIP digest");
  }
  const authorityIndex = steps.findIndex((step) => step.run?.includes(".total_count == 1"));
  const transferIndex = steps.findIndex((step) => step.run?.includes("/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip"));
  const prepareIndex = steps.findIndex((step) => step.id === "prepare");
  if (
    authorityIndex < 0
    || transferIndex <= authorityIndex
    || prepareIndex <= transferIndex
  ) {
    errors.push("candidate transport must follow REST authority and precede preparation");
    return errors;
  }
  const transfer = steps[transferIndex]!;
  if (
    transfer.shell !== "bash"
    || transfer.env?.GH_TOKEN !== "${{ github.token }}"
    || transfer.env?.REPOSITORY !== "${{ github.repository }}"
    || transfer.env?.CANDIDATE_ARTIFACT_ID !== "${{ steps.upload-candidate.outputs.artifact-id }}"
    || transfer.env?.CANDIDATE_ARTIFACT_DIGEST !== "sha256:${{ steps.upload-candidate.outputs.artifact-digest }}"
    || transfer.env?.CANDIDATE_ZIP !== "${{ runner.temp }}/effect-build-candidate.zip"
    || transfer.env?.CANDIDATE_DIRECTORY !== "${{ github.workspace }}/outputs/effect-build-candidate"
  ) {
    errors.push("candidate transport lacks exact artifact identity and bounded paths");
  }
  const run = transfer.run ?? "";
  const download = 'gh api "/repos/$REPOSITORY/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip" > "$CANDIDATE_ZIP"';
  const hash = 'test "sha256:$(sha256sum "$CANDIDATE_ZIP" | awk \'{print $1}\')" = "$CANDIDATE_ARTIFACT_DIGEST"';
  const extract = 'unzip -q "$CANDIDATE_ZIP" -d "$CANDIDATE_DIRECTORY"';
  const downloadIndex = run.indexOf(download);
  const hashIndex = run.indexOf(hash);
  const extractIndex = run.indexOf(extract);
  if (downloadIndex < 0 || hashIndex <= downloadIndex || extractIndex <= hashIndex) {
    errors.push("candidate transport must hash the downloaded ZIP before extracting it");
  }
  return errors;
};

const candidatePreparationErrors = (workflow: Workflow): string[] => {
  const errors: string[] = [];
  const steps = workflow.jobs.candidate?.steps ?? [];
  const packIndex = steps.findIndex((step) => step.run?.includes("test-built-consumer.mjs --candidate-dir"));
  const preUploadVerifyIndex = steps.findIndex((step) => step.name === "Verify the packed candidate before transfer");
  const uploadIndex = steps.findIndex((step) => step.id === "upload-candidate");
  const authorityIndex = steps.findIndex((step) => step.run?.includes(".total_count == 1"));
  const transferIndex = steps.findIndex((step) => step.run?.includes("/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip"));
  const postTransferIndex = steps.findIndex((step) =>
    step.name === "Verify the transferred candidate and write release config"
  );
  const prepareIndex = steps.findIndex((step) => step.id === "prepare");
  const sequence = [
    packIndex,
    preUploadVerifyIndex,
    uploadIndex,
    authorityIndex,
    transferIndex,
    postTransferIndex,
    prepareIndex,
  ];
  if (
    sequence.some((index) => index < 0)
    || sequence.some((index, position) => position > 0 && index <= sequence[position - 1]!)
  ) {
    errors.push(
      "candidate preparation order must be pack, verify, upload, authenticate, transfer, verify/config, prepare",
    );
    return errors;
  }
  const verificationCommand =
    'node scripts/verify-candidate.mjs --directory "$CANDIDATE_DIRECTORY" --source "$CANDIDATE_SOURCE"';
  if (!steps[preUploadVerifyIndex]?.run?.includes(verificationCommand)) {
    errors.push("candidate must verify the packed bytes before upload");
  }
  const postTransfer = steps[postTransferIndex]?.run ?? "";
  const verificationIndex = postTransfer.indexOf(verificationCommand);
  const configIndex = postTransfer.indexOf("node scripts/write-release-config.mjs --manifest");
  if (verificationIndex < 0 || configIndex <= verificationIndex) {
    errors.push("candidate release config must be generated only after post-transfer verification");
  }
  return errors;
};

const qualifiedActionInputErrors = (workflow: Workflow): string[] => {
  const errors: string[] = [];
  const expected = {
    candidate: {
      env: { GITHUB_TOKEN: "${{ github.token }}" },
      with: { command: "prepare", config: "outputs/release.config.json" },
    },
    publish: {
      env: { GITHUB_TOKEN: "${{ github.token }}" },
      with: { command: "publish", prepared: "${{ inputs.prepared_ref }}" },
    },
  } as const;
  for (const jobName of ["candidate", "publish"] as const) {
    const actions = (workflow.jobs[jobName]?.steps ?? []).filter((step) => step.uses === qualifiedReleaseAction);
    if (actions.length !== 1) {
      errors.push(`${jobName} must invoke the qualified Action exactly once`);
      continue;
    }
    const action = actions[0]!;
    if (
      JSON.stringify(action.env) !== JSON.stringify(expected[jobName].env)
      || JSON.stringify(action.with) !== JSON.stringify(expected[jobName].with)
    ) {
      errors.push(`${jobName} qualified Action inputs must be literally exact`);
    }
  }
  return errors;
};

describe("tooling pins and workflow contracts", () => {
  it("keeps dependency automation bounded to the Bun workspace and compatible groups", async () => {
    const dependabot = parse(await readFile(resolve(root, ".github/dependabot.yml"), "utf8")) as {
      version: number;
      updates: Array<{
        "package-ecosystem": string;
        directory: string;
        schedule: { interval: string };
        "open-pull-requests-limit": number;
        groups: Record<string, { patterns: string[]; "update-types": string[] }>;
      }>;
    };
    expect(dependabot).toEqual({
      version: 2,
      updates: [{
        "package-ecosystem": "bun",
        directory: "/",
        schedule: { interval: "weekly" },
        "open-pull-requests-limit": 3,
        groups: {
          "effect-v4": {
            patterns: ["effect", "@effect/platform-*"],
            "update-types": ["minor", "patch"],
          },
          "compatible-dev-tooling": {
            patterns: ["@types/node", "dprint", "oxlint", "tstyche", "typescript", "vitest", "yaml"],
            "update-types": ["minor", "patch"],
          },
        },
      }],
    });
  });

  it("audits ordinary CI before quality, caches only Bun downloads, and keeps release cold", async () => {
    const manifest = await readJson("package.json") as { scripts: Record<string, string> };
    expect(manifest.scripts["audit:dependencies"]).toBe("bun audit --audit-level=high");
    expect(manifest.scripts["test:host:extra"]).toBeUndefined();

    const ci = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    const cacheAction = "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
    const installJobs = [
      "quality",
      "esbuild",
      "node-sea",
      "bun-bundle",
      "real-tools",
      "target-support",
      "publication-hosts",
    ];
    expect(
      Object.entries(ci.jobs)
        .filter(([, job]) => job.steps?.some((step) => step.uses === cacheAction))
        .map(([name]) => name),
    )
      .toEqual(installJobs);
    for (const name of installJobs) {
      const job = ci.jobs[name]!;
      expect(job.needs).toBe(name === "node-sea" ? "quality" : undefined);
      const installIndex = job.steps!.findIndex((step) => step.run === "bun install --frozen-lockfile");
      expect(installIndex).toBeGreaterThan(0);
      const cache = job.steps!.find((step) => step.uses === cacheAction);
      expect(cache?.with).toEqual({
        path: "${{ runner.temp }}/bun-install-cache",
        key:
          "bun-downloads-v1-${{ runner.os }}-${{ runner.arch }}-bun-1.3.14-node-24.14.1-${{ hashFiles('bun.lock') }}",
      });
      expect(cache?.with?.["restore-keys"]).toBeUndefined();
      expect(cache?.with?.path).not.toMatch(/node_modules|dist|artifact|tool/i);
      expect(job.steps![installIndex]!.env).toEqual({
        BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/bun-install-cache",
      });
      expect(job.steps!.filter((step) => step.env?.BUN_INSTALL_CACHE_DIR)).toHaveLength(1);
    }
    expect(ci.jobs["quality"]!.steps!.map((step) => step.run).indexOf("bun run audit:dependencies"))
      .toBeLessThan(ci.jobs["quality"]!.steps!.map((step) => step.run).indexOf("bun run verify"));
    const releaseSecurity = await readFile(resolve(root, "docs/release-security.md"), "utf8");
    expect(releaseSecurity).toMatch(/Dependabot.*Bun|Bun.*Dependabot/is);
    expect(releaseSecurity).toContain("bun audit --audit-level=high");
    expect(releaseSecurity).toMatch(/ordinary CI.*cache|cache.*ordinary CI/is);
    expect(releaseSecurity).toMatch(/release[\s\S]*(?:cold|uncached)|(?:cold|uncached)[\s\S]*release/i);
    expect(releaseSecurity).toMatch(/esbuild.*(?:exact|excluded from compatible)/i);
    expect(releaseSecurity).toMatch(/registry intelligence.*not.*proof|audit.*not.*proof/i);

    const release = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    for (const job of Object.values(release.jobs)) {
      expect(job.steps?.some((step) => step.uses === cacheAction)).toBe(false);
      expect(job.steps?.some((step) => step.env?.BUN_INSTALL_CACHE_DIR)).toBe(false);
      for (const setup of job.steps?.filter((step) => step.uses?.startsWith("actions/setup-node@")) ?? []) {
        expect(setup.with?.["package-manager-cache"]).toBe(false);
      }
    }
  });

  it("keeps Plan 042 implementation certification exact-head, complete, disjoint, and fail-closed", async () => {
    const workflowSource = await readFile(
      resolve(root, ".github/workflows/architecture-research.yml"),
      "utf8",
    );
    const workflow = parse(workflowSource) as Workflow;
    expect(createHash("sha256").update(workflowSource).digest("hex")).toBe(
      "a45349f686cb26597fe8e45db2f67acc7bb28b9b2470e3c0fdd601ceac73fef0",
    );
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    expect(workflow.env).toEqual({
      SOURCE_SHA: "${{ github.event.pull_request.head.sha || github.sha }}",
      CERTIFICATION_PROFILE: "effect-build/plan042-implementation@1",
    });
    expect(Object.keys(workflow.jobs)).toEqual(["plan042-implementation"]);

    const job = workflow.jobs["plan042-implementation"]!;
    expect(Object.keys(job).sort()).toEqual(["runs-on", "steps"]);
    expect(job["runs-on"]).toBe("ubuntu-24.04");
    const checkout = job.steps!.find((step) => step.uses === checkoutAction)!;
    expect(checkout.with).toEqual({
      ref: "${{ env.SOURCE_SHA }}",
      "persist-credentials": false,
      "fetch-depth": 0,
    });
    const setupBun = job.steps!.find((step) =>
      step.uses === "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6"
    )!;
    expect(setupBun.with).toEqual({ "bun-version": "1.3.14" });
    const runs = jobRuns(workflow, "plan042-implementation");
    const requiredRuns = [
      'test "$(bun --version)" = "1.3.14"',
      "bun install --frozen-lockfile",
      "node --test research/post-0.3/implementation/certification-contract.test.mjs",
      "bun run verify",
      "bun test research/post-0.3/r3-provider-compatibility.test.ts research/post-0.3/r4-author-laws.test.mjs",
      "node --test research/post-0.3/r7-matrix-laws.test.mjs",
      "node research/post-0.3/implementation/staged-external-author-adapter.mjs",
      "node research/post-0.3/implementation/staged-esbuild-adapter.mjs",
      "bun run test:integration:v04-bun",
      "node scripts/verify-v04-bun-target-support.mjs",
      "node research/post-0.3/implementation/staged-bun-adapter.mjs",
      "bun run test:integration:v04-deno",
      "node scripts/verify-v04-deno-target-support.mjs",
      "node research/post-0.3/implementation/staged-deno-adapter.mjs",
      "node research/post-0.3/implementation/certify-current-head.mjs",
    ];
    for (const run of requiredRuns) expect(runs).toContain(run);
    const runIndexes = requiredRuns.map((run) => job.steps!.findIndex((step) => step.run === run));
    expect(runIndexes.every((index) => index >= 0)).toBe(true);
    expect(runIndexes).toEqual([...runIndexes].sort((left, right) => left - right));
    for (const index of runIndexes) {
      const step = job.steps![index]!;
      expect(step.if).toBeUndefined();
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.shell).toBeUndefined();
    }
    const install = job.steps![runIndexes[1]!]!;
    expect(install.env).toEqual({ BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/bun-install-cache" });
    const certifier = job.steps!.find((step) => step.run?.includes("certify-current-head.mjs"))!;
    expect(certifier.env).toEqual({
      GITHUB_TOKEN: "${{ github.token }}",
      PLAN042_RECEIPTS_DIR: "${{ runner.temp }}/effect-build-plan042-implementation",
    });
    const denoTools = job.steps!.find((step) => step.id === "deno-tools")!;
    expect(denoTools.run).toBe('node scripts/provision-tool-assets.mjs >> "$GITHUB_OUTPUT"');
    expect(denoTools.env).toEqual({ EFFECT_BUILD_TOOL_DIR: "${{ runner.temp }}/effect-build-plan042-tools" });
    const denoVerification = job.steps!.find((step) =>
      step.name === "Verify exact Deno and denort participant selection"
    )!;
    expect(denoVerification.env).toEqual({
      DENO: "${{ steps.deno-tools.outputs.deno }}",
      DENORT: "${{ steps.deno-tools.outputs.denort }}",
    });
    for (
      const command of [
        "bun run test:integration:v04-deno",
        "node scripts/verify-v04-deno-target-support.mjs",
      ]
    ) {
      expect(job.steps!.find((step) => step.run === command)?.env).toEqual({
        PLAN042_DENO_EXECUTABLE: "${{ steps.deno-tools.outputs.deno }}",
        DENORT_BIN: "${{ steps.deno-tools.outputs.denort }}",
        DENO_DIR: "${{ runner.temp }}/effect-build-plan042-deno-cache",
      });
    }
    expect(job.steps!.find((step) => step.run === "node research/post-0.3/implementation/staged-deno-adapter.mjs")?.env)
      .toEqual({
        PLAN042_DENO_EXECUTABLE: "${{ steps.deno-tools.outputs.deno }}",
        DENORT_BIN: "${{ steps.deno-tools.outputs.denort }}",
        DENO_DIR: "${{ runner.temp }}/effect-build-plan042-deno-consumer-cache",
      });
    const upload = job.steps!.find((step) => step.uses === uploadArtifactAction)!;
    expect(upload.with).toEqual({
      name: "plan042-implementation-certification-${{ env.SOURCE_SHA }}",
      path: "${{ runner.temp }}/effect-build-plan042-implementation",
      "if-no-files-found": "error",
      "retention-days": 90,
    });
    const certifierSource = await readFile(
      resolve(root, "research/post-0.3/implementation/certify-current-head.mjs"),
      "utf8",
    );
    expect(certifierSource).toMatch(/process\.env\.GITHUB_ACTIONS[\s\S]*"true"/);
    for (
      const forbidden of [
        "surface-freeze",
        "plan039-phase-handoff",
        "PLAN039_RECEIPTS_DIR",
        "PLAN040_RECEIPTS_DIR",
        "PLAN041_RECEIPTS_DIR",
        "RESEARCH_RECEIPTS_DIR",
        "run-receipt-producers.mjs",
        "validate-receipts.mjs",
      ]
    ) expect(workflowSource).not.toContain(forbidden);

    const profile = await readJson("research/post-0.3/implementation/profile.json") as {
      profileId: string;
      phase: string;
      trustAnchor: string;
      handoffTrustAnchor: string;
      plan039TrustAnchor: string;
      plan040TrustAnchor: string;
      plan041TrustAnchor: string;
      expectedClaims: string;
      migrationPlan: string;
      receiptDirectoryEnvironment: string;
      certificateFile: string;
      currentReceiptIds: string[];
      historicalProfileIds: string[];
      forbiddenCurrentReceiptIds: string[];
      bunImplementationFiles: string[];
      denoImplementationFiles: string[];
      esbuildImplementationFiles: string[];
      coreStagedFiles: string[];
      immutablePublicPaths: string[];
      productionBaseline: {
        releaseSha: string;
        freezeSha: string;
        handoffSha: string;
        plan039Sha: string;
        plan040Sha: string;
        plan041Sha: string;
      };
      producers: Array<{ script: string; receipts: string[] }>;
    };
    const freezeAnchor = await readJson(profile.trustAnchor) as {
      profileId: string;
      sourceSha: string;
      workflow: { runId: string; runAttempt: string };
      aggregateArtifact: { id: string; digest: string };
      certification: { digest: string };
      receipts: Array<{ id: string; file: string; digest: string }>;
    };
    const plan039Anchor = await readJson(profile.plan039TrustAnchor) as {
      profileId: string;
      sourceSha: string;
      workflow: { runId: string; runAttempt: string; conclusion: string };
      aggregateArtifact: { id: string; name: string; sizeInBytes: number; digest: string };
      certification: { digest: string; phase: string };
      receipt: { id: string; file: string; digest: string };
      freezeInput: {
        sourceSha: string;
        aggregateArtifactId: string;
        certificationDigest: string;
        receiptCount: number;
      };
      handoffInput: { sourceSha: string; aggregateArtifactId: string };
    };
    const plan040Anchor = await readJson(profile.plan040TrustAnchor) as {
      profileId: string;
      sourceSha: string;
      workflow: { runId: string; runAttempt: string; conclusion: string };
      aggregateArtifact: { id: string; name: string; sizeInBytes: number; digest: string };
      certification: { digest: string; phase: string };
      receipt: { id: string; file: string; digest: string };
      plan039Input: { sourceSha: string; aggregateArtifactId: string };
    };
    const plan041Anchor = await readJson(profile.plan041TrustAnchor) as {
      profileId: string;
      sourceSha: string;
      workflow: { runId: string; runAttempt: string; eventName: string; conclusion: string };
      aggregateArtifact: { id: string; name: string; sizeInBytes: number; digest: string };
      certification: { digest: string; phase: string };
      receipt: { id: string; file: string; digest: string };
      plan040Input: { sourceSha: string; aggregateArtifactId: string };
    };
    const expected = await readJson(profile.expectedClaims) as {
      profileId: string;
      receiptId: string;
      claims: Array<{ id: string }>;
    };
    expect(profile).toMatchObject({
      profileId: "effect-build/plan042-implementation@1",
      phase: "implementation",
      receiptDirectoryEnvironment: "PLAN042_RECEIPTS_DIR",
      certificateFile: "plan042-certification.json",
      currentReceiptIds: ["plan042-implementation"],
      historicalProfileIds: [
        "effect-build/plan041-implementation@1",
        "effect-build/plan040-implementation@1",
        "effect-build/plan039-implementation@1",
        "post-0.3-surface-freeze-v1",
      ],
      forbiddenCurrentReceiptIds: [
        "plan041-implementation",
        "plan040-implementation",
        "plan039-implementation",
        "plan039-phase-handoff",
        "surface-freeze",
      ],
      productionBaseline: {
        releaseSha: "f06f96ca88b6278e5f23a898d758b99fa9322108",
        freezeSha: "a3017657e0851530892a9f3d2d55ac5736769881",
        handoffSha: "7de4ffe68931f721317f6be92aac1e01dae6e21e",
        plan039Sha: "e12e930de5622be3f23814f3235293c93fcfd8bf",
        plan040Sha: "3ced06d29fe8644eae5465fed4878a6faea322f3",
        plan041Sha: "2048fcd4c49bc6e5b76cabceee33b36d9d5efb40",
      },
    });
    expect(profile.producers).toEqual([{
      lane: "implementation",
      script: "research/post-0.3/implementation/certify-current-head.mjs",
      receipts: ["plan042-implementation"],
    }]);
    expect(profile.bunImplementationFiles).toEqual([
      "packages/effect-build-bun/src/CompileExecutable.ts",
      "packages/effect-build-bun/src/internal/v04/compatibility.ts",
      "packages/effect-build-bun/src/internal/v04/executable.ts",
      "packages/effect-build-bun/src/internal/v04/matrix.ts",
      "packages/effect-build-bun/src/internal/v04/selected.ts",
    ]);
    expect(profile.denoImplementationFiles).toEqual([
      "packages/effect-build-deno/src/CompileExecutable.ts",
      "packages/effect-build-deno/src/internal/v04/compatibility.ts",
      "packages/effect-build-deno/src/internal/v04/executable.ts",
      "packages/effect-build-deno/src/internal/v04/matrix.ts",
      "packages/effect-build-deno/src/internal/v04/selected.ts",
    ]);
    expect(profile.esbuildImplementationFiles).toHaveLength(4);
    expect(profile.coreStagedFiles).toEqual([
      "packages/effect-build/src/Artifact.ts",
      "packages/effect-build/src/Author/BorrowedOutput.ts",
      "packages/effect-build/src/Author/Executable.ts",
      "packages/effect-build/src/Author/Tool.ts",
      "packages/effect-build/src/Matrix.ts",
      "packages/effect-build/src/SystemTarget.ts",
    ]);
    expect(freezeAnchor.profileId).not.toBe(profile.profileId);
    expect(freezeAnchor.sourceSha).toBe("a3017657e0851530892a9f3d2d55ac5736769881");
    expect(freezeAnchor.workflow).toMatchObject({ runId: "32502909677", runAttempt: "1" });
    expect(freezeAnchor.aggregateArtifact).toMatchObject({
      id: "9454270941",
      digest: "sha256:a502ab64e0cda8fb743f3f6175dfcde4c098eeb9546cc98173a7a6b339002233",
    });
    expect(freezeAnchor.receipts).toHaveLength(20);
    expect(freezeAnchor.receipts.map((receipt) => receipt.id)).toContain("surface-freeze");
    expect(plan039Anchor).toMatchObject({
      profileId: "effect-build/plan039-implementation@1",
      sourceSha: "e12e930de5622be3f23814f3235293c93fcfd8bf",
      workflow: { runId: "32514192057", runAttempt: "1", conclusion: "success" },
      aggregateArtifact: {
        id: "9458198780",
        name: "plan039-implementation-certification-e12e930de5622be3f23814f3235293c93fcfd8bf",
        sizeInBytes: 4021,
        digest: "sha256:d8398357cebab738a693e55944f0e60a311f6509e65ce3585d524e5227943a5b",
      },
      certification: { phase: "implementation" },
      receipt: { id: "plan039-implementation", file: "plan039-implementation.json" },
    });
    expect(plan039Anchor.freezeInput).toMatchObject({
      sourceSha: freezeAnchor.sourceSha,
      aggregateArtifactId: freezeAnchor.aggregateArtifact.id,
      certificationDigest: freezeAnchor.certification.digest,
      receiptCount: 20,
    });
    expect(plan039Anchor.handoffInput).toMatchObject({
      sourceSha: "7de4ffe68931f721317f6be92aac1e01dae6e21e",
      aggregateArtifactId: "9455113555",
    });
    expect(plan040Anchor).toMatchObject({
      profileId: "effect-build/plan040-implementation@1",
      sourceSha: "3ced06d29fe8644eae5465fed4878a6faea322f3",
      workflow: { runId: "32585389513", runAttempt: "1", conclusion: "success" },
      aggregateArtifact: {
        id: "9478924759",
        name: "plan040-implementation-certification-3ced06d29fe8644eae5465fed4878a6faea322f3",
        sizeInBytes: 4620,
        digest: "sha256:474cf45b62c3447e48a247940973f87bedab53c3a013d897ea069200dcb68ebc",
      },
      certification: { phase: "implementation" },
      receipt: { id: "plan040-implementation", file: "plan040-implementation.json" },
      plan039Input: {
        sourceSha: plan039Anchor.sourceSha,
        aggregateArtifactId: plan039Anchor.aggregateArtifact.id,
      },
    });
    expect(plan041Anchor).toMatchObject({
      profileId: "effect-build/plan041-implementation@1",
      sourceSha: "2048fcd4c49bc6e5b76cabceee33b36d9d5efb40",
      workflow: {
        runId: "32598492666",
        runAttempt: "1",
        eventName: "pull_request",
        conclusion: "success",
      },
      aggregateArtifact: {
        id: "9482238619",
        name: "plan041-implementation-certification-2048fcd4c49bc6e5b76cabceee33b36d9d5efb40",
        sizeInBytes: 5885,
        digest: "sha256:4c54dc0458a5811ce5008795b3988427c8b98b5a902caae2ff968862dd27c545",
      },
      certification: { phase: "implementation" },
      receipt: { id: "plan041-implementation", file: "plan041-implementation.json" },
      plan040Input: {
        sourceSha: plan040Anchor.sourceSha,
        aggregateArtifactId: plan040Anchor.aggregateArtifact.id,
      },
    });
    expect(expected).toMatchObject({
      profileId: profile.profileId,
      receiptId: "plan042-implementation",
    });
    expect(expected.claims).toHaveLength(4);
    expect(expected.claims.flatMap((claim) => Object.values(claim)).join(" ")).toContain(
      "five-bun-files-are-byte-identical-to-plan041",
    );
  });

  it("certifies the exact five-file Plan 042 boundary from the certified Plan 041 head to DONE", async () => {
    const profile = await readJson("research/post-0.3/implementation/profile.json") as {
      implementationAllowedPaths: string[];
      bunImplementationFiles: string[];
      denoImplementationFiles: string[];
      esbuildImplementationFiles: string[];
      coreStagedFiles: string[];
      immutablePublicPaths: string[];
      productionBaseline: {
        releaseSha: string;
        freezeSha: string;
        handoffSha: string;
        plan039Sha: string;
        plan040Sha: string;
        plan041Sha: string;
      };
    };
    const { handoffSha, plan039Sha, plan040Sha, plan041Sha, releaseSha, freezeSha } = profile.productionBaseline;
    for (
      const [ancestor, descendant] of [
        [releaseSha, freezeSha],
        [freezeSha, handoffSha],
        [handoffSha, plan039Sha],
        [plan039Sha, plan040Sha],
        [plan040Sha, plan041Sha],
        [plan041Sha, "HEAD"],
      ] as const
    ) {
      expect(() =>
        execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
          cwd: root,
          stdio: "pipe",
        })
      ).not.toThrow();
    }

    const nulPaths = (value: Buffer | string) => value.toString().split("\0").filter((path) => path.length > 0);
    const trackedChanged = nulPaths(execFileSync("git", ["diff", "--name-only", "-z", handoffSha, "--", "."], {
      cwd: root,
    }));
    const untracked = nulPaths(execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
    }));
    const changedPaths = [...new Set([...trackedChanged, ...untracked])].sort();
    const allowed = (path: string) =>
      profile.implementationAllowedPaths.some((entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry);
    expect(changedPaths.length).toBeGreaterThan(0);
    expect(changedPaths.filter((path) => !allowed(path))).toEqual([]);

    const trackedImplementation = nulPaths(execFileSync(
      "git",
      ["diff", "--name-only", "-z", "--diff-filter=AM", plan041Sha, "--", ...profile.denoImplementationFiles],
      { cwd: root },
    ));
    const implementationFiles = [
      ...new Set([
        ...trackedImplementation,
        ...untracked.filter((path) => profile.denoImplementationFiles.includes(path)),
      ]),
    ].sort();
    expect(implementationFiles).toEqual([...profile.denoImplementationFiles].sort());
    expect(implementationFiles.every((path) => existsSync(resolve(root, path)))).toBe(true);

    const coreStagedDiff = nulPaths(execFileSync(
      "git",
      ["diff", "--name-only", "-z", plan039Sha, "--", ...profile.coreStagedFiles],
      { cwd: root },
    ));
    expect([
      ...new Set([
        ...coreStagedDiff,
        ...untracked.filter((path) => profile.coreStagedFiles.includes(path)),
      ]),
    ]).toEqual([]);

    const esbuildStagedDiff = nulPaths(execFileSync(
      "git",
      ["diff", "--name-only", "-z", plan040Sha, "--", ...profile.esbuildImplementationFiles],
      { cwd: root },
    ));
    expect(esbuildStagedDiff).toEqual([]);

    const bunStagedDiff = nulPaths(execFileSync(
      "git",
      ["diff", "--name-only", "-z", plan041Sha, "--", ...profile.bunImplementationFiles],
      { cwd: root },
    ));
    expect(bunStagedDiff).toEqual([]);

    const immutableDiff = nulPaths(execFileSync(
      "git",
      ["diff", "--name-only", "-z", handoffSha, "--", ...profile.immutablePublicPaths],
      { cwd: root },
    ));
    expect([
      ...new Set([
        ...immutableDiff,
        ...untracked.filter((path) => profile.immutablePublicPaths.includes(path)),
      ]),
    ]).toEqual([]);

    const migrationPlan = await readJson("research/post-0.3/implementation/core-migration-plan.json") as {
      authorityCount: number;
      authoritySetSha256: string;
      legacySourceFiles: Array<{ path: string; action: string }>;
      stagingRules: { compatibilityDelegates: string; secondPublicPaths: string };
    };
    expect(migrationPlan).toMatchObject({
      authorityCount: 71,
      authoritySetSha256: "a0bdf3b59a1a85bbc448decd0186e29c0fabe7c04e3203ff6657af5f746bb3fe",
      stagingRules: { compatibilityDelegates: "forbidden", secondPublicPaths: "forbidden" },
    });
    expect(
      migrationPlan.legacySourceFiles.every((entry) =>
        entry.action === "delete-at-plan044" || entry.action === "replace-at-plan044"
      ),
    ).toBe(true);
    expect(() =>
      execFileSync(
        "git",
        ["diff", "--exit-code", handoffSha, "--", ...migrationPlan.legacySourceFiles.map((entry) => entry.path)],
        { cwd: root, stdio: "pipe" },
      )
    ).not.toThrow();

    const plan = await readFile(resolve(root, "plans/042-add-deno-bundle-command-lanes.md"), "utf8");
    const index = await readFile(resolve(root, "plans/README.md"), "utf8");
    expect(plan.match(/^- Status: DONE$/gm) ?? []).toHaveLength(1);
    expect(index).toContain(
      "| 039 | Implement the frozen core capability laws | P0 | XL | exact 0.4 surface freeze | DONE |",
    );
    expect(index).toContain(
      "| 040 | Implement the admitted Esbuild operations | P1 | L | 039 | DONE |",
    );
    expect(index).toContain(
      "| 041 | Implement the frozen Bun executable lane | P1 | L | 039 | DONE |",
    );
    expect(index).toContain(
      "| 042 | Implement the frozen Deno executable lane | P1 | L | 039 | DONE |",
    );
    expect(index).toContain(
      "| 043 | Implement direct Node SEA assembly | P1 | L | 039 | TODO |",
    );
  });

  it("makes specialized node-sea CI depend on quality without retaining full verification", async () => {
    const ci = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(ci.jobs["node-sea"]?.needs).toBe("quality");
    expect(jobRuns(ci, "node-sea")).not.toContain("bun run verify");
    expect(jobRuns(ci, "node-sea")).toContain("bun run build");
    expect(jobRuns(ci, "node-sea")).toContain("bun run test:integration:node-sea");
  });

  it("validates the authored 12-cell Bun/Deno support matrix against integration-local authority", async () => {
    const support = await readJson("tooling/support-matrix.json") as unknown as SupportMatrix;
    const { validateSupportMatrix } = await loadScript<{ validateSupportMatrix: (value: unknown) => unknown }>(
      "read-tooling.mjs",
    );
    expect(() => validateSupportMatrix(support)).not.toThrow();
    expect(support.supportedCells).toHaveLength(12);

    const targets = Object.fromEntries(
      await Promise.all(["bun", "deno"].map(async (compiler) => {
        const provider = await import(
          pathToFileURL(resolve(root, `packages/effect-build-${compiler}/dist/index.js`)).href
        ) as { Target: { literals: readonly string[] } };
        return [compiler, provider.Target.literals] as const;
      })),
    ) as Record<string, readonly string[]>;
    for (const compiler of ["bun", "deno"]) {
      expect(support.supportedCells.filter((cell) => cell.compiler === compiler).map((cell) => cell.target)).toEqual(
        targets[compiler],
      );
    }

    const malformed = structuredClone(support);
    malformed.supportedCells[0]!.compiler = "other";
    expect(() => validateSupportMatrix(malformed)).toThrow(/unknown compiler/);
    const duplicate = structuredClone(support);
    duplicate.supportedCells.push({ ...duplicate.supportedCells[0]! });
    expect(() => validateSupportMatrix(duplicate)).toThrow(/duplicate/);
    const unordered = structuredClone(support);
    unordered.supportedCells.reverse();
    expect(() => validateSupportMatrix(unordered)).toThrow(/ordered bun then deno|canonical target order/);
  });

  it("keeps provisioned compiler fixtures selected, checksummed, and closed", async () => {
    const provisioner = await loadScript<{
      selectedToolNames: (argv: readonly string[]) => readonly string[];
      provisionToolAssets: (
        argv: readonly string[],
        dependencies: Record<string, unknown>,
      ) => Promise<Map<string, string>>;
    }>("provision-tool-assets.mjs");
    expect(provisioner.selectedToolNames([])).toEqual(["bun", "deno", "denort"]);
    expect(provisioner.selectedToolNames(["--only", "bun"])).toEqual(["bun"]);
    expect(provisioner.selectedToolNames(["--only", "deno"])).toEqual(["deno"]);
    for (const argv of [["--only"], ["--only", "node-sea"], ["--url", "x"]]) {
      expect(() => provisioner.selectedToolNames(argv)).toThrow(/usage/);
    }

    const bytes = new TextEncoder().encode("fixture");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const pins = ["bun", "deno", "denort"].map((tool) => ({
      tool,
      version: "1.0.0",
      url: `https://fixtures.invalid/${tool}.zip`,
      sha256,
      member: tool,
    }));
    const stored = new Map<string, Uint8Array>();
    const result = await provisioner.provisionToolAssets(["--only", "bun"], {
      environment: { EFFECT_BUILD_TOOL_DIR: "/tmp/effect-build-provision-fixture" },
      loadTooling: async () => ({ pins: { tools: pins } }),
      fetchAsset: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }),
      execute: async (_command: string, argv: readonly string[]) => ({
        stdout: argv.includes("-Z1") ? "bun\n" : "",
        stderr: "",
      }),
      makeDirectory: async () => undefined,
      writeAsset: async (path: string, value: Uint8Array) => void stored.set(path, value),
      readAsset: async (path: string) => stored.get(path),
      makeExecutable: async () => undefined,
      output: () => undefined,
    });
    expect([...result.keys()]).toEqual(["bun"]);
    const authored = await readJson("tooling/tool-pins.json") as { tools: Array<Record<string, string>> };
    expect(authored.tools.map((pin) => pin.tool)).toEqual(["bun", "deno", "denort"]);
    for (const pin of authored.tools) expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("runs all target cells through exact Bun 1.3.14 and cleans isolated tool state", async () => {
    const verifier = await loadScript<{
      parseCompiler: (argv: readonly string[]) => string | undefined;
      packageManagerInvocation: (
        environment: Record<string, string | undefined>,
        access?: (path: string, mode: number) => Promise<void>,
        probe?: (path: string) => Promise<{ stdout: string }>,
      ) => Promise<{ executable: string }>;
      verifyTargetSupport: (options: Record<string, unknown>) => Promise<{ attempted: number; failures: string[] }>;
    }>("verify-target-support.mjs");
    expect(verifier.parseCompiler([])).toBeUndefined();
    expect(verifier.parseCompiler(["--compiler", "bun"])).toBe("bun");
    expect(() => verifier.parseCompiler(["--compiler", "node-sea"])).toThrow(/usage/);
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/bun" },
      async () => undefined,
      async () => ({ stdout: "1.3.14\n" }),
    )).resolves.toEqual({ executable: "/tools/bun" });
    await expect(verifier.packageManagerInvocation(
      { npm_execpath: "/tools/pnpm" },
      async () => undefined,
      async () => ({ stdout: "1.3.14\n" }),
    )).rejects.toThrow(/identify Bun/);

    const calls: Array<{ executable: string; argv: readonly string[]; env: Record<string, string> }> = [];
    let cleaned = "";
    const result = await verifier.verifyTargetSupport({
      platform: "linux",
      architecture: "x64",
      environment: { PATH: "/tools" },
      packageManager: { executable: "/tools/bun" },
      execute: async (executable: string, argv: readonly string[], options: { env: Record<string, string> }) => {
        calls.push({ executable, argv, env: options.env });
        if (argv[0]?.endsWith("provision-tool-assets.mjs")) {
          return { stdout: `${argv.at(-1)}=/tmp/${argv.at(-1)}\n`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      makeTemporaryDirectory: async () => "/tmp/effect-build-target-verifier-fixture",
      removeDirectory: async (path: string) => void (cleaned = path),
      log: () => undefined,
    });
    expect(result).toEqual({ attempted: 12, failures: [] });
    const cells = calls.filter(({ argv }) => argv.includes("test:integration:target"));
    expect(cells).toHaveLength(12);
    expect(cells.every(({ executable, argv }) => executable === "/tools/bun" && argv[0] === "run")).toBe(true);
    expect(cleaned).toBe("/tmp/effect-build-target-verifier-fixture");
  });

  it("pins the exact Effect family and every public package contract", async () => {
    const rootManifest = await readJson("package.json") as {
      private: boolean;
      packageManager: string;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(rootManifest.private).toBe(true);
    expect(rootManifest.packageManager).toBe("bun@1.3.14");
    for (const dependency of ["effect", "@effect/platform-bun", "@effect/platform-deno", "@effect/platform-node"]) {
      expect(rootManifest.devDependencies[dependency]).toBe("4.0.0-rc.108");
    }
    expect(rootManifest.scripts["verify:effect"]).toBe("node scripts/verify-effect-compatibility.mjs --all");
    expect(rootManifest.scripts["test:integration:node-sea"]).toBe("vitest run test/integration/node-sea.test.ts");
    expect(rootManifest.scripts["test:integration:bun-bundle"]).toBe(
      "vitest run test/integration/bun-bundle.test.ts",
    );
    expect(rootManifest.scripts["test:integration:bun-node-sea"]).toBe(
      "vitest run test/integration/bun-node-sea.test.ts",
    );
    expect(rootManifest.scripts["test:unit"]).toContain("test/unit/bun-bundle.test.ts");
    expect(rootManifest.scripts["test:unit"]).toContain("test/unit/bun-node-sea-pipeline.test.ts");
    expect(rootManifest.devDependencies.vitest).toBe("3.2.6");

    for (const name of publicPackages) {
      const manifest = await readJson(`packages/${name}/package.json`) as {
        version: string;
        peerDependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(manifest.version).toBe("0.3.0");
      expect(manifest.peerDependencies).toEqual({ effect: ">=4.0.0-beta.104 <4.1.0-0" });
      expect(manifest.devDependencies.effect).toBe("4.0.0-rc.108");
    }
    const esbuild = await readJson("packages/effect-build-esbuild/package.json") as {
      dependencies: Record<string, string>;
    };
    expect(esbuild.dependencies).toEqual({ "effect-build": "workspace:^", esbuild: "0.28.2" });
    const nodeSea = await readJson("packages/effect-build-node-sea/package.json") as {
      dependencies: Record<string, string>;
    };
    expect(nodeSea.dependencies).toEqual({ "effect-build": "workspace:^" });
  });

  it("keeps Esbuild and Node SEA independent with exact producer literals", async () => {
    const nodeSea = await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/NodeSea.ts"), "utf8");
    const esbuild = await readFile(resolve(root, "packages/effect-build-esbuild/src/internal/Esbuild.ts"), "utf8");
    expect(nodeSea).toMatch(/nodeSeaVersion\s*=\s*"26\.7\.0"\s+as const/);
    expect(nodeSea).toMatch(/nodeSeaTarget\s*=\s*"linux-x64-gnu"\s+as const/);
    expect(esbuild).toMatch(/expectedVersion\s*=\s*"0\.28\.2"\s+as const/);
    expect(esbuild).toMatch(/nodeSyntaxTarget\s*=\s*"node26\.7"\s+as const/);
    expect(nodeSea).toContain('"--check"');
    expect(nodeSea).toContain("privateMainPath");
    expect(nodeSea).not.toMatch(/Esbuild|esbuild|compileExecutableMatrix|Composed/);
    await expect(
      readFile(resolve(root, "packages/effect-build-node-sea/src/internal/Esbuild.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(resolve(root, "packages/effect-build-node-sea/src/Adapter.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(`${nodeSea}\n${esbuild}`).not.toMatch(/postject|download|curl|wget|https?:\/\//i);
  });

  it("keeps Effect endpoint verification exact, Bun-only, and isolated", async () => {
    const verifier = await loadScript<{
      effectEndpoints: readonly string[];
      parseArguments: (argv: readonly string[]) => readonly string[];
      rewriteManifest: (manifest: Record<string, unknown>, version: string) => Record<string, unknown>;
      shouldCopyRepositoryPath: (path: string) => boolean;
      verifyEffectEndpoint: (version: string, dependencies: Record<string, unknown>) => Promise<void>;
    }>("verify-effect-compatibility.mjs");
    expect(verifier.effectEndpoints).toEqual(effectEndpoints);
    expect(verifier.parseArguments(["--all"])).toEqual(effectEndpoints);
    for (const endpoint of effectEndpoints) {
      expect(verifier.parseArguments(["--effect-version", endpoint])).toEqual([endpoint]);
    }
    for (const argv of [[], ["--effect-version", "4.0.0-beta.103"], ["--all", "extra"]]) {
      expect(() => verifier.parseArguments(argv)).toThrow(/exact Effect endpoints/);
    }
    const manifest = {
      peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
      devDependencies: { effect: "old", typescript: "6.0.3" },
    };
    const rewritten = verifier.rewriteManifest(manifest, effectEndpoints[0]!) as typeof manifest;
    expect(rewritten.peerDependencies).toEqual(manifest.peerDependencies);
    expect(rewritten.devDependencies).toEqual({ effect: effectEndpoints[0], typescript: "6.0.3" });
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "node_modules/effect"))).toBe(false);
    expect(verifier.shouldCopyRepositoryPath(resolve(root, "packages/effect-build/src/index.ts"))).toBe(true);

    const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-effect-compatibility-"));
    const calls: Array<{ executable: string; argv: readonly string[]; cwd: string; env: Record<string, string> }> = [];
    await verifier.verifyEffectEndpoint(effectEndpoints[0]!, {
      makeTemporaryDirectory: async () => temporaryRoot,
      copyRepository: async (destination: string) => {
        for (
          const path of [
            "packages/effect-build/package.json",
            "packages/effect-build-bun/package.json",
            "packages/effect-build-deno/package.json",
            "packages/effect-build-esbuild/package.json",
            "packages/effect-build-node-sea/package.json",
            "examples/bun/package.json",
            "examples/deno/package.json",
            "examples/esbuild/package.json",
            "examples/node-sea/package.json",
          ]
        ) {
          await mkdir(resolve(destination, path, ".."), { recursive: true });
          await writeFile(resolve(destination, path), `${JSON.stringify(manifest)}\n`);
        }
        await writeFile(resolve(destination, "package.json"), `${JSON.stringify(manifest)}\n`);
      },
      packageManager: { executable: "/fixture/bun" },
      environment: { PATH: "/fixture", SENTINEL: "preserved" },
      execute: async (
        executable: string,
        argv: readonly string[],
        options: { cwd: string; env: Record<string, string> },
      ) => {
        calls.push({ executable, argv, cwd: options.cwd, env: options.env });
      },
      removeDirectory: async (path: string) => rm(path, { recursive: true, force: true }),
    });
    expect(calls.map(({ argv }) => argv)).toEqual([
      ["install", "--cache-dir", resolve(temporaryRoot, "cache/bun")],
      ["run", "build"],
      ["run", "check"],
      ["run", "test:types"],
      ["run", "test:unit"],
      ["run", "test:consumer:fresh"],
    ]);
    expect(calls.every(({ executable, cwd, env }) =>
      executable === "/fixture/bun"
      && cwd === resolve(temporaryRoot, "repository")
      && env.SENTINEL === "preserved"
      && env.BUN_INSTALL_CACHE_DIR === resolve(temporaryRoot, "cache/bun")
    )).toBe(true);
  });

  it("independently rejects incomplete, extra, changed, and wrong-source candidates", async () => {
    const verifier = await loadScript<{
      parseArguments: (argv: readonly string[]) => { directory: string; source: string };
      verifyCandidate: (
        input: { directory: string; source: string },
        dependencies?: Record<string, unknown>,
      ) => Promise<unknown>;
    }>("verify-candidate.mjs");
    const source = "a".repeat(40);
    const directory = await mkdtemp(join(tmpdir(), "effect-build-candidate-verifier-"));
    const names = [...publicPackages];
    const filenames = names.map((name) => `${name}-0.3.0.tgz`);
    const dependenciesFor = (name: string): Record<string, string> =>
      name === "effect-build"
        ? {}
        : name === "effect-build-esbuild"
        ? { "effect-build": "^0.3.0", esbuild: "0.28.2" }
        : { "effect-build": "^0.3.0" };
    const contents = new Map<string, Uint8Array>();
    try {
      const records = [];
      for (const [index, name] of names.entries()) {
        const filename = filenames[index]!;
        const bytes = new TextEncoder().encode(`fixture:${name}`);
        contents.set(filename, bytes);
        await writeFile(join(directory, filename), bytes);
        records.push({
          filename,
          name,
          version: "0.3.0",
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          dependencies: dependenciesFor(name),
          peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
          optionalDependencies: {},
        });
      }
      const inspectTarball = async (tarball: string) => {
        const filename = tarball.slice(tarball.lastIndexOf("/") + 1);
        const name = filenames.includes(filename) ? names[filenames.indexOf(filename)]! : "";
        const exports = name === "effect-build"
          ? {
            ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
            "./Integration": { types: "./dist/Integration.d.ts", import: "./dist/Integration.js" },
            "./Provider": { types: "./dist/Provider.d.ts", import: "./dist/Provider.js" },
          }
          : { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } };
        return {
          manifest: {
            name,
            version: "0.3.0",
            dependencies: dependenciesFor(name),
            peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
            exports,
          },
          entries: Object.values(exports).flatMap((entry) => [
            `package/${entry.types.slice(2)}`,
            `package/${entry.import.slice(2)}`,
          ]),
        };
      };
      const input = verifier.parseArguments(["--directory", directory, "--source", source]);
      const consumers = consumerFixtures.map((fixture, index) => ({
        fixture,
        installer: fixture.startsWith("npm-") ? "npm@11.11.0" : "bun@1.3.14",
        lockfile: fixture.startsWith("npm-") ? "package-lock.json" : "bun.lock",
        lockSha256: index.toString(16).padStart(64, "0"),
        treeSha256: (index + consumerFixtures.length).toString(16).padStart(64, "0"),
      }));
      // Locks and trees are intentionally not candidate artifacts. This
      // independent verifier checks the producer observation schema/order;
      // the producer's real 14-fixture run establishes their values.
      const candidateManifest = { version: 2, source, packages: records, consumers };
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(candidateManifest, null, 2)}\n`);
      await expect(verifier.verifyCandidate(input, { inspectTarball })).resolves.toEqual({
        source,
        packages: 5,
        consumers: 14,
      });

      for (
        const malformed of [
          { ...candidateManifest, consumers: consumers.slice(0, -1) },
          { ...candidateManifest, consumers: [consumers[1], consumers[0], ...consumers.slice(2)] },
          { ...candidateManifest, consumers: [...consumers.slice(0, -1), consumers[0]] },
          {
            ...candidateManifest,
            consumers: consumers.map((record, index) => index === 0 ? { ...record, lockSha256: "ABC" } : record),
          },
        ]
      ) {
        await writeFile(join(directory, "manifest.json"), `${JSON.stringify(malformed, null, 2)}\n`);
        await expect(verifier.verifyCandidate(input, { inspectTarball })).rejects.toThrow(/consumer/);
      }
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(candidateManifest, null, 2)}\n`);

      await rm(join(directory, filenames[0]!));
      await expect(verifier.verifyCandidate(input, { inspectTarball })).rejects.toThrow(/inventory/);
      await writeFile(join(directory, filenames[0]!), contents.get(filenames[0]!)!);

      await writeFile(join(directory, "extra"), "unexpected");
      await expect(verifier.verifyCandidate(input, { inspectTarball })).rejects.toThrow(/inventory/);
      await rm(join(directory, "extra"));

      await writeFile(join(directory, filenames[1]!), "changed");
      await expect(verifier.verifyCandidate(input, { inspectTarball })).rejects.toThrow(/size|SHA-256/);
      await writeFile(join(directory, filenames[1]!), contents.get(filenames[1]!)!);

      await expect(
        verifier.verifyCandidate({ directory, source: "b".repeat(40) }, { inspectTarball }),
      ).rejects.toThrow(/source/);
      expect(() => verifier.parseArguments(["--directory", directory, "--source", "ABC"])).toThrow(/usage/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires every independent CI axis with exact Bun setup and no escape hatches", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    expect(workflowAuthorityErrors(workflow, "ci")).toEqual([]);
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual([
      "quality",
      "esbuild",
      "node-sea",
      "bun-bundle",
      "real-tools",
      "target-support",
      "effect-compatibility",
      "publication-hosts",
    ]);
    expectPinnedActionsWithoutEscapes(workflow);
    for (const job of Object.keys(workflow.jobs)) {
      expect(JSON.stringify(workflow.jobs[job])).not.toMatch(/pnpm|yarn|continue-on-error/i);
    }
    expect(jobRuns(workflow, "quality")).toContain("bun run verify");
    expect(jobRuns(workflow, "esbuild")).toContain("test/unit/esbuild-bundle.test.ts");
    expect(jobRuns(workflow, "esbuild")).toContain("node scripts/test-built-consumer.mjs --built");
    expect(jobRuns(workflow, "bun-bundle")).toContain("bun run test:integration:bun-bundle");
    expect(jobRuns(workflow, "bun-bundle")).toContain("bun run test:integration:bun-node-sea");
    expect(jobRuns(workflow, "bun-bundle")).toContain('test "$(bun --version)" = "1.3.14"');
    expect(jobRuns(workflow, "bun-bundle")).toContain('test "$("$selected_bun" --version)" = "1.3.9"');
    expect(jobRuns(workflow, "bun-bundle")).toContain('test "$("$selected_node" --version)" = "v26.7.0"');
    expect(jobRuns(workflow, "real-tools")).toContain("bun run verify:real");
    expect(workflow.jobs["target-support"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { compiler: ["bun", "deno"] },
    });
    expect(workflow.jobs["effect-compatibility"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { effect: effectEndpoints },
    });
    const support = await readJson("tooling/support-matrix.json") as unknown as SupportMatrix;
    expect(workflow.jobs["publication-hosts"]?.strategy?.matrix?.runner).toEqual(support.publicationHosts);
    expect(jobRuns(workflow, "node-sea")).toContain('test "$(node --version)" = "v26.7.0"');
    expect(jobRuns(workflow, "node-sea")).toContain("bun run test:integration:node-sea");
    expect(workflow.jobs["node-sea"]?.steps?.find((step) => step.run === "bun run test:integration:node-sea")?.env)
      .toEqual({ EFFECT_BUILD_NODE_SEA_BIN: "${{ steps.node26.outputs.path }}" });
  });

  it("closes release dispatch around one exact candidate or one authenticated publication", async () => {
    const workflow = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    expect(workflowAuthorityErrors(workflow, "release")).toEqual([]);
    expect(workflow.on).toEqual({
      workflow_dispatch: {
        inputs: {
          command: {
            description: "Candidate preparation or exact prepared publication",
            required: true,
            default: "candidate",
            type: "choice",
            options: ["candidate", "publish"],
          },
          commit: {
            description: "Exact workflow and candidate source commit",
            required: true,
            type: "string",
          },
          candidate_run_id: {
            description: "Successful candidate workflow run ID; publish only",
            required: false,
            default: "",
            type: "string",
          },
          candidate_artifact_id: {
            description: "Raw candidate artifact ID; publish only",
            required: false,
            default: "",
            type: "string",
          },
          candidate_artifact_digest: {
            description: "Raw candidate artifact sha256 digest; publish only",
            required: false,
            default: "",
            type: "string",
          },
          prepared_ref: {
            description: "Qualified Action prepared:gha reference; publish only",
            required: false,
            default: "",
            type: "string",
          },
        },
      },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    const candidateChecks = ["candidate-gates", "node-sea", "bun-bundle"];
    const candidateGateMatrix = [
      { gate: "quality", runner: "ubuntu-24.04" },
      { gate: "esbuild", runner: "ubuntu-24.04" },
      { gate: "real-tools", runner: "ubuntu-24.04" },
      { gate: "target-bun", runner: "ubuntu-24.04" },
      { gate: "target-deno", runner: "ubuntu-24.04" },
      { gate: "effect-beta", runner: "ubuntu-24.04" },
      { gate: "effect-rc", runner: "ubuntu-24.04" },
      { gate: "publication-ubuntu", runner: "ubuntu-24.04" },
      { gate: "publication-macos", runner: "macos-15" },
      { gate: "publication-windows", runner: "windows-2025" },
    ];
    expect(Object.keys(workflow.jobs)).toEqual([...candidateChecks, "candidate", "publish"]);
    expect(workflow.jobs.candidate?.needs).toEqual(candidateChecks);
    expect(workflow.jobs.candidate?.permissions).toEqual({ actions: "read", contents: "read" });
    expect(workflow.jobs.candidate?.outputs).toEqual({
      "candidate-artifact-id": "${{ steps.upload-candidate.outputs.artifact-id }}",
      "candidate-artifact-digest": "sha256:${{ steps.upload-candidate.outputs.artifact-digest }}",
      "prepared-ref": "${{ steps.prepare.outputs.prepared-ref }}",
    });
    for (const name of [...candidateChecks, "candidate"]) {
      expect(workflow.jobs[name]?.if).toBe("${{ inputs.command == 'candidate' }}");
    }
    expect(workflow.jobs.publish).toMatchObject({
      if: "${{ inputs.command == 'publish' }}",
      environment: "npm",
      permissions: { actions: "read", contents: "write", "id-token": "write" },
      "runs-on": "ubuntu-24.04",
    });
    expect(workflow.jobs.publish?.needs).toBeUndefined();
    expectPinnedActionsWithoutEscapes(workflow);
    expect(qualifiedActionInputErrors(workflow)).toEqual([]);

    const source = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(source.match(/node scripts\/test-built-consumer\.mjs --candidate-dir/g)).toHaveLength(1);
    expect(source).toContain("node scripts/verify-candidate.mjs --directory");
    expect(source).toContain("node scripts/write-release-config.mjs --manifest");
    expect(source).toContain("for verifier in verify-release-artifact.mjs verify-candidate.mjs");
    expect(source).toContain('node "$EVIDENCE_ROOT/verifiers/verify-release-artifact.mjs"');
    expect(source).toContain("effect-build-0.3.0-candidate");
    expect(source).toContain("effect-build-0.3.0-prepare-report-");
    expect(source).not.toMatch(/npm\s+pack|npm\s+publish|gh\s+release|git\s+tag|NODE_AUTH_TOKEN|NPM_TOKEN/i);

    expect(workflow.jobs["candidate-gates"]?.strategy).toEqual({
      "fail-fast": false,
      matrix: { include: candidateGateMatrix },
    });
    expect(jobRuns(workflow, "candidate-gates")).toContain("bun run verify");
    expect(jobRuns(workflow, "candidate-gates")).toContain("bun run verify:real");
    expect(jobRuns(workflow, "candidate-gates")).toContain("--compiler bun");
    expect(jobRuns(workflow, "candidate-gates")).toContain("--compiler deno");
    expect(jobRuns(workflow, "candidate-gates")).toContain("--effect-version 4.0.0-beta.104");
    expect(jobRuns(workflow, "candidate-gates")).toContain("--effect-version 4.0.0-rc.108");
    expect(jobRuns(workflow, "candidate-gates")).toContain("bun run test:publication");
    expect(jobRuns(workflow, "node-sea")).toContain("bun run test:integration:node-sea");
    expect(jobRuns(workflow, "bun-bundle")).toContain("bun run test:integration:bun-bundle");
    expect(jobRuns(workflow, "bun-bundle")).toContain("bun run test:integration:bun-node-sea");

    const candidateActions = workflow.jobs.candidate?.steps?.filter((step) => step.uses === qualifiedReleaseAction);
    expect(candidateActions).toEqual([expect.objectContaining({
      id: "prepare",
      env: { GITHUB_TOKEN: "${{ github.token }}" },
      with: { command: "prepare", config: "outputs/release.config.json" },
    })]);
    const candidateSteps = workflow.jobs.candidate!.steps!;
    const packIndex = candidateSteps.findIndex((step) => step.run?.includes("test-built-consumer.mjs --candidate-dir"));
    const preUploadVerifyIndex = candidateSteps.findIndex((step) =>
      step.name === "Verify the packed candidate before transfer"
    );
    const rawUploadIndex = candidateSteps.findIndex((step) => step.id === "upload-candidate");
    const rawAuthorityIndex = candidateSteps.findIndex((step) => step.run?.includes(".total_count == 1"));
    const rawTransferIndex = candidateSteps.findIndex((step) =>
      step.run?.includes("/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip")
    );
    const postTransferVerifyIndex = candidateSteps.findIndex((step) =>
      step.name === "Verify the transferred candidate and write release config"
    );
    const prepareIndex = candidateSteps.findIndex((step) => step.id === "prepare");
    expect(
      Math.min(
        packIndex,
        preUploadVerifyIndex,
        rawUploadIndex,
        rawAuthorityIndex,
        rawTransferIndex,
        postTransferVerifyIndex,
        prepareIndex,
      ),
    ).toBeGreaterThan(-1);
    const candidateSequence = [
      packIndex,
      preUploadVerifyIndex,
      rawUploadIndex,
      rawAuthorityIndex,
      rawTransferIndex,
      postTransferVerifyIndex,
      prepareIndex,
    ];
    expect(candidateSequence).toEqual(candidateSequence.slice().sort((left, right) => left - right));
    expect(candidateTransportErrors(workflow)).toEqual([]);
    expect(candidatePreparationErrors(workflow)).toEqual([]);
    expect(candidateSteps[rawUploadIndex]).toMatchObject({
      uses: "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
      with: {
        name: "effect-build-0.3.0-candidate",
        path: "${{ runner.temp }}/effect-build-candidate",
        "if-no-files-found": "error",
        "retention-days": 7,
      },
    });
    expect(candidateSteps[rawAuthorityIndex]).toMatchObject({
      env: {
        GH_TOKEN: "${{ github.token }}",
        CANDIDATE_RUN_ID: "${{ github.run_id }}",
        CANDIDATE_SOURCE: "${{ steps.source.outputs.sha }}",
        CANDIDATE_ARTIFACT_ID: "${{ steps.upload-candidate.outputs.artifact-id }}",
        CANDIDATE_ARTIFACT_DIGEST: "sha256:${{ steps.upload-candidate.outputs.artifact-digest }}",
      },
    });
    expect(candidateSteps.filter((step) => step.uses?.startsWith("actions/upload-artifact@"))).toHaveLength(2);
    expect(candidateSteps.find((step) => step.with?.name?.toString().startsWith("effect-build-0.3.0-prepare-report-")))
      .toMatchObject({ with: { name: "effect-build-0.3.0-prepare-report-${{ github.run_attempt }}" } });
    const publishActions = workflow.jobs.publish?.steps?.filter((step) => step.uses === qualifiedReleaseAction);
    expect(publishActions).toEqual([expect.objectContaining({
      id: "publish",
      env: { GITHUB_TOKEN: "${{ github.token }}" },
      with: { command: "publish", prepared: "${{ inputs.prepared_ref }}" },
    })]);

    const publishRuns = jobRuns(workflow, "publish");
    const releaseEvidenceStep = workflow.jobs.publish!.steps!.find((step) =>
      step.run?.includes("verify-release-artifact.mjs")
    )!;
    expect(releaseEvidenceStep.env).toMatchObject({
      VERIFY_RELEASE_ARTIFACT_SHA256: createHash("sha256")
        .update(await readFile(resolve(root, "scripts/verify-release-artifact.mjs")))
        .digest("hex"),
      VERIFY_CANDIDATE_SHA256: createHash("sha256")
        .update(await readFile(resolve(root, "scripts/verify-candidate.mjs")))
        .digest("hex"),
    });
    expect(releaseEvidenceStep.env?.VERIFY_RELEASE_ARTIFACT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(releaseEvidenceStep.env?.VERIFY_CANDIDATE_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(publishRuns).toContain("actions/runs/$CANDIDATE_RUN_ID");
    expect(publishRuns).toContain("actions/artifacts/$CANDIDATE_ARTIFACT_ID");
    expect(publishRuns).toContain("contents/scripts/$verifier?ref=$REQUESTED_SOURCE");
    expect(publishRuns).toContain(
      'test "sha256:$(sha256sum "$EVIDENCE_ROOT/candidate.zip" | awk \'{print $1}\')" = "$CANDIDATE_ARTIFACT_DIGEST"',
    );
    expect(publishRuns).toContain(
      'test "sha256:$(sha256sum "$EVIDENCE_ROOT/report.zip" | awk \'{print $1}\')" = "$report_artifact_digest"',
    );
    expect(publishRuns).toContain(
      'test "$(sha256sum "$destination" | awk \'{print $1}\')" = "$expected_sha256"',
    );
    expect(publishRuns).not.toMatch(forbiddenPublishPackageCommand);
    expect(workflow.jobs.publish?.steps?.some((step) => step.uses === checkoutAction)).toBe(false);
    expect(workflow.jobs.publish?.steps?.findIndex((step) => step.uses === qualifiedReleaseAction)).toBeGreaterThan(
      workflow.jobs.publish?.steps?.findIndex((step) => step.run?.includes("verify-release-artifact.mjs")) ?? -1,
    );

    const consumer = await readFile(resolve(root, "scripts/test-built-consumer.mjs"), "utf8");
    const packageList = consumer.match(/const packageNames = (\[[\s\S]*?\]);\nconst integrationNames/);
    expect(packageList).not.toBeNull();
    expect(JSON.parse(packageList![1]!.replace(/,\s*]$/, "]"))).toEqual(publicPackages);
    expect(consumer.match(/\bpackPackages\(/g)).toHaveLength(1);
    expect(consumer).toContain("const tarballs = await packPackages(bun, packDirectory);");
    expect(consumer.match(/\["pm", "pack",/g)).toHaveLength(1);
    const packerStart = consumer.indexOf("const packPackages = async (bun, destination) => {");
    const packerEnd = consumer.indexOf("\nconst compilerTypeScriptSource", packerStart);
    expect(Math.min(packerStart, packerEnd)).toBeGreaterThan(-1);
    const packer = consumer.slice(packerStart, packerEnd);
    expect(packer).toContain("for (const name of packageNames) {");
    expect(packer.match(/await execute\(bun, \["pm", "pack",/g)).toHaveLength(1);
    expect(consumer).toContain('console.log("packed consumers verified: 14/14")');
    expect(consumer).toContain('for (const producer of ["esbuild", "bun"])');
  });

  it("rejects workflow authority regressions and shell-source interpolation", async () => {
    const ci = parse(await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    const dispatch = parse(await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")) as Workflow;
    expect(workflowAuthorityErrors(ci, "ci")).toEqual([]);
    expect(workflowAuthorityErrors(dispatch, "release")).toEqual([]);

    const wrongRef = structuredClone(ci);
    wrongRef.jobs.quality!.steps![0]!.with!.ref = "refs/heads/main";
    expect(workflowAuthorityErrors(wrongRef, "ci")).toContain("quality checkout ref is not github.sha");

    const delayedGuard = structuredClone(ci);
    delayedGuard.jobs.quality!.steps!.splice(1, 1);
    expect(workflowAuthorityErrors(delayedGuard, "ci")).toContain("quality lacks the immediate exact-SHA HEAD guard");

    const shallowQuality = structuredClone(ci);
    delete shallowQuality.jobs.quality!.steps![0]!.with!["fetch-depth"];
    expect(workflowAuthorityErrors(shallowQuality, "ci")).toContain(
      "quality must fetch complete history for the frozen migration authority",
    );

    const credentials = structuredClone(ci);
    credentials.jobs.quality!.steps![0]!.with!["persist-credentials"] = true;
    expect(workflowAuthorityErrors(credentials, "ci")).toContain("quality checkout persists credentials");

    const unpinned = structuredClone(ci);
    unpinned.jobs.quality!.steps![0]!.uses = "actions/checkout@v4";
    expect(workflowAuthorityErrors(unpinned, "ci")).toContain(
      "quality step 0 action is not the approved exact identity",
    );

    const alternateCommit = structuredClone(ci);
    alternateCommit.jobs.quality!.steps![0]!.uses = `actions/checkout@${"a".repeat(40)}`;
    expect(workflowAuthorityErrors(alternateCommit, "ci")).toContain(
      "quality step 0 action is not the approved exact identity",
    );

    const maliciousOutput = structuredClone(dispatch);
    maliciousOutput.jobs["node-sea"]!.steps!.push({
      run: 'producer="${{ steps.node26.outputs.path }}$(touch /tmp/escaped)"',
    });
    expect(workflowAuthorityErrors(maliciousOutput, "release")).toContain(
      `node-sea step ${maliciousOutput.jobs["node-sea"]!.steps!.length - 1} interpolates workflow data in shell text`,
    );

    const wrongDispatchRef = structuredClone(dispatch);
    wrongDispatchRef.jobs["candidate-gates"]!.steps![1]!.with!.ref = "${{ inputs.commit }}";
    expect(workflowAuthorityErrors(wrongDispatchRef, "release")).toContain(
      "candidate-gates checkout ref is not the validated source output",
    );

    const shallowCandidate = structuredClone(dispatch);
    delete shallowCandidate.jobs["candidate-gates"]!.steps![1]!.with!["fetch-depth"];
    expect(workflowAuthorityErrors(shallowCandidate, "release")).toContain(
      "candidate-gates must fetch complete history for the frozen migration authority",
    );

    const missingEquality = structuredClone(dispatch);
    missingEquality.jobs["candidate-gates"]!.steps![2]!.run = missingEquality.jobs["candidate-gates"]!.steps![2]!.run!
      .replace(
        'test "$REQUESTED_SOURCE" = "$WORKFLOW_SOURCE"\n',
        "",
      );
    expect(workflowAuthorityErrors(missingEquality, "release")).toContain(
      "candidate-gates lacks the immediate input/workflow/HEAD equality guard",
    );

    const missingPackageTree = structuredClone(dispatch);
    missingPackageTree.jobs["candidate-gates"]!.steps![2]!.run = missingPackageTree.jobs["candidate-gates"]!.steps![2]!
      .run!.replace(`${packageTreeGuard}\n`, "");
    expect(workflowAuthorityErrors(missingPackageTree, "release")).toContain(
      "candidate-gates lacks the exact approved package-tree guard",
    );

    const wrongPackageTree = structuredClone(dispatch);
    wrongPackageTree.jobs["candidate-gates"]!.steps![2]!.run = wrongPackageTree.jobs["candidate-gates"]!.steps![2]!.run!
      .replace(approvedPackageTree, "b".repeat(40));
    expect(workflowAuthorityErrors(wrongPackageTree, "release")).toContain(
      "candidate-gates lacks the exact approved package-tree guard",
    );

    const publishPermission = structuredClone(dispatch);
    publishPermission.jobs.candidate!.permissions = { "id-token": "write" };
    expect(workflowAuthorityErrors(publishPermission, "release")).toContain("candidate grants id-token: write");

    const unverifiedCandidateTransfer = structuredClone(dispatch);
    const transfer = unverifiedCandidateTransfer.jobs.candidate!.steps!.find((step) =>
      step.run?.includes("/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip")
    )!;
    transfer.run = transfer.run!.replace(
      'test "sha256:$(sha256sum "$CANDIDATE_ZIP" | awk \'{print $1}\')" = "$CANDIDATE_ARTIFACT_DIGEST"\n',
      "",
    );
    expect(candidateTransportErrors(unverifiedCandidateTransfer)).toContain(
      "candidate transport must hash the downloaded ZIP before extracting it",
    );

    const prematurelyExtractedCandidate = structuredClone(dispatch);
    const reorderedTransfer = prematurelyExtractedCandidate.jobs.candidate!.steps!.find((step) =>
      step.run?.includes("/actions/artifacts/$CANDIDATE_ARTIFACT_ID/zip")
    )!;
    const hashLine = 'test "sha256:$(sha256sum "$CANDIDATE_ZIP" | awk \'{print $1}\')" = "$CANDIDATE_ARTIFACT_DIGEST"';
    const extractLine = 'unzip -q "$CANDIDATE_ZIP" -d "$CANDIDATE_DIRECTORY"';
    reorderedTransfer.run = reorderedTransfer.run!.replace(
      `${hashLine}\n${extractLine}`,
      `${extractLine}\n${hashLine}`,
    );
    expect(candidateTransportErrors(prematurelyExtractedCandidate)).toContain(
      "candidate transport must hash the downloaded ZIP before extracting it",
    );

    const actionExtractedCandidate = structuredClone(dispatch);
    actionExtractedCandidate.jobs.candidate!.steps!.splice(9, 0, {
      uses: "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
    });
    expect(candidateTransportErrors(actionExtractedCandidate)).toContain(
      "candidate trusts download-artifact extraction without proving the transferred ZIP digest",
    );

    const verifyCommand =
      'node scripts/verify-candidate.mjs --directory "$CANDIDATE_DIRECTORY" --source "$CANDIDATE_SOURCE"';
    const unverifiedUpload = structuredClone(dispatch);
    const preUploadVerification = unverifiedUpload.jobs.candidate!.steps!.find((step) =>
      step.name === "Verify the packed candidate before transfer"
    )!;
    preUploadVerification.run = preUploadVerification.run!.replace(`${verifyCommand}\n`, "");
    expect(candidatePreparationErrors(unverifiedUpload)).toContain(
      "candidate must verify the packed bytes before upload",
    );

    const prematureConfig = structuredClone(dispatch);
    const postTransfer = prematureConfig.jobs.candidate!.steps!.find((step) =>
      step.name === "Verify the transferred candidate and write release config"
    )!;
    const configCommand = postTransfer.run!.split("\n").find((line) =>
      line.startsWith("node scripts/write-release-config.mjs --manifest")
    )!;
    postTransfer.run = postTransfer.run!.replace(
      `${verifyCommand}\n${configCommand}`,
      `${configCommand}\n${verifyCommand}`,
    );
    expect(candidatePreparationErrors(prematureConfig)).toContain(
      "candidate release config must be generated only after post-transfer verification",
    );

    for (const command of ["npm pack", "bun pack", "bun pm pack", "pnpm pack", "yarn pack"]) {
      const repackingPublish = structuredClone(dispatch);
      repackingPublish.jobs.publish!.steps!.splice(-1, 0, { run: command });
      expect(jobRuns(repackingPublish, "publish"), command).toMatch(forbiddenPublishPackageCommand);
    }

    for (const jobName of ["candidate", "publish"] as const) {
      const widenedAction = structuredClone(dispatch);
      const action = widenedAction.jobs[jobName]!.steps!.find((step) => step.uses === qualifiedReleaseAction)!;
      action.with!.fallback = "true";
      expect(qualifiedActionInputErrors(widenedAction)).toContain(
        `${jobName} qualified Action inputs must be literally exact`,
      );
    }

    const writePermission = structuredClone(ci);
    writePermission.jobs.quality!.permissions = { contents: "write" };
    expect(workflowAuthorityErrors(writePermission, "ci")).toContain(
      "quality job permissions must be exactly contents: read",
    );
  });
});
