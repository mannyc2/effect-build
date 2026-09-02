import { spawn, spawnSync } from "node:child_process";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// @ts-expect-error The final verifier is an intentionally unprotected Node script module.
import { assertFinalPublicVerificationAllowed } from "../../scripts/release/final-public-verification.mjs";
// @ts-expect-error The readiness protocol is an intentionally unprotected Node script module.
import { assertReadinessArtifactAllowed } from "../../scripts/release/readiness-protocol.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtureRoot = resolve(root, "test/fixtures/release");
const fakeBoundary = resolve(fixtureRoot, "fake-boundary.mjs");
const fakeFetch = resolve(fixtureRoot, "exact-fake-fetch.mjs");
const exactFakeWrapper = resolve(fixtureRoot, "exact-fake-boundary.sh");
const fixtureModuleUrl = pathToFileURL(resolve(fixtureRoot, "make-candidate.mjs")).href;
const stateModuleUrl = pathToFileURL(resolve(fixtureRoot, "release-state.mjs")).href;
const nodeProbe = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" });
if (nodeProbe.status !== 0 || nodeProbe.stdout.trim().length === 0) {
  throw new Error("state-machine fixture requires the contract-pinned Node executable");
}
const nodeExecutable = nodeProbe.stdout.trim();
const bashExecutable = "/bin/bash";
const reauthorizationName = "Re-observe protected authority after environment approval";
const publisherName = "Adopt, compare, and publish only certified bytes";
const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

interface WorkflowStep {
  readonly env?: Readonly<Record<string, string>>;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
}

interface WorkflowJob {
  readonly steps?: ReadonlyArray<WorkflowStep>;
}

