import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifyCandidate } from "../../../scripts/verify-candidate.mjs";

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const freezeSha = "a3017657e0851530892a9f3d2d55ac5736769881";
const releaseSha = "f06f96ca88b6278e5f23a898d758b99fa9322108";
const expectedGateIds = [
  "ordinary-ci",
  "migration-ledger",
  "packed-consumers",
  "external-author-adapter",
  "real-bun",
  "real-deno",
  "real-node-sea",
  "windows-lifecycle",
];
const expectedReceiptFiles = [
  "external-author-adapter.log",
  "migration.log",
  "packed-consumers.log",
  "verify.log",
];
const historicalAnchors = [
  "freeze-trust-anchor.json",
  "plan039-trust-anchor.json",
  "plan040-trust-anchor.json",
  "plan041-trust-anchor.json",
  "plan042-trust-anchor.json",
  "plan043-trust-anchor.json",
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const exactSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const git = async (...argv) => (await execute("git", argv, { cwd: repository })).stdout.trim();

const parseArguments = (argv) => {
  if (
    argv.length !== 10
    || argv[0] !== "--source"
    || argv[2] !== "--candidate-dir"
    || argv[4] !== "--receipts-dir"
    || argv[6] !== "--remote-ref"
    || argv[8] !== "--gate-results"
  ) {
    throw new Error(
      "usage: certify-plan044-candidate.mjs --source <sha> --candidate-dir <absolute-path> --receipts-dir <absolute-path> --remote-ref <refs/heads/...> --gate-results <json>",
    );
  }
  const [source, candidateDirectory, receiptDirectory, remoteRef, gates] = [argv[1], argv[3], argv[5], argv[7], argv[9]];
  assert(exactSha(source), "candidate source must be a lowercase 40-character SHA");
  assert(isAbsolute(candidateDirectory), "candidate directory must be absolute");
  assert(isAbsolute(receiptDirectory), "receipt directory must be absolute");
  assert(/^refs\/heads\/codex\/044-hard-cut-certify$/.test(remoteRef), "candidate ref is not the Plan 044 branch");
  let gateResults;
  try {
    gateResults = JSON.parse(gates);
  } catch {
    throw new Error("candidate gate results are not JSON");
  }
  assert(
    gateResults !== null
      && typeof gateResults === "object"
      && !Array.isArray(gateResults)
      && JSON.stringify(Object.keys(gateResults).sort()) === JSON.stringify([...expectedGateIds].sort()),
    "candidate gate result keys do not match the Plan 044 profile",
  );
  for (const gate of expectedGateIds) assert(gateResults[gate] === "success", `${gate} did not succeed`);
  return {
    source,
    candidateDirectory: resolve(candidateDirectory),
    receiptDirectory: resolve(receiptDirectory),
    remoteRef,
    gateResults,
  };
};

const historicalInputs = async () => {
  const freezeFiles = [
    "research/post-0.3/freeze/SURFACE.json",
    "research/post-0.3/freeze/MIGRATION.json",
  ];
  const frozen = {};
  for (const path of freezeFiles) {
    const [current, historical] = await Promise.all([
      readFile(resolve(repository, path)),
      execute("git", ["show", `${freezeSha}:${path}`], { cwd: repository, encoding: "buffer" }),
    ]);
    assert(Buffer.compare(current, historical.stdout) === 0, `${path} differs from its immutable freeze SHA`);
    frozen[path] = sha256(current);
  }

  const anchors = {};
  for (const filename of historicalAnchors) {
    const anchor = await readJson(resolve(here, filename));
    assert(anchor.workflow?.repository === "mannyc2/effect-build", `${filename} repository changed`);
    assert(anchor.workflow?.conclusion === "success", `${filename} is not a successful historical receipt`);
    assert(anchor.certification?.result === "certified", `${filename} is not a certified historical receipt`);
    assert(exactSha(anchor.sourceSha), `${filename} source SHA is malformed`);
    if (filename !== "freeze-trust-anchor.json") {
      assert(anchor.releaseSha === releaseSha, `${filename} release lineage changed`);
      assert(anchor.freezeSha === freezeSha, `${filename} freeze lineage changed`);
    }
    if (filename === "freeze-trust-anchor.json") {
      assert(anchor.sourceSha === freezeSha, "freeze trust anchor source changed");
      assert(typeof anchor.aggregateArtifact?.digest === "string", "freeze trust anchor has no artifact digest");
    }
    anchors[filename] = {
      source: anchor.sourceSha,
      run: anchor.workflow.runId,
      artifact: anchor.aggregateArtifact?.digest,
      digest: sha256(await readFile(resolve(here, filename))),
    };
  }
  return { anchors, frozen };
};

const verifyHistoricalGitHubReceipts = async () => {
  assert(process.env.GITHUB_ACTIONS === "true", "Plan 044 certification is authoritative only in GitHub Actions");
  for (const filename of historicalAnchors) {
    const anchor = await readJson(resolve(here, filename));
    const run = JSON.parse((await execute("gh", ["api", `repos/mannyc2/effect-build/actions/runs/${anchor.workflow.runId}`])).stdout);
    assert(run.head_sha === anchor.sourceSha, `${filename} GitHub run source changed`);
    assert(run.conclusion === "success", `${filename} GitHub run is not successful`);
    assert(run.name === anchor.workflow.name, `${filename} GitHub workflow changed`);
    if (anchor.aggregateArtifact !== undefined) {
      const artifact = JSON.parse((await execute(
        "gh",
        ["api", `repos/mannyc2/effect-build/actions/artifacts/${anchor.aggregateArtifact.id}`],
      )).stdout);
      assert(artifact.expired === false, `${filename} GitHub artifact expired`);
      assert(artifact.digest === anchor.aggregateArtifact.digest, `${filename} GitHub artifact digest changed`);
      assert(artifact.workflow_run?.head_sha === anchor.sourceSha, `${filename} artifact source changed`);
    }
  }
};

const verifyReceiptInventory = async (directory) => {
  const entries = (await readdir(directory)).sort();
  assert(JSON.stringify(entries) === JSON.stringify(expectedReceiptFiles), "candidate receipts are incomplete or contain an unexpected file");
  const digests = {};
  for (const filename of expectedReceiptFiles) {
    const bytes = await readFile(join(directory, filename));
    assert(bytes.byteLength > 0, `${filename} is empty`);
    digests[filename] = sha256(bytes);
  }
  return digests;
};

const certify = async ({ source, candidateDirectory, receiptDirectory, remoteRef, gateResults }) => {
  assert(await git("rev-parse", "HEAD") === source, "checked-out HEAD is not the candidate source");
  assert((await git("status", "--porcelain")).length === 0, "candidate checkout is dirty");
  try {
    await execute("git", ["merge-base", "--is-ancestor", releaseSha, source], { cwd: repository });
  } catch {
    throw new Error("candidate does not descend from the v0.3.0 release");
  }
  const [candidate, historical, receiptDigests] = await Promise.all([
    verifyCandidate({ directory: candidateDirectory, source }),
    historicalInputs(),
    verifyReceiptInventory(receiptDirectory),
  ]);
  await verifyHistoricalGitHubReceipts();
  const remote = (await execute("git", ["ls-remote", "--exit-code", "origin", remoteRef], { cwd: repository })).stdout.trim();
  assert(remote === `${source}\t${remoteRef}`, "fresh remote candidate head does not match the checked-out source");

  const candidateManifest = await readFile(join(candidateDirectory, "manifest.json"));
  const certificate = {
    schema: "effect-build/plan044-candidate-certification@1",
    plan: "044",
    result: "certified",
    source,
    remote: { ref: remoteRef, source },
    candidate: {
      directory: "candidate",
      manifest: sha256(candidateManifest),
      packages: candidate.packages,
      consumers: candidate.consumers,
    },
    gates: gateResults,
    freeze: {
      source: freezeSha,
      files: historical.frozen,
      anchor: historical.anchors["freeze-trust-anchor.json"],
    },
    implementationReceipts: Object.fromEntries(
      Object.entries(historical.anchors).filter(([filename]) => filename !== "freeze-trust-anchor.json"),
    ),
    receipts: receiptDigests,
  };
  await writeFile(join(receiptDirectory, "plan044-candidate.json"), `${JSON.stringify(certificate, null, 2)}\n`);
  process.stdout.write(`EFFECT_BUILD_PLAN044_CERTIFIED=${source}\n`);
  process.stdout.write(`EFFECT_BUILD_PLAN044_CERTIFICATE_SHA256=${sha256(JSON.stringify(certificate, null, 2) + "\n")}\n`);
};

const options = parseArguments(process.argv.slice(2));
await mkdir(options.receiptDirectory, { recursive: true });
await certify(options);
