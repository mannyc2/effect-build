import { constants } from "node:fs";
import { lstat, mkdtemp, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAppleAggregate, validateAppleAggregate } from "./aggregate.mjs";
import { appleCertificationPolicy, decodeCanonicalJson } from "./canonical.mjs";
import {
  buildContract,
  contractPath as generatedContractPath,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(root, generatedContractPath);

const usage =
  "usage: node scripts/apple-certification/cli.mjs --receipts <canonical-json> --evidence-directory <directory> --output-directory <new-directory>";

const exactOptions = ["--receipts", "--evidence-directory", "--output-directory"];

export const parseAppleAggregateArguments = (args) => {
  if (!Array.isArray(args) || args.length !== exactOptions.length * 2) throw new Error(usage);
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !exactOptions.includes(name)
      || options.has(name)
      || typeof value !== "string"
      || value.length === 0
    ) throw new Error(usage);
    options.set(name, value);
  }
  if (exactOptions.some((name) => !options.has(name))) throw new Error(usage);
  return {
    receiptsPath: resolve(options.get("--receipts")),
    evidenceDirectory: resolve(options.get("--evidence-directory")),
    outputDirectory: resolve(options.get("--output-directory")),
  };
};

const stableStatFields = ["dev", "ino", "size", "mtimeNs", "ctimeNs", "nlink"];

const readRegularFile = async (path, label, { singleLink = false } = {}) => {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be one regular file`);
    if (singleLink && before.nlink !== 1n) throw new Error(`${label} must be one regular single-link file`);
    const value = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (stableStatFields.some((field) => before[field] !== after[field])) {
      throw new Error(`${label} changed while it was read`);
    }
    return value;
  } finally {
    await handle.close();
  }
};

const exactDirectory = async (path, label) => {
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error(`${label} must be one real directory`);
};

const exactNames = (observed, expected, label) => {
  const left = [...observed].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} has missing or additional entries`);
  }
};

const evidenceFileName = (id) => {
  if (
    typeof id !== "string"
    || id.length === 0
    || id === "."
    || id === ".."
    || basename(id) !== id
    || id.includes("/")
    || id.includes("\\")
  ) throw new Error("generated Apple evidence descriptor is not one safe filename");
  return id;
};

const loadEvidence = async (directory, policy) => {
  await exactDirectory(directory, "Apple evidence directory");
  const entries = await readdir(directory, { withFileTypes: true });
  const expected = policy.evidenceDescriptorOrder.map(evidenceFileName);
  exactNames(entries.map(({ name }) => name), expected, "Apple evidence directory");
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const evidence = new Map();
  for (const id of expected) {
    const entry = byName.get(id);
    if (entry?.isFile() !== true) {
      throw new Error(`Apple evidence ${id} must be one regular non-symlink file`);
    }
    const value = await readRegularFile(join(directory, id), `Apple evidence ${id}`, { singleLink: true });
    if (value.byteLength === 0) throw new Error(`Apple evidence ${id} must be non-empty`);
    evidence.set(id, value);
  }
  exactNames(await readdir(directory), expected, "Apple evidence directory");
  return evidence;
};

const assertAbsent = async (path, label) => {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists`);
};

const writeExclusive = async (path, value) => {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

export const writeAppleAggregate = async ({ receiptsPath, evidenceDirectory, outputDirectory }) => {
  await exactDirectory(evidenceDirectory, "Apple evidence directory");
  await exactDirectory(dirname(outputDirectory), "Apple aggregate output parent");
  const realEvidenceDirectory = await realpath(evidenceDirectory);
  const realOutputParent = await realpath(dirname(outputDirectory));
  const realOutputDirectory = join(realOutputParent, basename(outputDirectory));
  if (inside(realEvidenceDirectory, realOutputDirectory)) {
    throw new Error("Apple aggregate output must be outside the immutable evidence directory");
  }
  await assertAbsent(realOutputDirectory, "Apple aggregate output directory");

  const contract = await authenticateGeneratedAppleContract();
  const { policy } = appleCertificationPolicy(contract);
  const receipts = decodeCanonicalJson(
    await readRegularFile(receiptsPath, "Apple receipt input", { singleLink: true }),
    "Apple receipt input",
  );
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw new Error("Apple receipt input must be the exact non-empty receipt array");
  }
  const evidenceBytes = await loadEvidence(realEvidenceDirectory, policy);
  const sourceSha = receipts[0]?.sourceSha;
  const candidateCoordinate = receipts[0]?.candidateCoordinate;
  const workflowCoordinate = receipts[0]?.workflowCoordinate;
  const aggregate = buildAppleAggregate({
    contract,
    sourceSha,
    candidateCoordinate,
    workflowCoordinate,
    receipts,
    evidenceBytes,
  });
  validateAppleAggregate({
    contract,
    expectedSourceSha: sourceSha,
    expectedCandidateCoordinate: candidateCoordinate,
    expectedWorkflowCoordinate: workflowCoordinate,
    files: policy.artifact.orderedFiles,
    indexBytes: aggregate.indexBytes,
    bundleBytes: aggregate.bundleBytes,
  });

  const temporary = await mkdtemp(join(realOutputParent, `.${basename(realOutputDirectory)}.tmp-`));
  let committed = false;
  try {
    await writeExclusive(join(temporary, policy.artifact.orderedFiles[0]), aggregate.indexBytes);
    await writeExclusive(join(temporary, policy.artifact.orderedFiles[1]), aggregate.bundleBytes);
    const indexBytes = await readRegularFile(
      join(temporary, policy.artifact.orderedFiles[0]),
      "written Apple index",
    );
    const bundleBytes = await readRegularFile(
      join(temporary, policy.artifact.orderedFiles[1]),
      "written Apple bundle",
    );
    exactNames(await readdir(temporary), policy.artifact.orderedFiles, "written Apple aggregate");
    validateAppleAggregate({
      contract,
      expectedSourceSha: sourceSha,
      expectedCandidateCoordinate: candidateCoordinate,
      expectedWorkflowCoordinate: workflowCoordinate,
      files: policy.artifact.orderedFiles,
      indexBytes,
      bundleBytes,
    });
    await assertAbsent(realOutputDirectory, "Apple aggregate output directory");
    await rename(temporary, realOutputDirectory);
    committed = true;
    return aggregate.index;
  } finally {
    if (!committed) await rm(temporary, { recursive: true, force: true });
  }
};

export const authenticateGeneratedAppleContract = async ({
  repositoryRoot = root,
  outputPath = contractPath,
} = {}) => {
  const inputs = await readInputs(repositoryRoot);
  const contract = validateContract(buildContract(inputs), inputs);
  const expected = Buffer.from(renderJson(contract), "utf8");
  const observed = await readRegularFile(outputPath, "generated Apple contract", { singleLink: true });
  if (!observed.equals(expected)) {
    throw new Error("generated Apple contract bytes are unauthenticated or stale");
  }
  return contract;
};

export const runAppleAggregateCli = async (args) => writeAppleAggregate(parseAppleAggregateArguments(args));

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runAppleAggregateCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Apple aggregate failed"}\n`);
    process.exitCode = 1;
  }
}
