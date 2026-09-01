import { canonicalBytes, decodeCanonicalJson, exactKeys, sha256Digest } from "./canonical.mjs";

const syntheticJournalProtocol = "effect-build/apple-synthetic-journal@1";

const syntheticTransaction = (sequence) => {
  const suffix = BigInt(sequence).toString(10).padStart(12, "0");
  if (suffix.length !== 12) throw new Error("synthetic journal sequence exceeds UUID capacity");
  return `00000000-0000-4000-8000-${suffix}`;
};

const acknowledgementFromRecord = ({ recordDigest, sequence, transaction }) => ({
  recordDigest,
  sequence,
  transaction,
});

class SyntheticJournalBoundary {
  constructor(records = []) {
    this.records = records;
    this.reads = 0;
  }

  append(kind, payload, { loseAcknowledgement = false } = {}) {
    const sequence = `${this.records.length + 1}`;
    const transaction = syntheticTransaction(sequence);
    const record = {
      kind,
      payload,
      sequence,
      transaction,
      recordDigest: sha256Digest(canonicalBytes({ kind, payload, sequence, transaction })),
    };
    this.records.push(record);
    if (loseAcknowledgement) throw new Error("synthetic-acknowledgement-loss");
    return acknowledgementFromRecord(record);
  }

  reread(expected, { mismatch = false } = {}) {
    this.reads += 1;
    const record = this.records.find(({ sequence }) => sequence === expected.sequence);
    if (record === undefined) throw new Error("synthetic-record-missing");
    const reread = acknowledgementFromRecord(record);
    return mismatch ? { ...reread, recordDigest: sha256Digest("synthetic mismatched reread") } : reread;
  }

  acknowledgement(sequence) {
    const record = this.records.find((candidate) => candidate.sequence === sequence);
    if (record === undefined) throw new Error("synthetic-record-missing");
    return acknowledgementFromRecord(record);
  }

  persistedBytes() {
    return canonicalBytes({ protocol: syntheticJournalProtocol, records: this.records });
  }

  static fromPersistedBytes(bytes) {
    const envelope = exactKeys(
      decodeCanonicalJson(bytes, "synthetic persisted journal"),
      ["protocol", "records"],
      "synthetic persisted journal",
    );
    if (envelope.protocol !== syntheticJournalProtocol || !Array.isArray(envelope.records)) {
      throw new Error("synthetic persisted journal protocol is invalid");
    }
    const records = envelope.records.map((value, index) => {
      const record = exactKeys(
        value,
        ["kind", "payload", "recordDigest", "sequence", "transaction"],
        `synthetic persisted journal record ${index}`,
      );
      const sequence = `${index + 1}`;
      if (
        (record.kind !== "intent" && record.kind !== "submission")
        || record.sequence !== sequence
        || record.transaction !== syntheticTransaction(sequence)
        || record.recordDigest
          !== sha256Digest(canonicalBytes({
            kind: record.kind,
            payload: record.payload,
            sequence: record.sequence,
            transaction: record.transaction,
          }))
      ) throw new Error("synthetic persisted journal record is invalid");
      return record;
    });
    return new SyntheticJournalBoundary(records);
  }
}

const exactReread = (acknowledgement, reread) =>
  acknowledgement.sequence === reread.sequence
  && acknowledgement.transaction === reread.transaction
  && acknowledgement.recordDigest === reread.recordDigest;

const syntheticResult = ({
  architecture,
  journal,
  journalReads,
  observationCalls,
  providerCalls,
  restartProof,
  scenario,
  terminal,
  trace,
}) => ({
  protocol: "effect-build/apple-synthetic-executor@1",
  scenario,
  architecture,
  terminal,
  providerCalls,
  observationCalls,
  retryCalls: 0,
  journalAppends: journal.records.length,
  journalReads,
  ...(restartProof === undefined ? {} : { restartProof }),
  trace,
});

export const a7SyntheticEvidenceCases = Object.freeze({
  "accepted-both-architectures": "accepted-provider-result",
  "pending-both-architectures": "pending-provider-result",
  "rejected-both-architectures": "rejected-provider-result",
  "info-and-log": "info-and-log",
  "fresh-runner-resume": "fresh-runner-resume",
  "service-failure": "service-failure",
  "interruption": "interruption",
  "pre-ack-unknown-outcome": "post-provider-pre-journal-crash",
});