interface Workflow {
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

interface FakeState {
  readonly artifacts: {
    readonly candidate: {
      readonly artifactId: number;
      readonly digest: string;
      readonly manifestDigest: string;
      readonly runAttempt: number;
      readonly runId: number;
      readonly name: string;
      readonly workflowPath: string;
    };
    readonly readiness: {
      readonly artifactId: number;
      readonly digest: string;
      readonly runAttempt: number;
      readonly runId: number;
      readonly name: string;
      readonly workflowPath: string;
    };
  };
  readonly dispatch: {
    readonly candidateDigest: string;
    readonly readinessDigest: string;
  };
  readonly faults: { readonly publish?: unknown };
  readonly invocations: ReadonlyArray<{ readonly args: ReadonlyArray<string>; readonly tool: string }>;
  readonly inProcessFetches?: ReadonlyArray<{
    readonly authorization: string;
    readonly method: string;
    readonly url: string;
  }>;
  readonly mutations: ReadonlyArray<{
    readonly committed: boolean;
    readonly name: string;
    readonly provenance: boolean;
  }>;
  readonly registry: {
    readonly packages: Readonly<
      Record<string, {
        readonly tags: Readonly<Record<string, string>>;
      }>
    >;
  };
  readonly violations?: ReadonlyArray<unknown>;
}

const workflowSource = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
const workflow = parse(workflowSource) as Workflow;
const combinedContract = JSON.parse(
  await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
) as {
  readonly releaseCertification: {
    readonly fakeRegistry: {
      readonly exactProtectedBody: {
        readonly realBlockedMutationCount: number;
        readonly status: string;
      };
      readonly hypotheticalStateMachine: {
        readonly cases: ReadonlyArray<{
          readonly id: string;
          readonly variants?: ReadonlyArray<string>;
        }>;
        readonly coordinateCount: number;
        readonly status: string;
        readonly testSubject: string;
      };
    };
  };
};
const stateModule = await import(stateModuleUrl) as {
  readonly sourceSha: string;
  readonly clearPublishFault: (path: string) => void;
  readonly hypotheticalFakeRegistryEvidenceLedger: ReadonlyArray<{
    readonly attemptedFakeMutations: number;
    readonly committedFakeMutations: number;
    readonly coordinate: string;
  }>;
  readonly fakeRegistryScenarioMatrix: ReadonlyArray<{
    readonly caseId: string;
    readonly environment?: string;
    readonly scenario: string;
    readonly variant?: string;
  }>;
  readonly oidcRejectionScenarioMatrix: ReadonlyArray<{
    readonly id: string;
    readonly scenario: string;
  }>;
};
const fixtureSourceSha = stateModule.sourceSha;
const fakeRegistryScenarioMatrix = stateModule.fakeRegistryScenarioMatrix;
const hypotheticalFakeRegistryEvidenceLedger = stateModule.hypotheticalFakeRegistryEvidenceLedger;
const oidcRejectionScenarioMatrix = stateModule.oidcRejectionScenarioMatrix;
const allSteps = Object.entries(workflow.jobs).flatMap(([job, definition]) =>
  (definition.steps ?? []).map((step, index) => ({ index, job, step }))
);
const named = (name: string) => allSteps.filter(({ step }) => step.name === name);
const reauthorizations = named(reauthorizationName);
const publishers = named(publisherName);
const installBoundary = async (
  directory: string,
  statePath: string,
  tool: "curl" | "npm",
  sealed: boolean,
) => {
  const path = join(directory, tool);
  if (sealed) {
    await copyFile(exactFakeWrapper, path);
  } else {
    await writeFile(
      path,
      [
        "#!/bin/sh",
        `export FAKE_RELEASE_STATE=${shellQuote(statePath)}`,
        `export FAKE_RELEASE_BOUNDARY_TOOL=${tool}`,
        `exec ${shellQuote(nodeExecutable)} ${shellQuote(fakeBoundary)} "$@"`,
        "",
      ].join("\n"),
    );
  }
  await chmod(path, 0o755);
};

const installPinnedNpmSources = async (rootDirectory: string) => {
  const npmPath = spawnSync("which", ["npm"], { encoding: "utf8" }).stdout.trim();
  const sourceRoot = resolve(dirname(await realpath(npmPath)), "..");
  const contract = JSON.parse(
    await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"),
  ) as {
    readonly releaseCertification: {
      readonly npmOidcCertification: {
        readonly sourceDigests: ReadonlyArray<{ readonly path: string }>;
      };
    };
  };
  for (const { path } of contract.releaseCertification.npmOidcCertification.sourceDigests) {
    const relative = path.replace(/^npm\//u, "");
    const target = resolve(rootDirectory, relative);
    await mkdir(dirname(target), { recursive: true });
    const source = resolve(sourceRoot, relative);
    let currentMatches = false;
    try {
      currentMatches = (await readFile(target)).equals(await readFile(source));
    } catch {
      // The first execution installs the pinned source below.
    }
    if (!currentMatches) {
      try {
        await chmod(target, 0o600);
      } catch {
        // A missing target needs no permission repair.
      }
      await copyFile(source, target);
    }
  }
  const writeFakePackage = async (
    name: string,
    version: string,
    source: ReadonlyArray<string>,
    dependencies?: Readonly<Record<string, string>>,
  ) => {
    const packageRoot = resolve(rootDirectory, "node_modules", name);
    await mkdir(resolve(packageRoot, "dist"), { recursive: true });
    await writeFile(
      resolve(packageRoot, "package.json"),
      `${
        JSON.stringify({
          name,
          version,
          main: "dist/index.js",
          ...(dependencies === undefined ? {} : { dependencies }),
        })
      }\n`,
    );
    await writeFile(resolve(packageRoot, "dist/index.js"), [...source, ""].join("\n"));
  };
  await writeFakePackage(
    "@sigstore/verify",
    "3.1.0",
    [
      "exports.toTrustMaterial = (root) => root;",
      "exports.toSignedEntity = (bundle) => bundle;",
      "exports.Verifier = class {",
      "verify(bundle, options) {",
      "  for (const name of ['GH_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'UNRELATED_RUNNER_SECRET']) {",
      "    if (Object.hasOwn(process.env, name)) throw new Error('credential reached fixture provenance verifier');",
      "  }",
      "  if (bundle.fakeVerified === false) throw new Error('fixture provenance verification failed');",
      "  if (options.extensions?.issuer !== 'https://token.actions.githubusercontent.com') throw new Error('issuer');",
      "  const identity = 'https://github.com/mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main';",
      "  const der = (value) => { const bytes = Buffer.from(value); return Buffer.concat([Buffer.from([0x0c, bytes.length]), bytes]); };",
      "  const oids = [",
      "    ['1.3.6.1.4.1.57264.1.9', identity],",
      "    ['1.3.6.1.4.1.57264.1.12', 'https://github.com/mannyc2/effect-build'],",
      `    ['1.3.6.1.4.1.57264.1.13', '${fixtureSourceSha}'],`,
      "  ].map(([oid, value]) => ({ oid: { id: oid.split('.').map(Number) }, value: der(value) }));",
      "  if (bundle.fakeSignerOid === 'wrong') oids[2].value = der('2222222222222222222222222222222222222222');",
      "  if (bundle.fakeSignerOid === 'duplicate') oids.push(structuredClone(oids[2]));",
      "  return { identity: { subjectAlternativeName: identity, extensions: { issuer: options.extensions.issuer }, oids } };",
      "}",
      "};",
    ],
    {
      "@sigstore/bundle": "^4.0.0",
      "@sigstore/core": "^3.1.0",
      "@sigstore/protobuf-specs": "^0.5.0",
    },
  );
  await writeFakePackage(
    "@sigstore/bundle",
    "4.0.0",
    ["exports.bundleFromJSON = (bundle) => bundle;"],
    { "@sigstore/protobuf-specs": "^0.5.0" },
  );
  await writeFakePackage(
    "@sigstore/protobuf-specs",
    "0.5.0",
    ["exports.TrustedRoot = { fromJSON: (root) => root };"],
  );
  await writeFakePackage("@sigstore/core", "3.1.0", ["exports.fixture = true;"]);
};

const readState = async (statePath: string) => JSON.parse(await readFile(statePath, "utf8")) as FakeState;

const makeFixture = async (
  directory: string,
  scenario: string,
) => {
  const module = await import(fixtureModuleUrl) as {
    readonly makeReleaseFixture: (input: {
      readonly root: string;
      readonly scenario: string;
    }) => Promise<{
      readonly statePath: string;
    }>;
  };
  return await module.makeReleaseFixture({ root: directory, scenario });
};

const clearPublishFault = async (statePath: string) => {
  stateModule.clearPublishFault(statePath);
};

const protectedBodyTimeout = 600_000;
const exactCoordinateTimeout = (protectedBodyTimeout * 2) + 60_000;
const supportedConvergenceTimeout = protectedBodyTimeout + 60_000;

const executeBody = (
  body: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  timeoutMilliseconds = protectedBodyTimeout,
) =>
  new Promise<{
    readonly signal: NodeJS.Signals | null;
    readonly status: number | null;
    readonly stderr: string;
    readonly stdout: string;
  }>((resolveBody) => {
    const child = spawn(bashExecutable, ["-c", body], {
      cwd,
      detached: true,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let spawnError: Error | undefined;
    let closeResult: { readonly signal: NodeJS.Signals | null; readonly status: number | null } | undefined;
    let timedOut = false;
    let forcedKillComplete = false;
    let settled = false;
    const finish = () => {
      if (settled || closeResult === undefined || (timedOut && !forcedKillComplete)) return;
      settled = true;
      resolveBody({
        ...closeResult,
        stderr: [
          stderr,
          spawnError?.message,
          timedOut ? `protected body timed out after ${timeoutMilliseconds}ms` : undefined,
        ].filter(Boolean).join("\n"),
        stdout,
      });
    };
    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          stderr += `${stderr.length === 0 ? "" : "\n"}${String(error)}`;
          return;
        }
        // The detached child may not have created its process group yet; kill it directly.
        try {
          child.kill(signal);
        } catch {
          // The child already exited.
        }
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdout += chunk);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => stderr += chunk);
    child.once("error", (error) => spawnError = error);
    child.once("close", (status, signal) => {
      closeResult = { signal, status };
      finish();
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => {
        killGroup("SIGKILL");
        forcedKillComplete = true;
        finish();
      }, 1_000);
    }, timeoutMilliseconds);
    child.once("close", () => clearTimeout(timeout));
  });

