import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  expectedReceiptClaims,
  loadProfileDocuments,
  sha256,
  validateCurrentHandoffState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateHistoricalApi,
  validateHistoricalArchive,
  validateImplementationCertificate,
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
  Authorization: `Bearer ${token}`,
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

const downloadArtifact = async ({ anchor, apiOrigin, artifact, repositoryName, token }) => {
  const archiveUrl = assertTrustedApiUrl(artifact.archive_download_url, apiOrigin, repositoryName);
  assert.equal(
    archiveUrl.pathname,
    `/repos/${repositoryName}/actions/artifacts/${anchor.aggregateArtifact.id}/zip`,
    "aggregate artifact download URL drifted",
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
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.byteLength, anchor.aggregateArtifact.sizeInBytes, "downloaded artifact size drifted");
  return bytes;
};

const readArchive = async (anchor, archiveBytes) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-build-plan039-freeze-"));
  const archivePath = join(directory, "historical-freeze.zip");
  try {
    await writeFile(archivePath, archiveBytes, { flag: "wx" });
    const listing = await execFileAsync("unzip", ["-Z1", archivePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const entries = listing.stdout.split(/\r?\n/).filter((entry) => entry.length > 0);
    const expectedEntries = [anchor.certification.file, ...anchor.receipts.map((receipt) => receipt.file)];
    const bytes = new Map();
    for (const entry of expectedEntries) {
      const output = await execFileAsync("unzip", ["-p", archivePath, entry], {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      });
      bytes.set(entry, output.stdout);
    }
    return {
      entries,
      certificateBytes: bytes.get(anchor.certification.file),
      receiptBytes: new Map(anchor.receipts.map((receipt) => [receipt.file, bytes.get(receipt.file)])),
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

const changedPaths = async (from, to, paths) => (await git([
  "diff",
  "--name-only",
  "-z",
  `${from}..${to}`,
  "--",
  ...paths,
])).split("\0").filter((path) => path.length > 0).sort();

const authenticateCurrentRemote = async ({ apiBase, apiOrigin, repositoryName, sourceSha, token }) => {
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
    assert.equal(ref.startsWith("refs/"), true, "push event ref is malformed");
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

  validateCurrentRemoteEvidence({ eventName, eventSourceSha, observedSha, repository: repositoryName, sourceSha });
  return { eventName, eventSourceSha, observedRef, observedSha, repository: repositoryName };
};

export const certifyCurrentHead = async () => {
  const { anchor, expected, profile } = await loadProfileDocuments(repository);
  assert.equal(requiredEnvironment("CERTIFICATION_PROFILE"), profile.profileId, "workflow selected another profile");
  const sourceSha = requiredEnvironment("SOURCE_SHA");
  const repositoryName = requiredEnvironment("GITHUB_REPOSITORY");
  assert.equal(repositoryName, anchor.workflow.repository, "workflow repository differs from the freeze repository");
  const apiBase = requiredEnvironment("GITHUB_API_URL").replace(/\/$/, "");
  const apiOrigin = new URL(apiBase).origin;
  const token = requiredEnvironment("GITHUB_TOKEN");
  const receiptDirectory = requiredEnvironment(profile.receiptDirectoryEnvironment);
  assert.equal(isAbsolute(receiptDirectory), true, `${profile.receiptDirectoryEnvironment} must be absolute`);
  const relativeReceiptDirectory = relative(repository, resolve(receiptDirectory));
  assert.equal(
    relativeReceiptDirectory === ".." || relativeReceiptDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    true,
    `${profile.receiptDirectoryEnvironment} must be outside the repository`,
  );

  const dirty = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(dirty, "", "repository working tree is dirty");
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const freezeIsAncestor = await gitIsAncestor(anchor.sourceSha, sourceSha);
  const releaseIsAncestor = await gitIsAncestor(anchor.releaseSha, sourceSha);
  const postFreezePaths = await changedPaths(anchor.sourceSha, sourceSha, ["."]);
  const productionReleaseDiff = await changedPaths(
    profile.productionBaseline.releaseSha,
    profile.productionBaseline.freezeSha,
    profile.productionBaseline.paths,
  );
  const productionFreezeDiff = await changedPaths(
    profile.productionBaseline.freezeSha,
    sourceSha,
    profile.productionBaseline.paths,
  );
  const planSource = await readFile(resolve(repository, "plans/039-establish-core-capability-boundaries.md"), "utf8");
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const handoff = validateCurrentHandoffState({
    anchor,
    changedPaths: postFreezePaths,
    freezeIsAncestor,
    head,
    planSource,
    productionFreezeDiff,
    productionReleaseDiff,
    profile,
    releaseIsAncestor,
    sourceSha,
    workflowSource,
  });

  const currentRemote = await authenticateCurrentRemote({ apiBase, apiOrigin, repositoryName, sourceSha, token });
  const run = await requestJson({
    apiOrigin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/runs/${anchor.workflow.runId}`,
  });
  const artifact = await requestJson({
    apiOrigin,
    repositoryName,
    token,
    url: `${apiBase}/repos/${repositoryName}/actions/artifacts/${anchor.aggregateArtifact.id}`,
  });
  validateHistoricalApi({ anchor, artifact, run });
  const archiveBytes = await downloadArtifact({ anchor, apiOrigin, artifact, repositoryName, token });
  const archive = await readArchive(anchor, archiveBytes);
  const historicalFreeze = validateHistoricalArchive({ anchor, archiveBytes, ...archive });
  const historicalFreezeReceiptSetDigest = sha256(Buffer.from(JSON.stringify(historicalFreeze.receipts)));

  await mkdir(receiptDirectory, { recursive: true });
  assert.deepEqual(await readdir(receiptDirectory), [], "Plan 039 receipt directory is not empty");
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: profile.profileId,
    id: expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(expected),
    evidence: {
      historicalFreeze: {
        profileId: historicalFreeze.profileId,
        sourceSha: historicalFreeze.sourceSha,
        workflow: historicalFreeze.workflow,
        aggregateArtifact: historicalFreeze.aggregateArtifact,
        certification: historicalFreeze.certification,
        receiptCount: historicalFreeze.receipts.length,
        receiptSetDigest: historicalFreezeReceiptSetDigest,
      },
      currentHead: currentRemote,
      repositoryScope: handoff,
      profileSeparation: {
        historicalProfileId: anchor.profileId,
        currentProfileId: profile.profileId,
        historicalArtifactIsInputOnly: true,
        currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
        currentReceiptIds: profile.currentReceiptIds,
        currentCertificateFile: profile.certificateFile,
      },
    },
  };
  validateCurrentReceipt({ expected, profile, receipt, sourceSha });
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
      workflow: process.env.GITHUB_WORKFLOW ?? "local",
      runId: process.env.GITHUB_RUN_ID ?? "local",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "local",
      eventName: process.env.GITHUB_EVENT_NAME ?? "local",
    },
    historicalInputs: { freeze: historicalFreeze },
    currentReceipts: [{ id: receipt.id, file: receiptFile, digest: receiptDigest }],
    claims: receipt.claims.length,
    result: "certified",
  };
  validateImplementationCertificate({ certificate, currentReceiptDigest: receiptDigest, profile, sourceSha });
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  await writeFile(join(receiptDirectory, profile.certificateFile), certificateBytes, { flag: "wx" });
  assert.deepEqual(
    (await readdir(receiptDirectory)).sort(),
    [profile.certificateFile, receiptFile].sort(),
    "Plan 039 receipt directory contains a foreign profile",
  );
  process.stdout.write(`EFFECT_BUILD_PLAN039_CERTIFIED=${sourceSha}\n`);
  process.stdout.write(`EFFECT_BUILD_PLAN039_CERTIFICATE_SHA256=${sha256(certificateBytes)}\n`);
  return certificate;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await certifyCurrentHead();