export const runSyntheticJournalCase = (scenario, { architecture = "arm64" } = {}) => {
  const admitted = new Set([
    "complete",
    ...Object.values(a7SyntheticEvidenceCases),
    "intent-acknowledgement-loss",
    "intent-reread-mismatch",
    "crash-before-provider",
    "provider-response-loss",
    "post-provider-pre-journal-crash",
    "submission-acknowledgement-loss",
    "submission-reread-mismatch",
  ]);
  if (!admitted.has(scenario)) throw new Error("unknown synthetic journal scenario");
  if (architecture !== "arm64" && architecture !== "x64") {
    throw new Error("unknown synthetic journal architecture");
  }
  let journal = new SyntheticJournalBoundary();
  const trace = [];
  let providerCalls = 0;
  let observationCalls = 0;
  let journalReads = 0;
  let restartProof;
  let intent;
  try {
    intent = journal.append(
      "intent",
      { architecture, operation: "synthetic-notary-submit" },
      { loseAcknowledgement: scenario === "intent-acknowledgement-loss" },
    );
  } catch {
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      scenario,
      terminal: "journal-acknowledgement-stop",
      trace: ["intent-acknowledgement-lost-before-provider"],
    });
  }
  trace.push("intent-acknowledged");
  const intentReread = journal.reread(intent, { mismatch: scenario === "intent-reread-mismatch" });
  journalReads += 1;
  if (!exactReread(intent, intentReread)) {
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      scenario,
      terminal: "journal-reread-stop",
      trace: [...trace, "intent-reread-mismatch-before-provider"],
    });
  }
  trace.push("intent-reread-exact");
  if (scenario === "crash-before-provider" || scenario === "interruption") {
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      scenario,
      terminal: "injected-stop",
      trace: [...trace, scenario === "interruption" ? "interrupted-before-provider" : "crashed-before-provider"],
    });
  }

  providerCalls += 1;
  trace.push("provider-called-once");
  if (
    scenario === "provider-response-loss"
    || scenario === "service-failure"
    || scenario === "post-provider-pre-journal-crash"
  ) {
    const outcome = scenario === "service-failure"
      ? "provider-service-failed-with-unknown-outcome"
      : scenario === "post-provider-pre-journal-crash"
      ? "crashed-after-provider-before-submission-append"
      : "provider-response-lost";
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      scenario,
      terminal: "unknown-outcome-stop",
      trace: [...trace, outcome],
    });
  }

  let submission;
  try {
    submission = journal.append(
      "submission",
      { codec: "effect-build-apple/notary-journal@1", opaqueDigest: sha256Digest("synthetic submission bytes") },
      { loseAcknowledgement: scenario === "submission-acknowledgement-loss" },
    );
  } catch {
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      scenario,
      terminal: "unknown-outcome-stop",
      trace: [...trace, "submission-acknowledgement-lost"],
    });
  }
  trace.push("submission-acknowledged");
  if (scenario === "fresh-runner-resume") {
    const priorJournal = journal;
    const priorRecords = [...priorJournal.records];
    const persistedBytes = priorJournal.persistedBytes();
    journal = SyntheticJournalBoundary.fromPersistedBytes(persistedBytes);
    const resumedSubmission = journal.acknowledgement(submission.sequence);
    restartProof = {
      acknowledgementReinstantiated: resumedSubmission !== submission,
      journalReinstantiated: journal !== priorJournal,
      persistedBytesDigest: sha256Digest(persistedBytes),
      recordObjectsReinstantiated: journal.records.every((record, index) => record !== priorRecords[index]),
    };
    if (
      !restartProof.acknowledgementReinstantiated
      || !restartProof.journalReinstantiated
      || !restartProof.recordObjectsReinstantiated
    ) throw new Error("synthetic fresh runner reused in-memory journal state");
    submission = resumedSubmission;
    trace.push("fresh-runner-restored-canonical-persisted-bytes-without-shared-objects");
  }
  const submissionReread = journal.reread(submission, { mismatch: scenario === "submission-reread-mismatch" });
  journalReads += 1;
  if (!exactReread(submission, submissionReread)) {
    return syntheticResult({
      architecture,
      journal,
      journalReads,
      observationCalls,
      providerCalls,
      restartProof,
      scenario,
      terminal: "unknown-outcome-stop",
      trace: [...trace, "submission-reread-mismatch"],
    });
  }
  trace.push("submission-reread-exact");
  if (scenario === "info-and-log") {
    observationCalls = 2;
    trace.push("synthetic-info-called-once", "synthetic-log-called-once");
  }
  const providerStatus = {
    "accepted-provider-result": "Accepted",
    "pending-provider-result": "Pending",
    "rejected-provider-result": "Rejected",
  }[scenario];
  if (providerStatus !== undefined) trace.push(`synthetic-provider-status-${providerStatus.toLowerCase()}`);
  trace.push("synthetic-continuation-observed");
  return syntheticResult({
    architecture,
    journal,
    journalReads,
    observationCalls,
    providerCalls,
    restartProof,
    scenario,
    terminal: providerStatus === undefined ? "synthetic-only-complete" : `synthetic-only-${providerStatus.toLowerCase()}`,
    trace,
  });
};

export const runSyntheticCleanHostCase = (rule, scenario) => {
  if (rule?.category !== "G-clean-host") throw new Error("synthetic clean host requires one generated G rule");
  const admitted = new Set(["complete", "preexisting-state", "quarantine-bypass", "cleanup-failure"]);
  if (!admitted.has(scenario)) throw new Error("unknown synthetic clean-host scenario");
  const trace = [];
  const forbiddenState = scenario === "preexisting-state" ? ["prior-target-product-state"] : [];
  trace.push("preflight-forbidden-state-observed");
  if (forbiddenState.length > 0) {
    return {
      protocol: "effect-build/apple-synthetic-clean-host@1",
      scenario,
      coordinate: rule.coordinate,
      terminal: "blocked-before-acquisition",
      trace,
    };
  }
  const flow = [...rule.fieldValues.userFlowSteps];
  if (scenario === "quarantine-bypass") {
    flow.splice(Math.max(1, flow.indexOf("apply-quarantine") + 1), 0, "remove-quarantine");
  }
  if (flow.some((step) => rule.fieldValues.quarantinePolicy.forbiddenActions.includes(step))) {
    return {
      protocol: "effect-build/apple-synthetic-clean-host@1",
      scenario,
      coordinate: rule.coordinate,
      terminal: "blocked-forbidden-quarantine-action",
      trace: [...trace, ...flow],
    };
  }
  trace.push(...flow);
  const cleanup = scenario === "cleanup-failure"
    ? rule.fieldValues.cleanupSteps.slice(0, -1)
    : [...rule.fieldValues.cleanupSteps];
  trace.push(...cleanup);
  const cleanupExact = JSON.stringify(cleanup) === JSON.stringify(rule.fieldValues.cleanupSteps);
  return {
    protocol: "effect-build/apple-synthetic-clean-host@1",
    scenario,
    coordinate: rule.coordinate,
    terminal: cleanupExact ? "synthetic-only-complete" : "blocked-incomplete-cleanup",
    trace,
  };
};
