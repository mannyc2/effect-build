import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyCandidate } from "./verify-candidate.mjs";

export const releaseRepository = "mannyc2/effect-build";
export const releaseWorkflowName = "Release";
export const releaseWorkflowPath = ".github/workflows/release.yml";
export const releaseBranch = "codex/granular-integration-program";
export const rawCandidateArtifactName = "effect-build-0.3.0-candidate";

const sha = /^[0-9a-f]{40}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const positiveDecimal = /^[1-9][0-9]*$/;
const exactKeys = (value, expected) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);
const record = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};
const fail = (reason) => {
  throw new Error(reason);
};

const decimal = (value, label) => {
  if (typeof value !== "string" || !positiveDecimal.test(value)) {
    fail(`${label} must be a canonical positive decimal string.`);
  }
  return value;
};

const githubId = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive safe integer.`);
  }
  return String(value);
};

export const prepareReportArtifactName = (attempt) =>
  `effect-build-0.3.0-prepare-report-${decimal(attempt, "Run attempt")}`;

export const parsePreparedReference = (value) => {
  if (typeof value !== "string") fail("Prepared reference must be a string.");
  const match = new RegExp(
    "^prepared:gha:([A-Za-z0-9._~-]{1,255})/([A-Za-z0-9._~-]{1,255})"
      + "/runs/([1-9][0-9]*)/attempts/([1-9][0-9]*)"
      + "/artifacts/([A-Za-z0-9._~-]{1,255})#sha256-([0-9a-f]{64})$",
  ).exec(value);
  if (match === null) fail("Prepared reference does not use the canonical prepared:gha grammar.");
  const parsed = {
    owner: match[1],
    repository: match[2],
    runId: match[3],
    attempt: match[4],
    artifactName: match[5],
    digest: match[6],
  };
  if (`${parsed.owner}/${parsed.repository}` !== releaseRepository) {
    fail("Prepared reference repository does not match the release repository.");
  }
  const expectedName = `ts-release-prepared-${parsed.attempt}-${parsed.digest}`;
  if (parsed.artifactName !== expectedName) {
    fail("Prepared reference artifact identity does not match its attempt and digest.");
  }
  return Object.freeze(parsed);
};

const verifyArtifactWorkflow = (artifact, source, runId, label) => {
  const workflowRun = record(artifact.workflow_run, `${label} workflow_run`);
  if (githubId(workflowRun.id, `${label} workflow run id`) !== runId) {
    fail(`${label} workflow run id does not match the candidate run.`);
  }
  if (workflowRun.head_branch !== releaseBranch) {
    fail(`${label} workflow branch does not match the release branch.`);
  }
  if (workflowRun.head_sha !== source) {
    fail(`${label} workflow head SHA does not match the exact source.`);
  }
};

const verifyArtifact = (artifact, input) => {
  if (artifact.name !== input.name) fail(`${input.label} name does not match.`);
  if (artifact.expired !== false) fail(`${input.label} is expired.`);
  if (typeof artifact.digest !== "string" || !digest.test(artifact.digest)) {
    fail(`${input.label} digest is not one canonical GitHub SHA-256 digest.`);
  }
  verifyArtifactWorkflow(artifact, input.source, input.runId, input.label);
  return artifact;
};

export const verifyActionReport = ({ report, command, preparedRef }) => {
  const expectedKeys = command === "prepare"
    ? ["schemaVersion", "command", "status", "prepared"]
    : command === "publish"
    ? ["schemaVersion", "command", "status", "prepared", "report"]
    : fail("Action report command role must be prepare or publish.");
  if (!exactKeys(report, expectedKeys)) {
    fail(`${command === "prepare" ? "Prepare" : "Publish"} report keys do not match its exact role.`);
  }
  if (report.schemaVersion !== "ts-release-action-report/v2") fail("Action report schema does not match.");
  if (report.command !== command) fail(`Action report command is not ${command}.`);
  if (report.status !== "complete") fail(`Action report status is not complete for ${command}.`);
  if (report.prepared !== preparedRef) fail(`Action report prepared reference does not match for ${command}.`);
  if (command === "publish") {
    const publication = record(report.report, "Publication report");
    if (publication.status !== "complete") fail("Publication report status is not complete.");
  }
  return report;
};

const runRecord = ({ run, source, candidateRunId }) => {
  const candidate = record(run, "Candidate workflow run");
  if (githubId(candidate.id, "Candidate workflow run id") !== candidateRunId) {
    fail("Candidate workflow run id does not match the requested run.");
  }
  if (candidate.name !== releaseWorkflowName) fail("Candidate workflow name does not match Release.");
  if (candidate.path !== releaseWorkflowPath) fail("Candidate workflow path does not match release.yml.");
  if (candidate.event !== "workflow_dispatch") fail("Candidate workflow event is not workflow_dispatch.");
  if (candidate.head_branch !== releaseBranch) fail("Candidate workflow branch does not match the release branch.");
  if (candidate.head_sha !== source) fail("Candidate workflow head SHA does not match the exact source.");
  if (candidate.status !== "completed") fail("Candidate workflow status is not completed.");
  if (candidate.conclusion !== "success") fail("Candidate workflow conclusion is not success.");
  const repository = record(candidate.repository, "Candidate workflow repository");
  if (repository.full_name !== releaseRepository) fail("Candidate workflow repository does not match.");
  return candidate;
};

const artifactRecords = (value) => {
  const response = record(value, "Candidate artifacts response");
  if (!Number.isSafeInteger(response.total_count) || response.total_count < 0) {
    fail("Candidate artifacts total_count is not a nonnegative safe integer.");
  }
  if (!Array.isArray(response.artifacts) || response.total_count !== response.artifacts.length) {
    fail("Candidate artifacts total_count does not match the artifacts array.");
  }
  const ids = new Set();
  const names = new Set();
  for (const value of response.artifacts) {
    const artifact = record(value, "Candidate artifact");
    const id = githubId(artifact.id, "Candidate artifact id");
    if (ids.has(id)) fail(`Candidate artifacts contain duplicate id ${id}.`);
    ids.add(id);
    if (typeof artifact.name !== "string" || artifact.name.length === 0) {
      fail("Candidate artifact name must be nonempty.");
    }
    if (names.has(artifact.name)) fail(`Candidate artifacts contain duplicate name ${artifact.name}.`);
    names.add(artifact.name);
  }
  return response.artifacts;
};

const namedArtifact = (artifacts, name, label) => {
  const selected = artifacts.filter((artifact) => artifact.name === name);
  if (selected.length !== 1) fail(`${label} must exist exactly once.`);
  return selected[0];
};

export const verifyReleaseEvidence = ({
  evidence,
  source,
  candidateRunId,
  candidateArtifactId,
  candidateArtifactDigest,
  preparedRef,
}) => {
  if (!sha.test(source)) fail("Release source must be one exact lowercase 40-character SHA.");
  decimal(candidateRunId, "Candidate run id");
  decimal(candidateArtifactId, "Candidate artifact id");
  if (!digest.test(candidateArtifactDigest)) {
    fail("Candidate artifact digest must be sha256: followed by 64 lowercase hexadecimal characters.");
  }
  const wrapped = record(evidence, "Release evidence");
  if (!exactKeys(wrapped, ["run", "artifacts", "prepareReport"])) {
    fail("Release evidence must contain exactly run, artifacts, and prepareReport keys.");
  }
  const run = runRecord({ run: wrapped.run, source, candidateRunId });
  const runAttempt = githubId(run.run_attempt, "Candidate workflow run attempt");
  const prepared = parsePreparedReference(preparedRef);
  if (prepared.runId !== candidateRunId) fail("Prepared reference run id does not match the candidate run.");
  if (prepared.attempt !== runAttempt) fail("Prepared reference attempt does not match the candidate run attempt.");

  const artifacts = artifactRecords(wrapped.artifacts);
  const reportArtifactName = prepareReportArtifactName(runAttempt);
  const roleNames = [rawCandidateArtifactName, prepared.artifactName, reportArtifactName];
  if (artifacts.length !== roleNames.length || artifacts.some((artifact) => !roleNames.includes(artifact.name))) {
    fail("Candidate run must contain exactly three role artifacts: raw candidate, prepared release, and prepare report.");
  }
  const raw = verifyArtifact(namedArtifact(artifacts, rawCandidateArtifactName, "Raw candidate artifact"), {
    label: "Raw candidate artifact",
    name: rawCandidateArtifactName,
    source,
    runId: candidateRunId,
  });
  if (githubId(raw.id, "Raw candidate artifact id") !== candidateArtifactId) {
    fail("Raw candidate artifact id does not match the dispatch input artifact id.");
  }
  if (raw.digest !== candidateArtifactDigest) {
    fail("Raw candidate artifact digest does not match the dispatch input digest.");
  }

  verifyArtifact(namedArtifact(artifacts, prepared.artifactName, "Prepared artifact"), {
    label: "Prepared artifact",
    name: prepared.artifactName,
    source,
    runId: candidateRunId,
  });
  verifyArtifact(namedArtifact(artifacts, reportArtifactName, "Prepare report artifact"), {
    label: "Prepare report artifact",
    name: reportArtifactName,
    source,
    runId: candidateRunId,
  });
  verifyActionReport({ report: wrapped.prepareReport, command: "prepare", preparedRef });

  return Object.freeze({
    source,
    runId: candidateRunId,
    attempt: runAttempt,
    rawArtifactId: candidateArtifactId,
    rawArtifactDigest: candidateArtifactDigest,
    preparedArtifactName: prepared.artifactName,
    preparedDigest: prepared.digest,
    prepareReportArtifactName: reportArtifactName,
  });
};

export const verifyReleaseArtifact = async (input, dependencies = {}) => {
  if (!isAbsolute(input.candidateDirectory)) {
    fail("Downloaded candidate directory must be absolute.");
  }
  const verified = verifyReleaseEvidence(input);
  const candidateVerifier = dependencies.verifyCandidate ?? verifyCandidate;
  await candidateVerifier({ directory: resolve(input.candidateDirectory), source: input.source });
  return verified;
};

export const parseReleaseArtifactArguments = (argv) => {
  if (
    argv.length !== 14
    || argv[0] !== "--evidence"
    || !isAbsolute(argv[1])
    || argv[2] !== "--candidate-directory"
    || !isAbsolute(argv[3])
    || argv[4] !== "--source"
    || !sha.test(argv[5])
    || argv[6] !== "--candidate-run-id"
    || !positiveDecimal.test(argv[7])
    || argv[8] !== "--candidate-artifact-id"
    || !positiveDecimal.test(argv[9])
    || argv[10] !== "--candidate-artifact-digest"
    || !digest.test(argv[11])
    || argv[12] !== "--prepared-ref"
  ) {
    fail(
      "usage: verify-release-artifact.mjs --evidence <absolute evidence.json> "
        + "--candidate-directory <absolute directory> --source <40-lowercase-hex-sha> "
        + "--candidate-run-id <positive-decimal> --candidate-artifact-id <positive-decimal> "
        + "--candidate-artifact-digest <sha256:64-lowercase-hex> --prepared-ref <prepared:gha reference>",
    );
  }
  parsePreparedReference(argv[13]);
  return {
    evidence: resolve(argv[1]),
    candidateDirectory: resolve(argv[3]),
    source: argv[5],
    candidateRunId: argv[7],
    candidateArtifactId: argv[9],
    candidateArtifactDigest: argv[11],
    preparedRef: argv[13],
  };
};

export const verifyReleaseArtifactFiles = async (input, dependencies) => {
  const evidence = JSON.parse(await readFile(input.evidence, "utf8"));
  return verifyReleaseArtifact({ ...input, evidence }, dependencies);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyReleaseArtifactFiles(parseReleaseArtifactArguments(process.argv.slice(2))).then(
    ({ source, runId, rawArtifactId }) =>
      console.log(`release artifact verified: run ${runId}, artifact ${rawArtifactId}, source ${source}`),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
