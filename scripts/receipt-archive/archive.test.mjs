import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  ArchiveConflict,
  ArchiveUpdateUnknown,
  GitHubClient,
  GitHubHttpError,
  archiveReceipt,
  authenticateReceipt,
  canonicalBytes,
  decodeCanonical,
  readReceiptZip,
  validateReceipt,
  writeArchive,
} from "./archive.mjs";

const sourceSha = "1".repeat(40);
const workflowBlobSha = "2".repeat(40);
const repository = "mannyc2/effect-build";
const runId = "101";
const runAttempt = "2";
const artifactId = "303";
const releasePackages = [
  "effect-build",
  "effect-build-apple",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (records) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const raw of records) {
    const record = Array.isArray(raw) ? { name: raw[0], contents: raw[1] } : raw;
    const filename = Buffer.from(record.name, "utf8");
    const contents = Buffer.from(record.contents);
    const method = record.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(contents) : contents;
    const crc = crc32(contents);
    const localExtra = Buffer.from(record.localExtra ?? []);
    const centralExtra = Buffer.from(record.centralExtra ?? []);
    const flags = record.flags ?? 0x0800;
    const local = Buffer.alloc(30 + filename.length + localExtra.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    filename.copy(local, 30);
    localExtra.copy(local, 30 + filename.length);
    locals.push(local, compressed);
    const directory = Buffer.alloc(46 + filename.length + centralExtra.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE((3 << 8) | 20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(contents.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt16LE(centralExtra.length, 30);
    directory.writeUInt32LE(((record.mode ?? 0o100644) << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    filename.copy(directory, 46);
    centralExtra.copy(directory, 46 + filename.length);
    central.push(directory);
    offset += local.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

const authority = ({
  workflowId = "55",
  workflowPath = ".github/workflows/ci.yml",
  workflowEvent = "workflow_dispatch",
} = {}) => ({
  sourceRepository: repository,
  sourceSha,
  workflowId,
  workflowPath,
  workflowRunId: runId,
  workflowRunAttempt: runAttempt,
  workflowRunHeadSha: sourceSha,
  workflowEvent,
  workflowRef: "refs/heads/main",
});

const certificationReceipt = (overrides = {}) => ({
  schema: "effect-build/certification-receipt@1",
  receiptClass: "certification",
  ...authority(),
  terminalStatus: "certified",
  expectedConclusions: [{ name: "aggregate", conclusion: "success" }],
  actualConclusions: [{ name: "aggregate", conclusion: "success" }],
  hostObservations: [{ coordinate: "linux-x64", host: "ubuntu-24.04", conclusion: "success" }],
  providerObservations: [{ coordinate: "bun-linux", provider: "bun", version: "1.3.14", conclusion: "success" }],
  candidateIdentities: [...releasePackages, "effect-build-rolldown"].map((name, index) => ({
    package: name,
    bytes: String(10 + index),
    sha256: `sha256:${(index + 3).toString(16).repeat(64)}`,
  })),
  assertions: [{ name: "all-required-cells", outcome: "pass" }],
  innerReceipts: [{ name: "coordinate-1", sourceSha, sha256: `sha256:${"5".repeat(64)}` }],
  ...overrides,
});

const candidateIdentities = () => releasePackages.map((name, index) => ({
  package: name,
  bytes: String(100 + index),
  sha256: `sha256:${(index + 4).toString(16).repeat(64)}`,
}));

const releaseSubjects = (version, candidates, state = "matching") => {
  const byName = new Map(candidates.map((candidate) => [candidate.package, candidate.sha256]));
  return [
    { kind: "github-release", name: `v${version}`, expectedIdentity: sourceSha },
    { kind: "tag", name: `v${version}`, expectedIdentity: sourceSha },
    ...releasePackages.map((name) => ({
      kind: "candidate-byte",
      name: `${name}@${version}`,
      expectedIdentity: byName.get(name),
    })),
    ...releasePackages.map((name) => ({
      kind: "registry-package",
      name: `${name}@${version}`,
      expectedIdentity: byName.get(name),
    })),
  ].map((subject) => ({
    identity: `${subject.kind}:${subject.name}`,
    ...subject,
    state,
    observedIdentity: state === "matching" ? subject.expectedIdentity : state,
  })).sort((left, right) => left.identity.localeCompare(right.identity));
};

const releaseReceipt = (terminalStatus = "success", overrides = {}) => {
  const version = "0.5.0";
  const candidates = candidateIdentities();
  const nonSuccessState = terminalStatus === "partial" ? "absent" : terminalStatus === "failed" ? "mismatching" : "unknown";
  const subjects = releaseSubjects(version, candidates, terminalStatus === "success" ? "matching" : nonSuccessState);
  if (terminalStatus === "failed") {
    for (const subject of subjects) {
      subject.observedIdentity = subject.kind === "tag" || subject.kind === "github-release"
        ? "9".repeat(40)
        : `sha256:${"f".repeat(64)}`;
    }
  }
  return {
    schema: terminalStatus === "success"
      ? "effect-build/release-activation-receipt@1"
      : "effect-build/release-attempt-receipt@1",
    receiptClass: "release",
    ...authority({ workflowId: "66", workflowPath: ".github/workflows/release.yml" }),
    version,
    terminalStatus,
    candidateReceiptDigest: `sha256:${"a".repeat(64)}`,
    expectedConclusions: [{ name: "release", conclusion: "success" }],
    actualConclusions: [{ name: "release", conclusion: terminalStatus === "success" ? "success" : "failure" }],
    assertions: [{ name: "external-observation", outcome: terminalStatus === "success" ? "pass" : "unknown" }],
    candidateIdentities: candidates,
    externalSubjects: subjects,
    innerReceipts: [{ name: "release-phase", sourceSha, sha256: `sha256:${"b".repeat(64)}` }],
    ...overrides,
  };
};

test("canonical receipt JSON rejects alternative representations and resource exhaustion", () => {
  const value = { protocol: "example@1", values: ["a", "b"] };
  assert.deepEqual(decodeCanonical(canonicalBytes(value)), value);
  assert.throws(() => canonicalBytes({ value: 1 }), /forbids numbers/u);
  assert.throws(() => decodeCanonical(Buffer.from('{"protocol":"example@1","protocol":"example@1"}\n')), /canonically/u);
  assert.throws(() => decodeCanonical(Buffer.from('{"values":["a"],"protocol":"example@1"}\n')), /canonically/u);
  assert.throws(() => decodeCanonical(Buffer.from('{"value":"\\ud800"}\n')), /lone surrogate/u);
  assert.throws(() => decodeCanonical(Buffer.from("{}")), /final LF/u);
  let deep = "leaf";
  for (let index = 0; index < 34; index += 1) deep = [deep];
  assert.throws(() => canonicalBytes(deep), /depth bound/u);
});

test("hostile ZIP parsing accepts one exact regular canonical member and nothing else", () => {
  const receipt = canonicalBytes(certificationReceipt());
  assert.equal(readReceiptZip(zip([["certification-receipt.json", receipt]]), "certification-receipt.json").equals(receipt), true);
  assert.equal(
    readReceiptZip(zip([{ name: "certification-receipt.json", contents: receipt, method: 8 }]), "certification-receipt.json")
      .equals(receipt),
    true,
  );
  for (const name of ["/certification-receipt.json", "../certification-receipt.json", "nested/receipt.json", "C:\\receipt.json"]) {
    assert.throws(() => readReceiptZip(zip([[name, receipt]]), "certification-receipt.json"), /unsafe/u);
  }
  assert.throws(
    () => readReceiptZip(zip([["certification-receipt.json", receipt], ["extra.json", receipt]]), "certification-receipt.json"),
    /unexpected ZIP members/u,
  );
  assert.throws(
    () => readReceiptZip(zip([["certification-receipt.json", receipt], ["certification-receipt.json", receipt]]), "certification-receipt.json"),
    /duplicate/u,
  );
  assert.throws(
    () =>
      readReceiptZip(
        zip([{ name: "certification-receipt.json", contents: receipt, mode: 0o120777 }]),
        "certification-receipt.json",
      ),
    /not one regular file/u,
  );
  assert.throws(
    () =>
      readReceiptZip(
        zip([{ name: "certification-receipt.json", contents: receipt, mode: 0o100755 }]),
        "certification-receipt.json",
      ),
    /executable mode/u,
  );
  assert.throws(
    () =>
      readReceiptZip(
        zip([{ name: "certification-receipt.json", contents: receipt, centralExtra: [1, 2], localExtra: [1, 2] }]),
        "certification-receipt.json",
      ),
    /hardlink metadata/u,
  );
  assert.throws(
    () => readReceiptZip(zip([["certification-receipt.json", Buffer.alloc(524_289)]]), "certification-receipt.json"),
    /member bound/u,
  );
  assert.throws(
    () =>
      readReceiptZip(
        zip([{ name: "certification-receipt.json", contents: Buffer.alloc(100_000, 0x61), method: 8 }]),
        "certification-receipt.json",
      ),
    /compression-ratio bound/u,
  );
  assert.throws(() => readReceiptZip(Buffer.alloc(1_048_577), "certification-receipt.json"), /archive bound/u);
  assert.throws(
    () => readReceiptZip(Buffer.concat([Buffer.from("polyglot"), zip([["certification-receipt.json", receipt]])]), "certification-receipt.json"),
    /central directory bounds|local entry|prepended/u,
  );
  const corrupt = zip([["certification-receipt.json", receipt]]);
  corrupt[30 + Buffer.byteLength("certification-receipt.json")] ^= 1;
  assert.throws(() => readReceiptZip(corrupt, "certification-receipt.json"), /CRC mismatch/u);
});

test("certification receipt is successful, source-bound, sorted, and may certify deferred candidates", () => {
  const receipt = certificationReceipt();
  assert.deepEqual(validateReceipt(canonicalBytes(receipt), "certification"), receipt);
  assert.deepEqual(
    validateReceipt(canonicalBytes(certificationReceipt({ candidateIdentities: receipt.candidateIdentities.slice(0, -1) })), "certification")
      .candidateIdentities.map(({ package: name }) => name),
    releasePackages,
  );
  assert.throws(
    () => validateReceipt(canonicalBytes(certificationReceipt({ actualConclusions: [{ name: "aggregate", conclusion: "failure" }] })), "certification"),
    /requires every actual conclusion/u,
  );
  assert.throws(
    () => validateReceipt(canonicalBytes(certificationReceipt({ assertions: [{ name: "all-required-cells", outcome: "unknown" }] })), "certification"),
    /requires every assertion/u,
  );
  assert.throws(
    () =>
      validateReceipt(
        canonicalBytes(certificationReceipt({
          innerReceipts: [{ name: "coordinate-1", sourceSha: "9".repeat(40), sha256: `sha256:${"5".repeat(64)}` }],
        })),
        "certification",
      ),
    /different source SHA/u,
  );
  assert.throws(
    () =>
      validateReceipt(
        canonicalBytes(certificationReceipt({
          candidateIdentities: [...certificationReceipt().candidateIdentities].reverse(),
        })),
        "certification",
      ),
    /uniquely sorted/u,
  );
  assert.throws(
    () =>
      validateReceipt(
        canonicalBytes(certificationReceipt({ candidateIdentities: receipt.candidateIdentities.slice(0, -2) })),
        "certification",
      ),
    /admitted train/u,
  );
});

test("release success requires the exact admitted six-package train and every external subject matching", () => {
  const success = releaseReceipt();
  assert.deepEqual(validateReceipt(canonicalBytes(success), "release"), success);
  assert.equal(success.candidateIdentities.some(({ package: name }) => name === "effect-build-rolldown"), false);
  assert.throws(
    () => validateReceipt(canonicalBytes({ ...success, externalSubjects: success.externalSubjects.slice(1) }), "release"),
    /omits or changes/u,
  );
  const absent = structuredClone(success);
  absent.externalSubjects[0].state = "absent";
  absent.externalSubjects[0].observedIdentity = "absent";
  assert.throws(() => validateReceipt(canonicalBytes(absent), "release"), /requires every external subject/u);
  const rolldown = structuredClone(success);
  rolldown.candidateIdentities.push({ package: "effect-build-rolldown", bytes: "999", sha256: `sha256:${"f".repeat(64)}` });
  assert.throws(() => validateReceipt(canonicalBytes(rolldown), "release"), /admitted six-package/u);
});

test("partial, failed, and unknown release receipts remain terminal without claiming success", () => {
  for (const status of ["partial", "failed", "unknown"]) {
    const receipt = releaseReceipt(status);
    assert.equal(validateReceipt(canonicalBytes(receipt), "release").terminalStatus, status);
    assert.equal(receipt.externalSubjects.every(({ state }) => state !== "matching"), true);
  }
  const partial = releaseReceipt("partial");
  partial.externalSubjects[0].observedIdentity = "unknown";
  assert.throws(() => validateReceipt(canonicalBytes(partial), "release"), /absent state diverges/u);
  const wrongSchema = releaseReceipt("partial");
  wrongSchema.schema = "effect-build/release-activation-receipt@1";
  assert.throws(() => validateReceipt(canonicalBytes(wrongSchema), "release"), /distinct schemas/u);
  assert.throws(() => validateReceipt(canonicalBytes(releaseReceipt()), "certification"), /certification receipt/u);
});

const authenticationFixture = ({ receiptClass = "certification", receipt } = {}) => {
  const selected = receipt ?? (receiptClass === "certification" ? certificationReceipt() : releaseReceipt());
  const fileName = receiptClass === "certification" ? "certification-receipt.json" : "release-terminal-receipt.json";
  const wrapper = zip([[fileName, canonicalBytes(selected)]]);
  const digest = `sha256:${createDigest(wrapper)}`;
  const workflowId = receiptClass === "certification" ? "55" : "66";
  const workflowPath = receiptClass === "certification" ? ".github/workflows/ci.yml" : ".github/workflows/release.yml";
  const artifactNamePrefix = `${receiptClass}-evidence`;
  const artifactName = `${artifactNamePrefix}-run-${runId}-attempt-${runAttempt}`;
  const client = {
    run: {
      id: Number(runId),
      run_attempt: Number(runAttempt),
      workflow_id: Number(workflowId),
      path: workflowPath,
      event: "workflow_dispatch",
      repository: { id: 77, full_name: repository },
      head_repository: { id: 77, full_name: repository },
      actor: { id: 88 },
      triggering_actor: { id: 89 },
      head_sha: sourceSha,
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      referenced_workflows: [],
    },
    artifact: {
      id: Number(artifactId),
      name: artifactName,
      digest,
      size_in_bytes: wrapper.length,
      expired: false,
      expires_at: "2099-01-01T00:00:00Z",
      workflow_run: {
        id: Number(runId),
        repository_id: 77,
        head_repository_id: 77,
        head_branch: "main",
        head_sha: sourceSha,
      },
    },
    workflowFile: { type: "file", path: workflowPath, sha: workflowBlobSha },
    wrapper,
    async getRun() {
      return this.run;
    },
    async getArtifact() {
      return this.artifact;
    },
    async getFileMetadata() {
      return this.workflowFile;
    },
    async downloadArtifact() {
      return this.wrapper;
    },
  };
  const request = {
    receiptClass,
    producerRunId: runId,
    producerRunAttempt: runAttempt,
    artifactId,
    artifactDigest: digest,
    sourceSha,
  };
  const policy = {
    repository,
    repositoryId: "77",
    producerClass: receiptClass,
    workflowId,
    workflowPath,
    workflowBlobSha,
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actorId: "88",
    triggeringActorId: "89",
    artifactNamePrefix,
    expectedConclusionsSha256: `sha256:${createDigest(canonicalBytes(selected.expectedConclusions))}`,
    expectedInnerReceiptNamesSha256: `sha256:${createDigest(canonicalBytes(selected.innerReceipts.map(({ name }) => name)))}`,
    environmentId: "1",
    rulesetId: "2",
    reviewerId: "3",
  };
  return { client, request, policy };
};

const createDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("GitHub API metadata, approved workflow revision, artifact digest, and receipt self-description all bind", async () => {
  const fixture = authenticationFixture();
  const authenticated = await authenticateReceipt(fixture);
  assert.equal(authenticated.path, `receipts/v1/certifications/${sourceSha}/${runId}-${runAttempt}.json`);
  assert.equal(authenticated.archived.schema, "effect-build/archived-certification-receipt@1");
  assert.equal(authenticated.archived.producer.artifactDigest, fixture.request.artifactDigest);
  assert.equal(authenticated.archived.producer.workflowFileBlobSha, workflowBlobSha);

  for (const [label, mutate] of [
    ["run attempt", ({ client }) => client.run.run_attempt = 9],
    ["workflow id", ({ client }) => client.run.workflow_id = 999],
    ["workflow path", ({ client }) => client.run.path = ".github/workflows/other.yml"],
    ["event", ({ client }) => client.run.event = "pull_request"],
    ["ref", ({ client }) => client.run.head_branch = "feature"],
    ["repository id", ({ client }) => client.run.repository.id = 999],
    ["repository", ({ client }) => client.run.head_repository.full_name = "attacker/fork"],
    ["actor", ({ client }) => client.run.actor.id = 999],
    ["triggering actor", ({ client }) => client.run.triggering_actor.id = 999],
    ["reusable workflow", ({ client }) => client.run.referenced_workflows = [{ sha: "9".repeat(40) }]],
    ["source", ({ client }) => client.run.head_sha = "9".repeat(40)],
    ["conclusion", ({ client }) => client.run.conclusion = "failure"],
    ["workflow blob", ({ client }) => client.workflowFile.sha = "9".repeat(40)],
    ["artifact name", ({ client }) => client.artifact.name = "other"],
    ["artifact bytes", ({ client }) => client.artifact.size_in_bytes += 1],
    ["artifact run", ({ client }) => client.artifact.workflow_run.id = 999],
    ["artifact repository", ({ client }) => client.artifact.workflow_run.repository_id = 999],
    ["artifact source", ({ client }) => client.artifact.workflow_run.head_sha = "9".repeat(40)],
    ["artifact expiry", ({ client }) => client.artifact.expired = true],
  ]) {
    const candidate = authenticationFixture();
    mutate(candidate);
    await assert.rejects(() => authenticateReceipt(candidate), undefined, label);
  }

  const changedWrapper = authenticationFixture();
  changedWrapper.client.wrapper = Buffer.from(changedWrapper.client.wrapper);
  changedWrapper.client.wrapper[0] ^= 1;
  await assert.rejects(() => authenticateReceipt(changedWrapper), /wrapper digest/u);

  const selfAsserted = authenticationFixture({
    receipt: certificationReceipt({ workflowRunAttempt: "99" }),
  });
  await assert.rejects(() => authenticateReceipt(selfAsserted), /self-description/u);

  const wrongExpectedManifest = authenticationFixture();
  wrongExpectedManifest.policy.expectedConclusionsSha256 = `sha256:${"9".repeat(64)}`;
  await assert.rejects(() => authenticateReceipt(wrongExpectedManifest), /expected-conclusion manifest/u);

  const wrongInnerDenominator = authenticationFixture();
  wrongInnerDenominator.policy.expectedInnerReceiptNamesSha256 = `sha256:${"9".repeat(64)}`;
  await assert.rejects(() => authenticateReceipt(wrongInnerDenominator), /inner-receipt denominator/u);
});

test("release producer may archive a failed terminal attempt but cannot use certification authority", async () => {
  const fixture = authenticationFixture({ receiptClass: "release", receipt: releaseReceipt("failed") });
  fixture.client.run.conclusion = "failure";
  const authenticated = await authenticateReceipt(fixture);
  assert.equal(authenticated.path, `receipts/v1/releases/0.5.0/${runId}-${runAttempt}.json`);
  assert.equal(authenticated.archived.schema, "effect-build/archived-release-attempt-receipt@1");
  const falseSuccess = authenticationFixture({ receiptClass: "release", receipt: releaseReceipt() });
  falseSuccess.client.run.conclusion = "failure";
  await assert.rejects(() => authenticateReceipt(falseSuccess), /successful producer conclusion/u);
  const wrongPolicy = authenticationFixture();
  wrongPolicy.policy.producerClass = "release";
  await assert.rejects(() => authenticateReceipt(wrongPolicy), /producer class/u);
});

class GitDatabaseMock {
  constructor() {
    this.ref = null;
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.calls = [];
    this.counter = 1;
    this.onCreateRef = undefined;
    this.onUpdateRef = undefined;
  }

  nextSha() {
    const value = this.counter.toString(16).padStart(40, "0");
    this.counter += 1;
    return value;
  }

  installRef(entries = new Map()) {
    const treeSha = this.nextSha();
    const commitSha = this.nextSha();
    this.trees.set(
      treeSha,
      new Map([...entries].map(([path, bytes]) => [path, { bytes: Buffer.from(bytes), sha: this.nextSha() }])),
    );
    this.commits.set(commitSha, { tree: { sha: treeSha }, parents: [] });
    this.ref = { sha: commitSha };
    return commitSha;
  }

  async getRef() {
    this.calls.push(["getRef", this.ref?.sha]);
    return this.ref === null ? null : { ...this.ref };
  }

  async getContent(_repository, path, refSha) {
    this.calls.push(["getContent", path, refSha]);
    const commit = this.commits.get(refSha);
    const entry = commit === undefined ? undefined : this.trees.get(commit.tree.sha)?.get(path);
    return entry === undefined ? null : Buffer.from(entry.bytes);
  }

  async createBlob(_repository, bytes) {
    const sha = this.nextSha();
    this.calls.push(["createBlob", sha]);
    this.blobs.set(sha, Buffer.from(bytes));
    return { sha };
  }

  async getCommit(_repository, sha) {
    this.calls.push(["getCommit", sha]);
    return this.commits.get(sha);
  }

  async getTree(_repository, sha) {
    this.calls.push(["getTree", sha]);
    const entries = this.trees.get(sha);
    return {
      truncated: false,
      tree: [...entries].map(([path, entry]) => ({ path, mode: "100644", type: "blob", sha: entry.sha })),
    };
  }

  async createTree(_repository, { baseTree, path, blobSha }) {
    const sha = this.nextSha();
    this.calls.push(["createTree", { baseTree, path, blobSha }]);
    const entries = baseTree === undefined ? new Map() : new Map(this.trees.get(baseTree));
    entries.set(path, { bytes: Buffer.from(this.blobs.get(blobSha)), sha: blobSha });
    this.trees.set(sha, entries);
    return { sha };
  }

  async createCommit(_repository, { message, treeSha, parents }) {
    const sha = this.nextSha();
    this.calls.push(["createCommit", { message, treeSha, parents }]);
    this.commits.set(sha, { tree: { sha: treeSha }, parents });
    return { sha };
  }

  async createRef(_repository, ref, sha) {
    this.calls.push(["createRef", { ref, sha }]);
    if (this.onCreateRef !== undefined) return this.onCreateRef({ ref, sha });
    this.ref = { sha };
    return { ref, object: { sha } };
  }

  async updateRef(_repository, ref, sha, force) {
    this.calls.push(["updateRef", { ref, sha, force }]);
    if (this.onUpdateRef !== undefined) return this.onUpdateRef({ ref, sha, force });
    this.ref = { sha };
    return { ref, object: { sha } };
  }
}

const certificationPath = `receipts/v1/certifications/${sourceSha}/${runId}-${runAttempt}.json`;
const archiveBytes = canonicalBytes({ schema: "test-archive@1", sourceSha });

test("absent evidence ref creates one orphan commit with no parent", async () => {
  const client = new GitDatabaseMock();
  const result = await writeArchive({ client, repository, path: certificationPath, bytes: archiveBytes });
  assert.equal(result._tag, "Created");
  const commit = client.calls.find(([name]) => name === "createCommit")[1];
  assert.deepEqual(commit.parents, []);
  assert.equal(client.calls.filter(([name]) => name === "createRef").length, 1);
  assert.equal(client.calls.some(([name]) => name === "updateRef"), false);
});

test("identical archive bytes are idempotent and different bytes are a terminal conflict", async () => {
  const identical = new GitDatabaseMock();
  identical.installRef(new Map([[certificationPath, archiveBytes]]));
  assert.equal((await writeArchive({ client: identical, repository, path: certificationPath, bytes: archiveBytes }))._tag, "Idempotent");
  assert.equal(identical.calls.some(([name]) => name.startsWith("create")), false);

  const different = new GitDatabaseMock();
  different.installRef(new Map([[certificationPath, canonicalBytes({ different: "bytes" })]]));
  await assert.rejects(
    () => writeArchive({ client: different, repository, path: certificationPath, bytes: archiveBytes }),
    ArchiveConflict,
  );
  assert.equal(different.calls.some(([name]) => name.startsWith("create")), false);
});

test("existing evidence ref advances only by a non-force child commit", async () => {
  const client = new GitDatabaseMock();
  const base = client.installRef();
  await writeArchive({ client, repository, path: certificationPath, bytes: archiveBytes });
  const commit = client.calls.find(([name]) => name === "createCommit")[1];
  assert.deepEqual(commit.parents, [base]);
  const update = client.calls.find(([name]) => name === "updateRef")[1];
  assert.equal(update.force, false);
  assert.equal(client.commits.get(update.sha).parents[0], base);
});

test("an invalid or merged evidence base is rejected before creating Git objects", async () => {
  const invalidTree = new GitDatabaseMock();
  invalidTree.installRef(new Map([["README.md", Buffer.from("not receipt evidence")]]));
  await assert.rejects(
    () => writeArchive({ client: invalidTree, repository, path: certificationPath, bytes: archiveBytes }),
    /outside the receipt canon/u,
  );
  assert.equal(invalidTree.calls.some(([name]) => name.startsWith("create")), false);

  const merged = new GitDatabaseMock();
  const tip = merged.installRef();
  merged.commits.get(tip).parents = ["8".repeat(40), "9".repeat(40)];
  await assert.rejects(
    () => writeArchive({ client: merged, repository, path: certificationPath, bytes: archiveBytes }),
    /linear orphan history/u,
  );
  assert.equal(merged.calls.some(([name]) => name.startsWith("create")), false);
});

test("candidate tree verification rejects deletion or mutation before updating the ref", async () => {
  const client = new GitDatabaseMock();
  const existingPath = `receipts/v1/certifications/${"8".repeat(40)}/1-1.json`;
  client.installRef(new Map([[existingPath, canonicalBytes({ existing: "receipt" })]]));
  const getTree = client.getTree.bind(client);
  client.getTree = async (selectedRepository, sha) => {
    const result = await getTree(selectedRepository, sha);
    if (result.tree.some(({ path }) => path === certificationPath)) {
      return { ...result, tree: result.tree.filter(({ path }) => path !== existingPath) };
    }
    return result;
  };
  await assert.rejects(
    () => writeArchive({ client, repository, path: certificationPath, bytes: archiveBytes }),
    /one receipt addition/u,
  );
  assert.equal(client.calls.some(([name]) => name === "createCommit"), false);
  assert.equal(client.calls.some(([name]) => name === "updateRef"), false);
});

test("a moved ref is reobserved and receives a new commit rather than the stale commit", async () => {
  const client = new GitDatabaseMock();
  const base = client.installRef();
  let first = true;
  let racedTip;
  client.onUpdateRef = ({ sha }) => {
    if (first) {
      first = false;
      racedTip = client.installRef();
      throw new GitHubHttpError("PATCH", "/git/refs", 422);
    }
    client.ref = { sha };
    return { object: { sha } };
  };
  const result = await writeArchive({ client, repository, path: certificationPath, bytes: archiveBytes });
  assert.equal(result._tag, "Created");
  const commits = client.calls.filter(([name]) => name === "createCommit").map(([, value]) => value);
  assert.deepEqual(commits.map(({ parents }) => parents), [[base], [racedTip]]);
  const updates = client.calls.filter(([name]) => name === "updateRef").map(([, value]) => value);
  assert.equal(updates.length, 2);
  assert.notEqual(updates[0].sha, updates[1].sha);
  assert.equal(updates.every(({ force }) => force === false), true);
});

test("a create-ref race reobserves the new tip and creates a fast-forward child", async () => {
  const client = new GitDatabaseMock();
  let racedTip;
  client.onCreateRef = () => {
    racedTip = client.installRef();
    client.onCreateRef = undefined;
    throw new GitHubHttpError("POST", "/git/refs", 422);
  };
  await writeArchive({ client, repository, path: certificationPath, bytes: archiveBytes });
  const commits = client.calls.filter(([name]) => name === "createCommit").map(([, value]) => value);
  assert.deepEqual(commits[0].parents, []);
  assert.deepEqual(commits[1].parents, [racedTip]);
  assert.equal(client.calls.filter(([name]) => name === "createRef").length, 1);
  assert.equal(client.calls.filter(([name]) => name === "updateRef").length, 1);
});

test("unknown ref mutation is reobserved, never blindly retried, and preserves a racing identical write", async () => {
  const unchanged = new GitDatabaseMock();
  unchanged.installRef();
  unchanged.onUpdateRef = () => {
    throw new Error("connection reset");
  };
  await assert.rejects(
    () => writeArchive({ client: unchanged, repository, path: certificationPath, bytes: archiveBytes }),
    ArchiveUpdateUnknown,
  );
  assert.equal(unchanged.calls.filter(([name]) => name === "updateRef").length, 1);
  assert.equal(unchanged.calls.filter(([name]) => name === "getRef").length, 2);

  const identical = new GitDatabaseMock();
  identical.installRef();
  identical.onUpdateRef = () => {
    identical.installRef(new Map([[certificationPath, archiveBytes]]));
    throw new Error("connection reset after remote success");
  };
  const result = await writeArchive({ client: identical, repository, path: certificationPath, bytes: archiveBytes });
  assert.equal(result._tag, "IdempotentAfterRace");
  assert.equal(identical.calls.filter(([name]) => name === "updateRef").length, 1);
});

test("a deleted ref, different-path race, or unobservable success fails closed", async () => {
  const deleted = new GitDatabaseMock();
  deleted.installRef();
  deleted.onUpdateRef = () => {
    deleted.ref = null;
    throw new GitHubHttpError("PATCH", "/git/refs", 422);
  };
  await assert.rejects(
    () => writeArchive({ client: deleted, repository, path: certificationPath, bytes: archiveBytes }),
    /append-only evidence ref disappeared/u,
  );
  assert.equal(deleted.calls.some(([name]) => name === "createRef"), false);

  const different = new GitDatabaseMock();
  different.installRef();
  different.onUpdateRef = () => {
    different.installRef(new Map([[certificationPath, canonicalBytes({ different: "race" })]]));
    throw new GitHubHttpError("PATCH", "/git/refs", 422);
  };
  await assert.rejects(
    () => writeArchive({ client: different, repository, path: certificationPath, bytes: archiveBytes }),
    ArchiveConflict,
  );

  const unobservable = new GitDatabaseMock();
  unobservable.installRef();
  unobservable.onUpdateRef = () => ({ object: { sha: "7".repeat(40) } });
  await assert.rejects(
    () => writeArchive({ client: unobservable, repository, path: certificationPath, bytes: archiveBytes }),
    ArchiveUpdateUnknown,
  );
  assert.equal(unobservable.calls.filter(([name]) => name === "updateRef").length, 1);
});

test("GitHub client binds the exact attempt endpoint and enforces bounded API bodies", async () => {
  const calls = [];
  const client = new GitHubClient({
    token: "token",
    fetchImplementation: async (url, init) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify({ id: 101 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.deepEqual(await client.getRun(repository, runId, runAttempt), { id: 101 });
  assert.equal(
    calls[0][0],
    `https://api.github.com/repos/mannyc2/effect-build/actions/runs/${runId}/attempts/${runAttempt}`,
  );
  assert.equal(calls[0][1].redirect, "error");

  const oversized = new GitHubClient({
    token: "token",
    fetchImplementation: async () =>
      new Response("{}", { status: 200, headers: { "content-length": "1048577" } }),
  });
  await assert.rejects(() => oversized.getRun(repository, runId, runAttempt), /declared byte bound/u);
});

test("the authenticated receipt composes with the orphan Git database writer", async () => {
  const authentication = authenticationFixture();
  const database = new GitDatabaseMock();
  const client = new Proxy(authentication.client, {
    get(target, property) {
      if (property in target) {
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      }
      const value = database[property];
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
  const result = await archiveReceipt({
    client,
    request: authentication.request,
    policy: authentication.policy,
  });
  assert.equal(result._tag, "Created");
  assert.match(result.archivedSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(database.ref === null, false);
});