const runProtectedBodies = async (
  statePath: string,
  rootDirectory: string,
  extraEnvironment: NodeJS.ProcessEnv = {},
  sealedFakePurpose = true,
) => {
  const state = await readState(statePath);
  const bin = join(rootDirectory, `bin-${crypto.randomUUID()}`);
  const runnerTemp = join(rootDirectory, `runner-${crypto.randomUUID()}`);
  await Promise.all([
    import("node:fs/promises").then(({ mkdir }) => mkdir(bin)),
    import("node:fs/promises").then(({ mkdir }) => mkdir(runnerTemp)),
  ]);
  await Promise.all([
    installBoundary(bin, statePath, "curl", true),
    installBoundary(bin, statePath, "npm", true),
    installPinnedNpmSources(rootDirectory),
  ]);
  const candidate = state.artifacts.candidate;
  const readiness = state.artifacts.readiness;
  const inheritedEnvironment: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["NPM_ID_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "SIGSTORE_ID_TOKEN"]) {
    delete inheritedEnvironment[name];
  }
  const environment: NodeJS.ProcessEnv = {
    ...inheritedEnvironment,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "FAKE-ACTIONS-REQUEST-TOKEN",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelinesghubeus13.actions.githubusercontent.com/"
      + "ABCDEFGHIJKLMNOPQRSTUVWX/00000000-0000-4000-8000-000000000001/"
      + "_apis/distributedtask/hubs/Actions/plans/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/jobs/"
      + "ZYXWVUTSRQPONMLKJIHGFEDCBA987654/idtoken?api-version=2.0",
    API_ROOT: "https://api.github.com",
    ARTIFACT_ID: String(candidate.artifactId),
    CANDIDATE_ARTIFACT_DIGEST: state.dispatch.candidateDigest,
    CANDIDATE_ARTIFACT_ID: String(candidate.artifactId),
    CANDIDATE_DIR: join(runnerTemp, "candidate"),
    CANDIDATE_RUN_ATTEMPT: String(candidate.runAttempt),
    CANDIDATE_RUN_ID: String(candidate.runId),
    CERTIFICATION_DIR: join(runnerTemp, "certification"),
    CI: "true",
    EXPECTED_ARTIFACT_DIGEST: state.dispatch.candidateDigest,
    EXPECTED_REPOSITORY: "mannyc2/effect-build",
    EXPECTED_SHA: fixtureSourceSha,
    EXPECTED_WORKFLOW_REF: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
    GH_TOKEN: "FAKE-GITHUB-TOKEN",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_OUTPUT: join(runnerTemp, "github-output"),
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "mannyc2/effect-build",
    GITHUB_REPOSITORY_ID: "1331906770",
    GITHUB_REPOSITORY_OWNER_ID: "126291407",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: "8001",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_SHA: fixtureSourceSha,
    GITHUB_WORKFLOW_REF: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
    MODE: "publish-certified-bytes",
    NODE_OPTIONS: `--import=${fakeFetch}`,
    EFFECT_BUILD_FAKE_BOUNDARY: fakeBoundary,
    EFFECT_BUILD_FAKE_CONTRACT_PATH: resolve(root, "tooling/effect-build-contract.json"),
    EFFECT_BUILD_FAKE_EXECUTION_ROOT: rootDirectory,
    EFFECT_BUILD_FAKE_NODE: nodeExecutable,
    EFFECT_BUILD_PUBLISH_PURPOSE: sealedFakePurpose
      ? "fake-registry-exact-protected-body-certification"
      : "fake-registry-exact-protected-body-real-gate-certification",
    FAKE_RELEASE_STATE: statePath,
    NPM_CACHE: join(runnerTemp, "npm-cache"),
    PATH: [bin, process.env.PATH ?? ""].join(delimiter),
    READINESS_ARTIFACT_DIGEST: state.dispatch.readinessDigest,
    READINESS_ARTIFACT_ID: String(readiness.artifactId),
    READINESS_DIR: join(runnerTemp, "readiness"),
    READINESS_RUN_ATTEMPT: String(readiness.runAttempt),
    READINESS_RUN_ID: String(readiness.runId),
    REPOSITORY: "mannyc2/effect-build",
    RUN_REF: "refs/heads/main",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_TEMP: runnerTemp,
    SOURCE_SHA: fixtureSourceSha,
    WORKFLOW_REF: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
    ...extraEnvironment,
  };
  const reauthorization = await executeBody(reauthorizations[0]!.step.run!, root, environment);
  if (reauthorization.status !== 0) return { publisher: undefined, reauthorization, runnerTemp };
  const publisher = await executeBody(publishers[0]!.step.run!, root, environment);
  return { publisher, reauthorization, runnerTemp };
};

