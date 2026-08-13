import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const targetRequiredJobNames = [
  "quality",
  "real-tools",
  "publication-hosts (ubuntu-24.04)",
  "publication-hosts (macos-15)",
  "publication-hosts (windows-2025)",
  "target-support (bun)",
  "target-support (deno)",
];
const effectRequiredJobNames = [
  ...targetRequiredJobNames,
  "effect-compatibility (4.0.0-beta.104)",
  "effect-compatibility (4.0.0-rc.108)",
];
const receiptContracts = new Map([
  ["target-v1", targetRequiredJobNames],
  ["effect-v1", effectRequiredJobNames],
  ["node-sea-v1", [...effectRequiredJobNames, "node-sea"]],
]);

const parseArguments = (argv) => {
  const values = new Map();
  const supportedFlags = new Set(["--receipt-file", "--prefix", "--contract"]);

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!supportedFlags.has(flag)) {
      throw new Error(`unexpected argument: ${flag ?? "<missing>"}`);
    }
    if (values.has(flag)) {
      throw new Error(`duplicate argument: ${flag}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    values.set(flag, value);
  }

  const receiptFile = values.get("--receipt-file");
  const prefix = values.get("--prefix");
  const contract = values.get("--contract") ?? "target-v1";
  if (receiptFile === undefined) throw new Error("--receipt-file is required");
  if (prefix === undefined) throw new Error("--prefix is required");
  if (prefix.length === 0) throw new Error("--prefix must not be empty");
  if (!receiptContracts.has(contract)) {
    throw new Error(
      `unknown receipt contract ${JSON.stringify(contract)}; expected one of ${[...receiptContracts.keys()].join(", ")}`,
    );
  }
  return { receiptFile, prefix, contract };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseReceipt = (source, prefix) => {
  const candidates = source.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  if (candidates.length !== 1) {
    throw new Error(`receipt file must contain exactly one line beginning with ${JSON.stringify(prefix)}`);
  }

  const pattern = new RegExp(
    `^${escapeRegExp(prefix)} https://github\\.com/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/([A-Za-z0-9_.-]+)/actions/runs/([1-9][0-9]*) @ ([0-9a-f]{40})$`,
  );
  const match = pattern.exec(candidates[0]);
  if (match === null) {
    throw new Error(
      `receipt line must exactly match "${prefix} https://github.com/<owner>/<repo>/actions/runs/<positive-id> @ <40-lowercase-hex-sha>"`,
    );
  }

  const [, owner, repository, runId, sha] = match;
  return {
    owner,
    repository,
    runId,
    sha,
    url: `https://github.com/${owner}/${repository}/actions/runs/${runId}`,
  };
};

const ghApi = async (endpoint) => {
  const { stdout } = await execFileAsync("gh", ["api", endpoint], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`gh api returned invalid JSON for ${endpoint}`);
  }
};

const requireRun = (run, receipt) => {
  if (run === null || typeof run !== "object" || Array.isArray(run)) {
    throw new Error("workflow run response must be an object");
  }
  if (run.html_url !== receipt.url) {
    throw new Error(
      `workflow run html_url mismatch: expected ${receipt.url}, received ${JSON.stringify(run.html_url)}`,
    );
  }
  if (run.head_sha !== receipt.sha) {
    throw new Error(
      `workflow run head_sha mismatch: expected ${receipt.sha}, received ${JSON.stringify(run.head_sha)}`,
    );
  }
  if (run.path !== ".github/workflows/ci.yml") {
    throw new Error(
      `workflow run path must be exactly .github/workflows/ci.yml, received ${JSON.stringify(run.path)}`,
    );
  }
  if (run.conclusion !== "success") {
    throw new Error(`workflow run conclusion must be success, received ${JSON.stringify(run.conclusion)}`);
  }
  if (run.event !== "push" && run.event !== "pull_request") {
    throw new Error(`workflow run event must be push or pull_request, received ${JSON.stringify(run.event)}`);
  }
};

const requireJobs = (response, requiredJobNames) => {
  if (response === null || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.jobs)) {
    throw new Error("workflow jobs response must contain a jobs array");
  }
  if (Number.isInteger(response.total_count) && response.total_count > 100) {
    throw new Error(`workflow jobs response exceeds the requested 100-job page: received ${response.total_count}`);
  }
  if (!Number.isInteger(response.total_count) || response.total_count !== response.jobs.length) {
    throw new Error("workflow jobs response is incomplete or has an invalid total_count");
  }

  for (const requiredName of requiredJobNames) {
    const matches = response.jobs.filter((job) => job !== null && typeof job === "object" && job.name === requiredName);
    if (matches.length === 0) {
      throw new Error(`required job ${JSON.stringify(requiredName)} is missing`);
    }
    if (matches.length !== 1) {
      throw new Error(`required job ${JSON.stringify(requiredName)} appears ${matches.length} times`);
    }
    if (matches[0].status !== "completed") {
      throw new Error(
        `required job ${JSON.stringify(requiredName)} status must be completed, received ${JSON.stringify(matches[0].status)}`,
      );
    }
    if (matches[0].conclusion !== "success") {
      throw new Error(
        `required job ${JSON.stringify(requiredName)} conclusion must be success, received ${JSON.stringify(matches[0].conclusion)}`,
      );
    }
  }
};

const main = async () => {
  const { receiptFile, prefix, contract } = parseArguments(process.argv.slice(2));
  const receipt = parseReceipt(await readFile(resolve(receiptFile), "utf8"), prefix);
  const endpoint = `repos/${receipt.owner}/${receipt.repository}/actions/runs/${receipt.runId}`;
  const run = await ghApi(endpoint);
  const jobs = await ghApi(`${endpoint}/jobs?per_page=100`);

  requireRun(run, receipt);
  requireJobs(jobs, receiptContracts.get(contract));
  console.log(`verified workflow receipt ${receipt.url} @ ${receipt.sha}`);
};

await main().catch((error) => {
  console.error(`workflow receipt verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
