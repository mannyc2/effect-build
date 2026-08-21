import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  expectedReceiptClaims,
  historicalAuthoritySummary,
  loadProfileDocuments,
  sha256,
  validateActiveInstructions,
  validateCoreMigrationPlan,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateHandoffApi,
  validateHandoffArchive,
  validateImplementationCertificate,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");

const requiredEnvironment = (name) => {
  const value = process.env[name];
  assert.equal(typeof value, "string", `${name} is missing`);
  assert.ok(value.length > 0, `${name} is missing`);
  return value;
};

const githubHeaders = (token) => ({
  Accept: "application/vnd.github+json",
  ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
  "User-Agent": "effect-build-plan039-certifier",
  "X-GitHub-Api-Version": "2022-11-28",
});

const assertTrustedApiUrl = (value, apiOrigin, repositoryName) => {
  const url = new URL(value);
  assert.equal(url.origin, apiOrigin, "GitHub API request escaped the configured origin");
  assert.equal(
    url.pathname.startsWith(`/repos/${repositoryName}/`),
    true,
    "GitHub API request escaped the configured repository",
  );
  return url;
};

const requestJson = async ({ apiOrigin, repositoryName, token, url }) => {
  const trusted = assertTrustedApiUrl(url, apiOrigin, repositoryName);
  const response = await fetch(trusted, {
    headers: githubHeaders(token),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true, `GitHub API request failed with ${response.status}`);
  return await response.json();
};

const downloadArtifact = async ({ apiOrigin, artifact, handoffAnchor, repositoryName, token }) => {
  const archiveUrl = assertTrustedApiUrl(artifact.archive_download_url, apiOrigin, repositoryName);
  assert.equal(
    archiveUrl.pathname,
    `/repos/${repositoryName}/actions/artifacts/${handoffAnchor.aggregateArtifact.id}/zip`,
    "handoff artifact download URL drifted",
  );
  const redirect = await fetch(archiveUrl, {
    headers: githubHeaders(token),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal([301, 302, 303, 307, 308].includes(redirect.status), true, "artifact API did not return a redirect");
  const location = redirect.headers.get("location");
  assert.equal(typeof location, "string", "artifact API redirect omitted its signed location");
  const signedUrl = new URL(location);
  assert.equal(signedUrl.protocol, "https:", "artifact redirect is not HTTPS");
  const response = await fetch(signedUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.ok, true, `artifact download failed with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const readHandoffArchive = async (handoffAnchor, archiveBytes) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-build-plan039-handoff-"));
  const archivePath = join(directory, "plan039-handoff.zip");
  try {
    await writeFile(archivePath, archiveBytes, { flag: "wx" });
    const listing = await execFileAsync("unzip", ["-Z1", archivePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const entries = listing.stdout.split(/\r?\n/).filter((entry) => entry.length > 0);
    const readEntry = async (entry) => {
      const output = await execFileAsync("unzip", ["-p", archivePath, entry], {
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
      });
      return output.stdout;
    };
    return {
      entries,
      certificateBytes: await readEntry(handoffAnchor.certification.file),
      receiptBytes: await readEntry(handoffAnchor.receipt.file),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const git = async (args) => {
  const result = await execFileAsync("git", args, {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
};

const gitIsAncestor = async (ancestor, descendant) => {
  try {
    await git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
};

const changedPaths = async (from, to, paths, diffFilter) => (await git([
  "diff",
  "--name-only",
  "-z",
  ...(diffFilter === undefined ? [] : [`--diff-filter=${diffFilter}`]),
  `${from}..${to}`,
  "--",
  ...paths,
])).split("\0").filter((path) => path.length > 0).sort();

const authenticateCiRemote = async ({ apiBase, apiOrigin, repositoryName, sourceSha, token }) => {
  const eventName = requiredEnvironment("GITHUB_EVENT_NAME");
  const eventPath = requiredEnvironment("GITHUB_EVENT_PATH");
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  let eventSourceSha;
  let observedRef;
  let observedSha;

  if (eventName === "pull_request") {
    const pullUrl = event.pull_request?.url;
    assert.equal(typeof pullUrl, "string", "pull-request API URL is missing from the event");
    const pull = await requestJson({ apiOrigin, repositoryName, token, url: pullUrl });
    eventSourceSha = event.pull_request?.head?.sha;
    observedSha = pull.head?.sha;
    observedRef = `${pull.head?.repo?.full_name ?? "unknown"}:${pull.head?.ref ?? "unknown"}`;
  } else {
    assert.equal(eventName, "push", "unsupported certification event");
    const ref = event.ref;
    assert.equal(typeof ref, "string", "push ref is missing from the event");
    assert.equal(ref, requiredEnvironment("GITHUB_REF"), "push event ref differs from GITHUB_REF");
    assert.match(ref, /^refs\/heads\/.+$/, "push certification must name a branch head");
    eventSourceSha = event.after;
    const encodedRef = ref.slice("refs/".length).split("/").map(encodeURIComponent).join("/");
    const remoteRef = await requestJson({
      apiOrigin,
      repositoryName,
      token,
      url: `${apiBase}/repos/${repositoryName}/git/ref/${encodedRef}`,
    });
    observedSha = remoteRef.object?.sha;
    observedRef = remoteRef.ref;
  }

  return validateCurrentRemoteEvidence({
    eventName,
    eventSourceSha,
    observedRef,
    observedSha,
    repository: repositoryName,
    sourceSha,
  });
};

const authenticateHandoffArtifact = async ({ documents, repositoryName }) => {
  const { freezeAnchor, handoffAnchor } = documents;
  const apiBase = requiredEnvironment("GITHUB_API_URL").replace(/\/$/, "");
  const apiOrigin = new URL(apiBase).origin;
  const token = requiredEnvironment("GITHUB_TOKEN");
  const run = await requestJson({
    apiOrigin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/runs/${handoffAnchor.workflow.runId}`,
  });
  const artifact = await requestJson({
    apiOrigin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/artifacts/${handoffAnchor.aggregateArtifact.id}`,
  });
  validateHandoffApi({ artifact, handoffAnchor, run });
  const archiveBytes = await downloadArtifact({ apiOrigin, artifact, handoffAnchor, repositoryName, token });

  const archive = await readHandoffArchive(handoffAnchor, archiveBytes);
  const handoff = validateHandoffArchive({
    archiveBytes,
    freezeAnchor,
    handoffAnchor,
    ...archive,
  });
  return { handoff, transport: "github-api" };
};

export const certifyCurrentHead = async () => {
  const documents = await loadProfileDocuments(repository);
  const { expected, freezeAnchor, handoffAnchor, migrationAuthority, migrationPlan, profile } = documents;
  assert.equal(requiredEnvironment("CERTIFICATION_PROFILE"), profile.profileId, "workflow selected another profile");
  const sourceSha = requiredEnvironment("SOURCE_SHA");
  assert.equal(
    process.env.GITHUB_ACTIONS,
    "true",
    "Plan 039 certification is authoritative only inside the exact GitHub Actions gate sequence",
  );
  const repositoryName = requiredEnvironment("GITHUB_REPOSITORY");
  assert.equal(repositoryName, handoffAnchor.workflow.repository, "certification repository differs from the handoff");
  const receiptDirectory = requiredEnvironment(profile.receiptDirectoryEnvironment);
  assert.equal(isAbsolute(receiptDirectory), true, `${profile.receiptDirectoryEnvironment} must be absolute`);
  const relativeReceiptDirectory = relative(repository, resolve(receiptDirectory));
  assert.equal(
    relativeReceiptDirectory === ".."
      || relativeReceiptDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    true,
    `${profile.receiptDirectoryEnvironment} must be outside the repository`,
  );

  const dirty = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(dirty, "", "repository working tree is dirty");
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const releaseIsFreezeAncestor = await gitIsAncestor(profile.productionBaseline.releaseSha, profile.productionBaseline.freezeSha);
  const freezeIsHandoffAncestor = await gitIsAncestor(profile.productionBaseline.freezeSha, profile.productionBaseline.handoffSha);
  const handoffIsCurrentAncestor = await gitIsAncestor(profile.productionBaseline.handoffSha, sourceSha);
  const postHandoffPaths = await changedPaths(profile.productionBaseline.handoffSha, sourceSha, ["."]);
  const implementationAddedOrModifiedPaths = await changedPaths(
    profile.productionBaseline.handoffSha,
    sourceSha,
    profile.implementationFiles,
    "AM",
  );
  const immutablePublicDiff = await changedPaths(
    profile.productionBaseline.handoffSha,
    sourceSha,
    profile.immutablePublicPaths,
  );
  const handoffLegacySourceFiles = (await git([
    "ls-tree",
    "-r",
    "--name-only",
    profile.productionBaseline.handoffSha,
    "--",
    "packages/effect-build/src",
  ])).split(/\r?\n/).filter((path) => path.length > 0 && path !== "packages/effect-build/src/index.ts").sort();
  const coreMigration = validateCoreMigrationPlan({
    handoffLegacySourceFiles,
    migrationAuthority,
    migrationPlan,
  });
  const currentWorkspaceManifest = JSON.parse(
    await readFile(resolve(repository, profile.workspaceManifest.path), "utf8"),
  );
  const handoffWorkspaceManifest = JSON.parse(
    await git(["show", `${profile.productionBaseline.handoffSha}:${profile.workspaceManifest.path}`]),
  );
  const workspaceManifest = validateWorkspaceManifest({
    currentManifest: currentWorkspaceManifest,
    handoffManifest: handoffWorkspaceManifest,
    profile,
  });
  const currentInstructions = await readFile(resolve(repository, "AGENTS.md"), "utf8");
  const handoffInstructions = await git(["show", `${profile.productionBaseline.handoffSha}:AGENTS.md`]);
  const activeInstructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  const planSource = await readFile(resolve(repository, "plans/039-establish-core-capability-boundaries.md"), "utf8");
  const planIndexSource = await readFile(resolve(repository, "plans/README.md"), "utf8");
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const implementationState = validateCurrentImplementationState({
    changedPaths: postHandoffPaths,
    freezeIsHandoffAncestor,
    handoffIsCurrentAncestor,
    head,
    immutablePublicDiff,
    implementationAddedOrModifiedPaths,
    planIndexSource,
    planSource,
    profile,
    releaseIsFreezeAncestor,
    sourceSha,
    workflowSource,
  });

  const apiBase = requiredEnvironment("GITHUB_API_URL").replace(/\/$/, "");
  const apiOrigin = new URL(apiBase).origin;
  const currentRemote = await authenticateCiRemote({
    apiBase,
    apiOrigin,
    repositoryName,
    sourceSha,
    token: requiredEnvironment("GITHUB_TOKEN"),
  });
  const authenticatedHandoff = await authenticateHandoffArtifact({ documents, repositoryName });

  await mkdir(receiptDirectory, { recursive: true });
  assert.deepEqual(await readdir(receiptDirectory), [], "Plan 039 receipt directory is not empty");
  const historicalAuthority = historicalAuthoritySummary({ freezeAnchor, handoffAnchor });
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: profile.profileId,
    id: expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(expected),
    evidence: {
      historicalAuthority,
      handoffArtifact: {
        sourceSha: authenticatedHandoff.handoff.sourceSha,
        transport: authenticatedHandoff.transport,
      },
      currentHead: currentRemote,
      repositoryScope: { ...implementationState, activeInstructions, coreMigration, workspaceManifest },
      profileSeparation: {
        historicalProfileId: freezeAnchor.profileId,
        currentProfileId: profile.profileId,
        historicalArtifactsAreInputsOnly: true,
        currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
        currentReceiptIds: profile.currentReceiptIds,
        currentCertificateFile: profile.certificateFile,
      },
    },
  };
  validateCurrentReceipt({ expected, freezeAnchor, handoffAnchor, profile, receipt, sourceSha });
  const receiptFile = `${receipt.id}.json`;
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptDigest = sha256(receiptBytes);
  await writeFile(join(receiptDirectory, receiptFile), receiptBytes, { flag: "wx" });

  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: profile.profileId,
    plan: profile.plan,
    phase: profile.phase,
    sourceSha,
    workflow: {
      repository: repositoryName,
      workflow: requiredEnvironment("GITHUB_WORKFLOW"),
      runId: requiredEnvironment("GITHUB_RUN_ID"),
      runAttempt: requiredEnvironment("GITHUB_RUN_ATTEMPT"),
      eventName: requiredEnvironment("GITHUB_EVENT_NAME"),
    },
    historicalInputs: historicalAuthority,
    currentReceipts: [{ id: receipt.id, file: receiptFile, digest: receiptDigest }],
    claims: receipt.claims.length,
    result: "certified",
  };
  validateImplementationCertificate({
    certificate,
    currentReceiptDigest: receiptDigest,
    expected,
    freezeAnchor,
    handoffAnchor,
    profile,
    sourceSha,
  });
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  await writeFile(join(receiptDirectory, profile.certificateFile), certificateBytes, { flag: "wx" });
  assert.deepEqual(
    (await readdir(receiptDirectory)).sort(),
    [profile.certificateFile, receiptFile].sort(),
    "Plan 039 receipt directory contains a historical profile",
  );
  process.stdout.write(`EFFECT_BUILD_PLAN039_CERTIFIED=${sourceSha}\n`);
  process.stdout.write(`EFFECT_BUILD_PLAN039_CERTIFICATE_SHA256=${sha256(certificateBytes)}\n`);
  return certificate;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await certifyCurrentHead();