const withScenario = async <A>(
  scenario: string,
  use: (fixture: {
    readonly directory: string;
    readonly statePath: string;
  }) => Promise<A>,
) => {
  const directory = await mkdtemp(join(tmpdir(), `effect-build-release-${scenario}-`));
  try {
    const { statePath } = await makeFixture(directory, scenario);
    return await use({ directory, statePath });
  } finally {
    await rm(directory, { force: true, maxRetries: 20, recursive: true, retryDelay: 100 });
  }
};

const canonicalPackageOrder = [
  "effect-build",
  "effect-build-apple",
  "effect-build-archives",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-nfpm",
  "effect-build-node-sea",
  "effect-build-python",
  "effect-build-sbom",
  "effect-build-windows",
];

const hypotheticalPolicy = combinedContract.releaseCertification.fakeRegistry.hypotheticalStateMachine;
const policyCoordinates = hypotheticalPolicy.cases
  .flatMap(({ id, variants }) => (variants ?? [""]).map((variant) => [id, variant].join("::")))
  .sort();
const harnessCoordinates = fakeRegistryScenarioMatrix
  .map(({ caseId, variant }) => [caseId, variant ?? ""].join("::"))
  .sort();

const certificationEnvironment = {
  MODE: "certify-exact-sha",
  READINESS_ARTIFACT_DIGEST: "",
  READINESS_ARTIFACT_ID: "",
  READINESS_RUN_ATTEMPT: "",
  READINESS_RUN_ID: "",
};

const mutationSummary = (state: FakeState) =>
  state.mutations.map(
    ({ committed, name, provenance }) => ({ committed, name, provenance }),
  );

interface MutableArtifact {
  headSha?: string;
  name: string;
  workflowPath: string;
}

const mutateCandidateArtifact = async (
  statePath: string,
  mutate: (artifact: MutableArtifact) => void,
) => {
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    artifacts: { candidate: MutableArtifact };
  };
  mutate(state.artifacts.candidate);
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
};

const mutateRegistryTags = async (
  statePath: string,
  name: string,
  mutate: (tags: Record<string, string>) => void,
) => {
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    registry: { packages: Record<string, { tags: Record<string, string> }> };
  };
  const entry = state.registry.packages[name];
  if (entry === undefined) throw new Error(`missing fake registry package ${name}`);
  mutate(entry.tags);
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
};

