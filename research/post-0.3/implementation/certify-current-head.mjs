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
  plan042CertificationRef,
  sha256,
  sourcePolicyVerifierOrigin,
  sourcePolicyVerifierPaths,
  validateActiveInstructions,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateImplementationCertificate,
  validatePlan041Api,
  validatePlan041Archive,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");

const requiredEnvironment = (name) => {
  const value = process.env[name];
  assert.equal(typeof value === "string" && value.length > 0, true, `${name} is missing`);
  return value;
};

const githubHeaders = (token) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "effect-build-plan042-certifier",
  "X-GitHub-Api-Version": "2022-11-28",
});

const trustedApiUrl = (value, origin, repositoryName) => {
  const url = new URL(value);
  assert.equal(url.origin, origin, "GitHub API request escaped its origin");
  assert.equal(url.pathname.startsWith(`/repos/${repositoryName}/`), true, "GitHub API request escaped repository");
  return url;
};

const requestJson = async ({ origin, repositoryName, token, url }) => {
  const response = await fetch(trustedApiUrl(url, origin, repositoryName), {
    headers: githubHeaders(token),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true, `GitHub API request failed with ${response.status}`);
  return await response.json();
};

const downloadArtifact = async ({ artifact, origin, plan041Anchor, repositoryName, token }) => {
  const url = trustedApiUrl(artifact.archive_download_url, origin, repositoryName);
  assert.equal(url.pathname, `/repos/${repositoryName}/actions/artifacts/${plan041Anchor.aggregateArtifact.id}/zip`);
  const redirect = await fetch(url, {
    headers: githubHeaders(token),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal([301, 302, 303, 307, 308].includes(redirect.status), true);
  const location = redirect.headers.get("location");
  assert.equal(typeof location, "string");
  const signed = new URL(location);
  assert.equal(signed.protocol, "https:");
  const response = await fetch(signed, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.ok, true, `artifact download failed with ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const readArchive = async (anchor, archiveBytes) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-build-plan042-plan041-"));
  const archive = join(directory, "plan041.zip");
  try {
    await writeFile(archive, archiveBytes, { flag: "wx" });
    const listing = await execute("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
    const entry = async (name) => (await execute("unzip", ["-p", archive, name], {
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    })).stdout;
    return {
      entries,
      certificateBytes: await entry(anchor.certification.file),
      receiptBytes: await entry(anchor.receipt.file),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const git = async (argv) => (await execute("git", argv, {
  cwd: repository,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})).stdout;

const gitBytes = async (argv) => (await execute("git", argv, {
  cwd: repository,
  encoding: "buffer",
  maxBuffer: 64 * 1024 * 1024,
})).stdout;

const ancestor = async (from, to) => {
  try {
    await git(["merge-base", "--is-ancestor", from, to]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
};

const changedPaths = async (from, to, paths, filter) => (await git([
  "diff",
  "--name-only",
  "-z",
  ...(filter === undefined ? [] : [`--diff-filter=${filter}`]),
  `${from}..${to}`,
  "--",
  ...paths,
])).split("\0").filter(Boolean).sort();

const authenticateRemoteHead = async ({ apiBase, origin, repositoryName, sourceSha, token }) => {
  const eventName = requiredEnvironment("GITHUB_EVENT_NAME");
  const event = JSON.parse(await readFile(requiredEnvironment("GITHUB_EVENT_PATH"), "utf8"));
  assert.equal(eventName, "push");
  const ref = requiredEnvironment("GITHUB_REF");
  const refType = requiredEnvironment("GITHUB_REF_TYPE");
  assert.equal(event.ref, ref);
  assert.equal(ref, plan042CertificationRef);
  assert.equal(refType, "branch");
  const encoded = ref.slice("refs/".length).split("/").map(encodeURIComponent).join("/");
  const remote = await requestJson({
    origin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/git/ref/${encoded}`,
  });
  return validateCurrentRemoteEvidence({
    eventName,
    eventSourceSha: event.after,
    observedRef: remote.ref,
    observedSha: remote.object.sha,
    repository: repositoryName,
    ref,
    refType,
    sourceSha,
  });
};

const authenticateSourcePolicyVerifierOrigin = async (sourceSha) => {
  const documents = await Promise.all(sourcePolicyVerifierPaths.map(async (path) => {
    const checkedOut = await readFile(resolve(repository, path));
    const committed = await gitBytes(["show", `${sourceSha}:${path}`]);
    assert.deepEqual(checkedOut, committed, `source policy/verifier bytes differ from ${sourceSha}: ${path}`);
    return { path, digest: sha256(checkedOut) };
  }));
  return sourcePolicyVerifierOrigin({ documents, sourceSha });
};

const authenticatePlan041Artifact = async ({ apiBase, documents, origin, repositoryName, token }) => {
  const { plan041Anchor } = documents;
  const run = await requestJson({
    origin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/runs/${plan041Anchor.workflow.runId}`,
  });
  const artifact = await requestJson({
    origin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/artifacts/${plan041Anchor.aggregateArtifact.id}`,
  });
  validatePlan041Api({ artifact, plan041Anchor, run });
  const archiveBytes = await downloadArtifact({ artifact, origin, plan041Anchor, repositoryName, token });
  const archive = await readArchive(plan041Anchor, archiveBytes);
  const authenticated = validatePlan041Archive({ archiveBytes, plan041Anchor, ...archive });
  return { ...authenticated, transport: "github-api" };
};

export const certifyCurrentHead = async () => {
  const documents = await loadProfileDocuments(repository);
  const {
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    profile,
  } = documents;
  assert.equal(requiredEnvironment("CERTIFICATION_PROFILE"), profile.profileId);
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Plan 042 certification is authoritative only in GitHub Actions");
  const sourceSha = requiredEnvironment("SOURCE_SHA");
  const repositoryName = requiredEnvironment("GITHUB_REPOSITORY");
  assert.equal(repositoryName, plan041Anchor.workflow.repository);
  const token = requiredEnvironment("GITHUB_TOKEN");
  const apiBase = requiredEnvironment("GITHUB_API_URL").replace(/\/$/, "");
  const origin = new URL(apiBase).origin;
  const receiptDirectory = requiredEnvironment(profile.receiptDirectoryEnvironment);
  assert.equal(isAbsolute(receiptDirectory), true);
  const receiptRelative = relative(repository, resolve(receiptDirectory));
  assert.equal(receiptRelative === ".." || receiptRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`), true);
  assert.equal(await git(["status", "--porcelain=v1", "--untracked-files=all"]), "", "working tree is dirty");
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const policyVerifierOrigin = await authenticateSourcePolicyVerifierOrigin(sourceSha);

  const ancestry = {
    releaseIsFreezeAncestor: await ancestor(profile.productionBaseline.releaseSha, profile.productionBaseline.freezeSha),
    freezeIsHandoffAncestor: await ancestor(profile.productionBaseline.freezeSha, profile.productionBaseline.handoffSha),
    handoffIsPlan039Ancestor: await ancestor(profile.productionBaseline.handoffSha, profile.productionBaseline.plan039Sha),
    plan039IsPlan040Ancestor: await ancestor(profile.productionBaseline.plan039Sha, profile.productionBaseline.plan040Sha),
    plan040IsPlan041Ancestor: await ancestor(profile.productionBaseline.plan040Sha, profile.productionBaseline.plan041Sha),
    plan041IsCurrentAncestor: await ancestor(profile.productionBaseline.plan041Sha, sourceSha),
  };
  const currentManifest = JSON.parse(await readFile(resolve(repository, profile.workspaceManifest.path), "utf8"));
  const handoffManifest = JSON.parse(await git(["show", `${profile.productionBaseline.handoffSha}:${profile.workspaceManifest.path}`]));
  const workspaceManifest = validateWorkspaceManifest({ currentManifest, handoffManifest, profile });
  const currentInstructions = await readFile(resolve(repository, "AGENTS.md"), "utf8");
  const handoffInstructions = await git(["show", `${profile.productionBaseline.handoffSha}:AGENTS.md`]);
  const activeInstructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  const implementationState = validateCurrentImplementationState({
    ancestry,
    changedPaths: await changedPaths(profile.productionBaseline.handoffSha, sourceSha, ["."]),
    coreStagedDiff: await changedPaths(profile.productionBaseline.plan039Sha, sourceSha, profile.coreStagedFiles),
    esbuildStagedDiff: await changedPaths(profile.productionBaseline.plan040Sha, sourceSha, profile.esbuildImplementationFiles),
    bunStagedDiff: await changedPaths(profile.productionBaseline.plan041Sha, sourceSha, profile.bunImplementationFiles),
    head,
    immutablePublicDiff: await changedPaths(profile.productionBaseline.handoffSha, sourceSha, profile.immutablePublicPaths),
    implementationAddedOrModifiedPaths: await changedPaths(
      profile.productionBaseline.plan041Sha,
      sourceSha,
      profile.denoImplementationFiles,
      "AM",
    ),
    planIndexSource: await readFile(resolve(repository, "plans/README.md"), "utf8"),
    planSource: await readFile(resolve(repository, "plans/042-add-deno-bundle-command-lanes.md"), "utf8"),
    profile,
    sourceSha,
    workflowSource: await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8"),
  });
  const currentHead = await authenticateRemoteHead({ apiBase, origin, repositoryName, sourceSha, token });
  const plan041 = await authenticatePlan041Artifact({ apiBase, documents, origin, repositoryName, token });

  await mkdir(receiptDirectory, { recursive: true });
  assert.deepEqual(await readdir(receiptDirectory), [], "Plan 042 receipt directory is not empty");
  const historicalAuthority = historicalAuthoritySummary({
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
  });
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: profile.profileId,
    id: expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(expected),
    evidence: {
      historicalAuthority,
      plan041Artifact: { sourceSha: plan041.sourceSha, transport: plan041.transport },
      currentHead,
      sourcePolicyVerifierOrigin: policyVerifierOrigin,
      repositoryScope: { ...implementationState, activeInstructions, workspaceManifest },
      profileSeparation: {
        historicalProfileIds: profile.historicalProfileIds,
        currentProfileId: profile.profileId,
        historicalArtifactsAreInputsOnly: true,
        currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
        currentReceiptIds: profile.currentReceiptIds,
        currentCertificateFile: profile.certificateFile,
      },
    },
  };
  validateCurrentReceipt({
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    profile,
    receipt,
    sourceSha,
  });
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
      ref: requiredEnvironment("GITHUB_REF"),
      refType: requiredEnvironment("GITHUB_REF_TYPE"),
    },
    historicalInputs: historicalAuthority,
    sourcePolicyVerifierOrigin: policyVerifierOrigin,
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
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    profile,
    sourcePolicyVerifierOrigin: policyVerifierOrigin,
    sourceSha,
  });
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  await writeFile(join(receiptDirectory, profile.certificateFile), certificateBytes, { flag: "wx" });
  assert.deepEqual(sorted(await readdir(receiptDirectory)), sorted([profile.certificateFile, receiptFile]));
  process.stdout.write(`EFFECT_BUILD_PLAN042_CERTIFIED=${sourceSha}\n`);
  process.stdout.write(`EFFECT_BUILD_PLAN042_CERTIFICATE_SHA256=${sha256(certificateBytes)}\n`);
  return certificate;
};

const sorted = (values) => [...values].sort();
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await certifyCurrentHead();