describe.skipIf(process.platform === "win32")("release publisher boundary certification", { concurrent: true }, () => {
  it("parses both exact protected bodies with the runner Bash", () => {
    for (const body of [reauthorizations[0]?.step.run, publishers[0]?.step.run]) {
      expect(typeof body).toBe("string");
      const parsed = spawnSync(bashExecutable, ["-n"], { encoding: "utf8", input: body });
      expect(parsed.status, parsed.stderr).toBe(0);
    }
  });

  it("terminates every timed-out protected-body descendant before cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-build-release-timeout-process-group-"));
    const marker = join(directory, "leaked-descendant");
    try {
      const result = await executeBody(
        "(trap '' TERM; sleep 2; printf leaked > \"$MARKER\") & wait",
        directory,
        { MARKER: marker, PATH: process.env.PATH ?? "" },
        500,
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("protected body timed out after 500ms");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_250));
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { force: true, maxRetries: 20, recursive: true, retryDelay: 100 });
    }
  }, 10_000);

  it("requires one exact ordered selector pair and exact generated hypothetical coverage", () => {
    expect(reauthorizations, reauthorizationName).toHaveLength(1);
    expect(publishers, publisherName).toHaveLength(1);
    expect(reauthorizations[0]?.job).toBe(publishers[0]?.job);
    expect(reauthorizations[0]?.index).toBeLessThan(publishers[0]?.index ?? -1);
    expect(typeof reauthorizations[0]?.step.run).toBe("string");
    expect(typeof publishers[0]?.step.run).toBe("string");
    expect(new Set(harnessCoordinates).size).toBe(harnessCoordinates.length);
    expect(harnessCoordinates).toEqual(policyCoordinates);
    expect(hypotheticalFakeRegistryEvidenceLedger.map(({ coordinate }) => coordinate).sort()).toEqual(
      fakeRegistryScenarioMatrix
        .map(({ caseId, variant }) => caseId + (variant === undefined ? "" : "/" + variant))
        .sort(),
    );
    expect(combinedContract.releaseCertification.fakeRegistry.exactProtectedBody).toMatchObject({
      realBlockedMutationCount: 0,
      status: "two-purpose-hard-cut",
    });
    expect(hypotheticalPolicy.coordinateCount).toBe(policyCoordinates.length);
  });

  for (const entry of fakeRegistryScenarioMatrix) {
    const coordinate = entry.caseId + (entry.variant === undefined ? "" : "/" + entry.variant);
    it("executes exact protected fake-registry state-machine case " + coordinate, async () => {
      await withScenario(entry.scenario, async ({ directory, statePath }) => {
        const environment = entry.environment === undefined ? {} : { [entry.environment]: "fixture-canary" };
        const first = await runProtectedBodies(statePath, directory, environment);
        if (entry.caseId === "forbidden-protected-environment") {
          expect(first.reauthorization.status).not.toBe(0);
          expect(first.reauthorization.stderr).toBe(
            `forbidden protected authentication identity is present: ${entry.environment}\n`,
          );
          expect(first.publisher).toBeUndefined();
        } else if (entry.caseId === "main-advances-before-first-mutation") {
          expect(first.reauthorization.status).toBe(1);
          expect(first.reauthorization.stderr).toBe(
            "post-approval repository, environment, OIDC, or exact-main authority changed\n",
          );
          expect(first.publisher).toBeUndefined();
        } else {
          expect(first.reauthorization.status, first.reauthorization.stderr).toBe(0);
          expect(first.reauthorization.stderr).toBe("");
          expect(first.publisher, `${coordinate}: publisher did not run after successful reauthorization`)
            .toBeDefined();
        }
        const firstFailed = first.reauthorization.status !== 0 || first.publisher?.status !== 0;
        let state = await readState(statePath);

        switch (entry.caseId) {
          case "all-absent-full-convergence": {
            if (firstFailed) {
              throw new Error([
                `reauthorization status: ${first.reauthorization.status}`,
                first.reauthorization.stderr,
                `publisher status: ${String(first.publisher?.status)}`,
                first.publisher?.stderr ?? "publisher did not run",
              ].join("\n"));
            }
            expect(firstFailed, first.publisher?.stderr).toBe(false);
            expect(state.mutations.map(({ name }) => name)).toEqual(canonicalPackageOrder);
            expect(state.mutations.every(({ committed, provenance }) => committed && provenance)).toBe(true);
            expect(state.registry.packages["effect-build"]?.tags).toEqual({ latest: "0.6.0" });
            expect(state.registry.packages["effect-build-bun"]?.tags).toEqual({
              latest: "0.6.0",
              reserved: "0.0.0-reserved.0",
            });
            break;
          }
          case "partial-exact-publication": {
            expect(firstFailed, first.publisher?.stderr).toBe(false);
            expect(state.mutations.map(({ name }) => name)).toEqual(canonicalPackageOrder.slice(3));
            expect(state.mutations.every(({ committed, provenance }) => committed && provenance)).toBe(true);
            break;
          }
          case "failure-before-registry-commitment": {
            expect(firstFailed).toBe(true);
            expect(mutationSummary(state)).toEqual([
              { committed: false, name: canonicalPackageOrder[0], provenance: false },
            ]);
            expect(state.mutations.filter(({ committed }) => committed)).toHaveLength(0);
            break;
          }
          case "response-loss-after-registry-commitment": {
            expect(firstFailed).toBe(true);
            expect(mutationSummary(state)).toEqual([
              { committed: true, name: canonicalPackageOrder[0], provenance: true },
            ]);
            await clearPublishFault(statePath);
            const resumed = await runProtectedBodies(statePath, directory);
            expect(resumed.reauthorization.status, resumed.reauthorization.stderr).toBe(0);
            expect(resumed.reauthorization.stderr).toBe("");
            expect(resumed.publisher).toBeDefined();
            expect(resumed.publisher?.status, resumed.publisher?.stderr).toBe(0);
            state = await readState(statePath);
            expect(state.mutations.map(({ name }) => name)).toEqual(canonicalPackageOrder);
            break;
          }
          case "response-loss-after-bytes-and-tag-before-valid-provenance": {
            expect(firstFailed).toBe(true);
            expect(mutationSummary(state)).toEqual([
              { committed: true, name: canonicalPackageOrder[0], provenance: false },
            ]);
            await clearPublishFault(statePath);
            const resumed = await runProtectedBodies(statePath, directory);
            expect(resumed.reauthorization.status, resumed.reauthorization.stderr).toBe(0);
            expect(resumed.reauthorization.stderr).toBe("");
            expect(resumed.publisher).toBeDefined();
            expect(resumed.publisher?.status).not.toBe(0);
            state = await readState(statePath);
            expect(mutationSummary(state)).toEqual([
              { committed: true, name: canonicalPackageOrder[0], provenance: false },
            ]);
            break;
          }
          case "post-publish-candidate-mismatch": {
            expect(firstFailed).toBe(true);
            expect(mutationSummary(state)).toEqual([
              { committed: true, name: canonicalPackageOrder[0], provenance: true },
            ]);
            break;
          }
          case "registry-drift-after-first-mutation":
          case "main-advances-after-first-mutation":
          case "authority-drift-after-first-mutation": {
            expect(firstFailed).toBe(true);
            expect(
              mutationSummary(state),
              [
                `reauthorization status: ${first.reauthorization.status}`,
                first.reauthorization.stderr,
                `publisher status: ${String(first.publisher?.status)}`,
                first.publisher?.stderr ?? "publisher did not run",
              ].join("\n"),
            ).toEqual([
              { committed: true, name: canonicalPackageOrder[0], provenance: true },
            ]);
            break;
          }
          case "forbidden-protected-environment": {
            expect(firstFailed).toBe(true);
            expect(state.mutations).toEqual([]);
            break;
          }
          default: {
            expect(firstFailed, coordinate).toBe(true);
            expect(state.mutations, coordinate).toEqual([]);
          }
        }
        const evidence = hypotheticalFakeRegistryEvidenceLedger.find(({ coordinate: expected }) =>
          expected === coordinate
        );
        expect(evidence).toBeDefined();
        expect(state.mutations, coordinate).toHaveLength(evidence!.attemptedFakeMutations);
        expect(state.mutations.filter(({ committed }) => committed), coordinate).toHaveLength(
          evidence!.committedFakeMutations,
        );
        if (process.env.EFFECT_BUILD_EXACT_CASE_EVIDENCE_PATH !== undefined) {
          await appendFile(
            process.env.EFFECT_BUILD_EXACT_CASE_EVIDENCE_PATH,
            `${
              JSON.stringify({
                candidateArtifactDigest: state.artifacts.candidate.digest,
                candidateManifestDigest: state.artifacts.candidate.manifestDigest,
                coordinate,
              })
            }\n`,
          );
        }
        const rawBoundaryRecord = JSON.stringify(state.invocations);
        expect(rawBoundaryRecord).not.toContain("FAKE-GITHUB-TOKEN");
        expect(rawBoundaryRecord).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
      });
    }, exactCoordinateTimeout);
  }

  for (
    const drift of [
      {
        label: "missing historical reserved tag",
        mutate: (tags: Record<string, string>) => {
          delete tags.reserved;
        },
      },
      {
        label: "unexpected extra tag",
        mutate: (tags: Record<string, string>) => {
          tags.next = "0.3.0";
        },
      },
      {
        label: "wrong historical reserved tag",
        mutate: (tags: Record<string, string>) => {
          tags.reserved = "0.0.0-reserved.1";
        },
      },
    ]
  ) {
    it(`rejects ${drift.label} before the first registry mutation`, async () => {
      await withScenario("full-convergence", async ({ directory, statePath }) => {
        await mutateRegistryTags(statePath, "effect-build-bun", drift.mutate);
        const result = await runProtectedBodies(statePath, directory);
        expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
        expect(result.publisher?.status).not.toBe(0);
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
      });
    }, exactCoordinateTimeout);
  }

  it("requires exact three-role readiness before any npm command", async () => {
    await withScenario("full-convergence", async ({ directory, statePath }) => {
      const result = await runProtectedBodies(
        statePath,
        directory,
        {
          READINESS_ARTIFACT_ID: "0",
          UNRELATED_RUNNER_SECRET: "SECRET-CANARY",
        },
        false,
      );
      expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
      expect(result.publisher?.status).not.toBe(0);
      expect(result.publisher?.stderr).toContain("readiness fixture coordinate changed");
      const state = await readState(statePath);
      expect(state.mutations).toHaveLength(
        combinedContract.releaseCertification.fakeRegistry.exactProtectedBody.realBlockedMutationCount,
      );
      expect(state.invocations.filter(({ tool }) => tool === "npm")).toEqual([]);
      const observedCurl = state.invocations
        .filter(({ tool }) => tool === "curl")
        .flatMap(({ args }) => args)
        .join("\n");
      expect(observedCurl).not.toContain("/actions/artifacts/");
      expect(observedCurl).not.toContain("registry.npmjs.org");
      expect(observedCurl).not.toContain("token.actions.githubusercontent.com");
      expect(combinedContract.releaseCertification.fakeRegistry.exactProtectedBody.status).toBe(
        "two-purpose-hard-cut",
      );
      expect(hypotheticalPolicy.status).toBe(
        "reference-oracle-only-not-certification",
      );
      expect(hypotheticalPolicy.testSubject).toBe("independent-oracle-compared-with-exact-protected-body");
      expect(hypotheticalPolicy.coordinateCount).toBe(policyCoordinates.length);
    });
  }, 120_000);

  it("adopts the canonical semantic readiness artifact and runs real convergence without checkout", async () => {
    await withScenario("full-convergence", async ({ directory, statePath }) => {
      const stateBefore = await readState(statePath);
      const canonicalContract = JSON.parse(
        await readFile(resolve(directory, "effect-build-contract.json"), "utf8"),
      );
      expect(() => assertReadinessArtifactAllowed(canonicalContract)).not.toThrow();
      expect(() => assertFinalPublicVerificationAllowed(canonicalContract)).not.toThrow();
      const protectedJob = workflow.jobs[reauthorizations[0]!.job]!;
      expect(
        protectedJob.steps?.some(({ uses }: { readonly uses?: string }) =>
          typeof uses === "string" && uses.startsWith("actions/checkout@")
        ),
      ).not.toBe(true);

      const result = await runProtectedBodies(statePath, directory, {}, false);
      expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
      expect(result.publisher?.status, result.publisher?.stderr).toBe(0);
      const state = await readState(statePath);
      expect(state.mutations.map(({ name }) => name)).toEqual(canonicalPackageOrder);
      expect(state.mutations.every(({ committed, provenance }) => committed && provenance)).toBe(true);
      const readinessDownload = state.invocations.findIndex(({ args, tool }) =>
        tool === "curl"
        && args.some((value) => value.endsWith(`/actions/artifacts/${stateBefore.artifacts.readiness.artifactId}/zip`))
      );
      const firstNpm = state.invocations.findIndex(({ tool }) => tool === "npm");
      expect(readinessDownload).toBeGreaterThan(-1);
      expect(firstNpm).toBeGreaterThan(readinessDownload);
      expect(state.violations ?? []).toEqual([]);
    });
  }, supportedConvergenceTimeout);

  it("certifies eleven package-specific npm OIDC exchanges without a reachable mutation", async () => {
    await withScenario("full-convergence", async ({ directory, statePath }) => {
      const result = await runProtectedBodies(statePath, directory, certificationEnvironment);
      expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
      expect(result.publisher?.status, result.publisher?.stderr).toBe(0);
      const state = await readState(statePath);
      const npmPublishes = state.invocations.filter(
        ({ args, tool }) => tool === "npm" && args[0] === "publish",
      );
      expect(npmPublishes).toHaveLength(11);
      expect(npmPublishes.every(({ args }) => args.includes("--dry-run"))).toBe(true);
      expect(state.mutations).toEqual([]);
      expect(state.violations ?? []).toEqual([]);
      expect(state.invocations.flatMap(({ args }) => args)).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
      expect(JSON.stringify(state.invocations)).not.toContain("FAKE-GITHUB-TOKEN");
      const publisherOutput = `${result.publisher?.stdout ?? ""}${result.publisher?.stderr ?? ""}`;
      expect(publisherOutput).not.toContain("FAKE-GITHUB-TOKEN");
      expect(publisherOutput).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
      expect(state.inProcessFetches).toEqual([{
        authorization: "Bearer <redacted>",
        method: "GET",
        url: "https://pipelinesghubeus13.actions.githubusercontent.com/"
          + "ABCDEFGHIJKLMNOPQRSTUVWX/00000000-0000-4000-8000-000000000001/"
          + "_apis/distributedtask/hubs/Actions/plans/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/jobs/"
          + "ZYXWVUTSRQPONMLKJIHGFEDCBA987654/idtoken?api-version=2.0&audience=npm%3Aregistry.npmjs.org",
      }]);
      await expect(access(resolve(result.runnerTemp, "npm-cache"))).rejects.toMatchObject({ code: "ENOENT" });

      const receiptDirectory = resolve(result.runnerTemp, "certification");
      expect((await readdir(receiptDirectory)).sort()).toEqual([
        "github-oidc-claims.json",
        "npm-oidc-exchange-accepted.json",
      ]);
      const [claimsText, npmText] = await Promise.all([
        readFile(resolve(receiptDirectory, "github-oidc-claims.json"), "utf8"),
        readFile(resolve(receiptDirectory, "npm-oidc-exchange-accepted.json"), "utf8"),
      ]);
      const claims = JSON.parse(claimsText);
      const npm = JSON.parse(npmText);
      expect(claims.schema).toBe("effect-build/github-oidc-claims@1");
      expect(npm.schema).toBe("effect-build/npm-oidc-exchange-accepted@1");
      expect(npm.registryMutation).toBe(false);
      expect(npm.packages).toEqual(canonicalPackageOrder);
      expect(npm.exchanges).toEqual(
        canonicalPackageOrder.map((name) => ({ accepted: true, markerCount: 1, name })),
      );
      expect(npm.beforeRegistryStateDigest).toBe(npm.afterRegistryStateDigest);
      expect(claims.registryMutation).toBe(false);
      expect(claims.jwtValidation).toMatchObject({
        alg: "RS256",
        kid: "effect-build-fake-oidc",
        signatureVerified: true,
      });
      expect(claims.claimsDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      for (const retained of [claimsText, npmText]) {
        expect(retained).not.toContain("Successfully retrieved and set token");
        expect(retained).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
        expect(retained).not.toMatch(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u);
      }
    });
  }, 120_000);

  for (const scenario of ["dry-run-marker-missing", "dry-run-marker-duplicate"]) {
    it("fails closed on " + scenario + " without exposing a private marker or mutating npm", async () => {
      await withScenario(scenario, async ({ directory, statePath }) => {
        const result = await runProtectedBodies(statePath, directory, certificationEnvironment);
        expect(result.publisher?.status).not.toBe(0);
        expect(String(result.publisher?.stdout) + String(result.publisher?.stderr)).not.toContain(
          "Successfully retrieved and set token",
        );
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
        expect(state.violations ?? []).toEqual([]);
        expect(JSON.stringify(state.invocations)).not.toContain("FAKE-GITHUB-TOKEN");
        expect(JSON.stringify(state.invocations)).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
        await expect(access(resolve(result.runnerTemp, "npm-cache"))).rejects.toMatchObject({ code: "ENOENT" });
        expect(
          await readdir(resolve(result.runnerTemp, "certification")).catch((error: NodeJS.ErrnoException) =>
            error.code === "ENOENT" ? [] : Promise.reject(error)
          ),
        ).toEqual([]);
      });
    }, 120_000);
  }

  it("keeps the npm OIDC rejection fixture coordinates unique", () => {
    const ids = oidcRejectionScenarioMatrix.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const { id, scenario } of oidcRejectionScenarioMatrix) {
    it("rejects npm OIDC boundary " + id + " before every publish or dry-run", async () => {
      await withScenario(scenario, async ({ directory, statePath }) => {
        const result = await runProtectedBodies(statePath, directory, certificationEnvironment);
        const output = result.reauthorization.stdout + result.reauthorization.stderr
          + (result.publisher?.stdout ?? "") + (result.publisher?.stderr ?? "");
        expect(
          result.reauthorization.status === 0 ? result.publisher?.status : result.reauthorization.status,
        ).not.toBe(0);
        expect(output).not.toContain("Successfully retrieved and set token");
        expect(output).not.toContain("FAKE-ACTIONS-REQUEST-TOKEN");
        expect(output).not.toMatch(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u);
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
        expect(state.invocations.filter(({ args, tool }) => tool === "npm" && args[0] === "publish")).toEqual([]);
        expect(state.violations ?? []).toEqual([]);
        if (result.publisher !== undefined) {
          expect(
            await readdir(resolve(result.runnerTemp, "certification")).catch((error: NodeJS.ErrnoException) =>
              error.code === "ENOENT" ? [] : Promise.reject(error)
            ),
          ).toEqual([]);
        }
      });
    }, 120_000);
  }

  for (
    const scenario of [
      "preexisting-registry-auth",
      "placeholder-extra-version",
      "private-manifest",
      "duplicate-nonmanifest",
      "symlink-leaf",
    ]
  ) {
    it("rejects " + scenario + " before any npm mutation", async () => {
      await withScenario(scenario, async ({ directory, statePath }) => {
        const result = await runProtectedBodies(statePath, directory, certificationEnvironment);
        expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
        expect(result.publisher?.status).not.toBe(0);
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
        expect(state.violations ?? []).toEqual([]);
      });
    }, 120_000);
  }

  for (const scenario of ["readiness-stale", "readiness-future", "readiness-excess-validity"]) {
    it("does not admit " + scenario + " before any npm command", async () => {
      await withScenario(scenario, async ({ directory, statePath }) => {
        const result = await runProtectedBodies(statePath, directory, {}, false);
        expect(result.reauthorization.status, result.reauthorization.stderr).toBe(0);
        expect(result.publisher?.status).not.toBe(0);
        expect(result.publisher?.stderr).toMatch(
          /release readiness .*(?:changed|stale, future, expired, or overlong)/u,
        );
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
        expect(state.invocations.filter(({ tool }) => tool === "npm")).toEqual([]);
        expect(state.violations ?? []).toEqual([]);
      });
    }, 120_000);
  }

  const coordinateFailures: ReadonlyArray<{
    readonly extra?: NodeJS.ProcessEnv;
    readonly label: string;
    readonly mutate?: (artifact: MutableArtifact) => void;
  }> = [
    { label: "run ID", extra: { CANDIDATE_RUN_ID: "9999" } },
    { label: "run attempt", extra: { CANDIDATE_RUN_ATTEMPT: "9" } },
    { label: "artifact ID", extra: { CANDIDATE_ARTIFACT_ID: "9999" } },
    {
      label: "artifact name",
      mutate: (artifact) => {
        artifact.name = "foreign-candidate";
      },
    },
    {
      label: "workflow",
      mutate: (artifact) => {
        artifact.workflowPath = ".github/workflows/foreign.yml";
      },
    },
    {
      label: "source SHA",
      mutate: (artifact) => {
        artifact.headSha = "2222222222222222222222222222222222222222";
      },
    },
  ];

  for (const coordinate of coordinateFailures) {
    it("rejects a candidate coordinate with the wrong " + coordinate.label, async () => {
      await withScenario("full-convergence", async ({ directory, statePath }) => {
        if (coordinate.mutate !== undefined) {
          await mutateCandidateArtifact(statePath, coordinate.mutate);
        }
        const result = await runProtectedBodies(statePath, directory, {
          ...certificationEnvironment,
          ...coordinate.extra,
        });
        expect(result.publisher?.status).not.toBe(0);
        const state = await readState(statePath);
        expect(state.mutations).toEqual([]);
      });
    }, 120_000);
  }
});
