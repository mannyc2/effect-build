import { Buffer } from "node:buffer";

import {
  appleCertificationPolicy,
  artifactCoordinate,
  bytes,
  canonicalBytes,
  canonicalDigest,
  canonicalNonNegativeDecimal,
  decodeCanonicalJson,
  exactKeys,
  fullSourceSha,
  sameCanonical,
  sha256Digest,
} from "./canonical.mjs";
import { receiptEvidenceDigest, validateAppleReceipts } from "./receipt.mjs";

const sameArray = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const opaqueBytes = (value, label) => {
  const output = bytes(value, label);
  if (output.byteLength === 0) throw new Error(`${label} must be non-empty opaque bytes`);
  return output;
};

const exactEvidenceMap = (input, policy) => {
  if (!(input instanceof Map)) throw new Error("Apple aggregate evidence must be a Map of exact opaque bytes");
  const keys = [...input.keys()];
  if (!sameArray(keys, policy.evidenceDescriptorOrder)) {
    throw new Error("Apple evidence is missing, additional, duplicate, or out of policy order");
  }
  return input;
};

const buildEvidence = (input, policy) => {
  const evidence = exactEvidenceMap(input, policy);
  const payloads = [];
  const entries = [];
  let offset = 0;
  for (const id of policy.evidenceDescriptorOrder) {
    const payload = opaqueBytes(evidence.get(id), `Apple evidence ${id}`);
    const coordinate = policy.coordinates.includes(id) ? id : "A7";
    entries.push({
      id,
      protocol: policy.protocols.evidence,
      coordinate,
      offset: `${offset}`,
      bytes: `${payload.byteLength}`,
      digest: sha256Digest(payload),
    });
    payloads.push(payload);
    offset += payload.byteLength;
  }
  return { entries, payload: Buffer.concat(payloads) };
};

const headerFor = ({ policy, sourceSha, candidateCoordinate, workflowCoordinate, receipts, entries, payload }) => ({
  protocol: policy.protocols.bundle,
  sourceSha,
  candidateCoordinate,
  workflowCoordinate,
  receiptProtocol: policy.protocols.receipt,
  receiptCount: policy.counts.total,
  receiptsDigest: sha256Digest(canonicalBytes(receipts)),
  receipts,
  evidenceProtocol: policy.protocols.evidence,
  evidenceEntries: entries,
  payloadBytes: `${payload.byteLength}`,
  payloadDigest: sha256Digest(payload),
});

const encodeBundle = (policy, header, payload) => {
  const headerBytes = canonicalBytes(header);
  if (headerBytes.byteLength > 0xffff_ffff) throw new Error("Apple bundle header exceeds u32 framing");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.byteLength);
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64BE(BigInt(payload.byteLength));
  return Buffer.concat([
    Buffer.from(`${policy.protocols.bundle}\n`, "utf8"),
    headerLength,
    headerBytes,
    payloadLength,
    payload,
  ]);
};

const indexFor = ({ policy, sourceSha, candidateCoordinate, workflowCoordinate, header, bundle }) => ({
  protocol: policy.protocols.index,
  sourceSha,
  candidateCoordinate,
  workflowCoordinate,
  bundleProtocol: policy.protocols.bundle,
  bundleFile: policy.artifact.orderedFiles[1],
  bundleBytes: `${bundle.byteLength}`,
  bundleDigest: sha256Digest(bundle),
  receiptCount: policy.counts.total,
  orderedCoordinates: policy.coordinates,
  receiptsDigest: header.receiptsDigest,
  payloadBytes: header.payloadBytes,
  payloadDigest: header.payloadDigest,
  verdict: policy.encoding.terminalVerdict,
});

export const buildAppleAggregate = ({
  contract,
  sourceSha,
  candidateCoordinate,
  workflowCoordinate,
  receipts,
  evidenceBytes,
}) => {
  const { policy, release } = appleCertificationPolicy(contract);
  fullSourceSha(sourceSha, "Apple aggregate source SHA");
  const candidate = artifactCoordinate(contract, candidateCoordinate, "Apple aggregate candidate coordinate");
  const workflow = artifactCoordinate(contract, workflowCoordinate, "Apple aggregate workflow coordinate");
  if (
    candidate.sourceSha !== sourceSha
    || workflow.sourceSha !== sourceSha
    || candidate.workflow !== release.candidate.workflow
    || workflow.workflow !== policy.workflow
    || workflow.runAttempt !== `${policy.artifact.attempt}`
  ) {
    throw new Error("Apple aggregate artifact coordinates changed source SHA");
  }
  const validatedReceipts = validateAppleReceipts({
    contract,
    receipts,
    expectedSourceSha: sourceSha,
    expectedCandidateCoordinate: candidate,
    expectedWorkflowCoordinate: workflow,
  });
  const { entries, payload } = buildEvidence(evidenceBytes, policy);
  for (const [index, receipt] of validatedReceipts.entries()) {
    if (receiptEvidenceDigest(receipt) !== entries[index].digest) {
      throw new Error(`${receipt.coordinate} evidence digest does not bind its exact opaque bytes`);
    }
  }
  const header = headerFor({
    policy,
    sourceSha,
    candidateCoordinate: candidate,
    workflowCoordinate: workflow,
    receipts: validatedReceipts,
    entries,
    payload,
  });
  exactKeys(header, policy.encoding.bundleHeaderFields, "Apple bundle header");
  const bundleBytes = encodeBundle(policy, header, payload);
  const index = indexFor({
    policy,
    sourceSha,
    candidateCoordinate: candidate,
    workflowCoordinate: workflow,
    header,
    bundle: bundleBytes,
  });
  exactKeys(index, policy.encoding.indexFields, "Apple aggregate index");
  return { index, indexBytes: canonicalBytes(index), bundleBytes };
};

const readU32 = (input, offset, label) => {
  if (offset + 4 > input.byteLength) throw new Error(`Apple bundle truncated before ${label}`);
  return input.readUInt32BE(offset);
};

const readU64 = (input, offset, label) => {
  if (offset + 8 > input.byteLength) throw new Error(`Apple bundle truncated before ${label}`);
  const value = input.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe byte addressing`);
  return Number(value);
};

const decodeBundle = (input, policy) => {
  const bundle = opaqueBytes(input, "Apple aggregate bundle");
  const protocol = Buffer.from(`${policy.protocols.bundle}\n`, "utf8");
  if (!bundle.subarray(0, protocol.byteLength).equals(protocol)) {
    throw new Error("Apple bundle protocol line changed");
  }
  let cursor = protocol.byteLength;
  const headerLength = readU32(bundle, cursor, "header length");
  cursor += 4;
  if (headerLength === 0 || headerLength > 16 * 1024 * 1024 || cursor + headerLength > bundle.byteLength) {
    throw new Error("Apple bundle header length is invalid");
  }
  const header = decodeCanonicalJson(bundle.subarray(cursor, cursor + headerLength), "Apple bundle header");
  cursor += headerLength;
  const payloadLength = readU64(bundle, cursor, "payload length");
  cursor += 8;
  if (payloadLength === 0 || cursor + payloadLength !== bundle.byteLength) {
    throw new Error("Apple bundle payload is truncated or has trailing bytes");
  }
  return { bundle, header, payload: bundle.subarray(cursor) };
};

const validateEvidenceEntries = ({ contract, policy, entries, payload, receipts }) => {
  if (!Array.isArray(entries) || entries.length !== policy.evidenceDescriptorOrder.length) {
    throw new Error("Apple bundle has missing or additional evidence entries");
  }
  let offset = 0;
  for (const [index, input] of entries.entries()) {
    const id = policy.evidenceDescriptorOrder[index];
    const entry = exactKeys(input, policy.encoding.evidenceEntryFields, `Apple evidence entry ${id}`);
    const coordinate = policy.coordinates.includes(id) ? id : "A7";
    if (
      entry.id !== id
      || entry.protocol !== policy.protocols.evidence
      || entry.coordinate !== coordinate
      || canonicalNonNegativeDecimal(entry.offset, `${id}.offset`) !== `${offset}`
    ) throw new Error(`Apple evidence entry ${id} identity, protocol, coordinate, or offset changed`);
    canonicalNonNegativeDecimal(entry.bytes, `${id}.bytes`);
    if (entry.bytes === "0") throw new Error(`Apple evidence entry ${id} is empty`);
    canonicalDigest(entry.digest, contract, `${id}.digest`);
    const length = Number(entry.bytes);
    if (!Number.isSafeInteger(length) || offset + length > payload.byteLength) {
      throw new Error(`Apple evidence entry ${id} exceeds the opaque payload`);
    }
    const observed = payload.subarray(offset, offset + length);
    if (sha256Digest(observed) !== entry.digest) throw new Error(`Apple evidence entry ${id} bytes changed`);
    if (index < receipts.length && receiptEvidenceDigest(receipts[index]) !== entry.digest) {
      throw new Error(`${id} receipt evidence digest changed`);
    }
    offset += length;
  }
  if (offset !== payload.byteLength) throw new Error("Apple evidence payload has gaps or trailing bytes");
};

const validateHeader = ({
  contract,
  policy,
  header,
  payload,
  expectedSourceSha,
  expectedCandidateCoordinate,
  expectedWorkflowCoordinate,
}) => {
  const value = exactKeys(header, policy.encoding.bundleHeaderFields, "Apple bundle header");
  if (
    value.protocol !== policy.protocols.bundle
    || value.receiptProtocol !== policy.protocols.receipt
    || value.evidenceProtocol !== policy.protocols.evidence
    || value.receiptCount !== policy.counts.total
    || value.sourceSha !== expectedSourceSha
  ) throw new Error("Apple bundle protocol, receipt count, or source SHA changed");
  if (
    !sameCanonical(value.candidateCoordinate, expectedCandidateCoordinate)
    || !sameCanonical(value.workflowCoordinate, expectedWorkflowCoordinate)
  ) throw new Error("Apple bundle candidate or workflow coordinate changed");
  canonicalDigest(value.receiptsDigest, contract, "Apple bundle receipts digest");
  canonicalNonNegativeDecimal(value.payloadBytes, "Apple bundle payload bytes");
  canonicalDigest(value.payloadDigest, contract, "Apple bundle payload digest");
  if (value.payloadBytes !== `${payload.byteLength}` || value.payloadDigest !== sha256Digest(payload)) {
    throw new Error("Apple bundle opaque payload bytes or digest changed");
  }
  if (value.receiptsDigest !== sha256Digest(canonicalBytes(value.receipts))) {
    throw new Error("Apple bundle receipt bytes changed");
  }
  const receipts = validateAppleReceipts({
    contract,
    receipts: value.receipts,
    expectedSourceSha,
    expectedCandidateCoordinate,
    expectedWorkflowCoordinate,
  });
  validateEvidenceEntries({ contract, policy, entries: value.evidenceEntries, payload, receipts });
  return { value, receipts };
};

export const validateAppleAggregate = ({
  contract,
  expectedSourceSha,
  expectedCandidateCoordinate,
  expectedWorkflowCoordinate,
  files,
  indexBytes,
  bundleBytes,
}) => {
  const { policy, release } = appleCertificationPolicy(contract);
  if (!sameArray(files, policy.artifact.orderedFiles)) {
    throw new Error("Apple aggregate directory must contain only the two exact policy filenames in order");
  }
  fullSourceSha(expectedSourceSha, "expected Apple source SHA");
  const candidate = artifactCoordinate(contract, expectedCandidateCoordinate, "expected Apple candidate coordinate");
  const workflow = artifactCoordinate(contract, expectedWorkflowCoordinate, "expected Apple workflow coordinate");
  if (
    candidate.sourceSha !== expectedSourceSha
    || workflow.sourceSha !== expectedSourceSha
    || candidate.workflow !== release.candidate.workflow
    || workflow.workflow !== policy.workflow
    || workflow.runAttempt !== `${policy.artifact.attempt}`
  ) {
    throw new Error("expected Apple artifact coordinate source SHA changed");
  }
  const index = exactKeys(
    decodeCanonicalJson(indexBytes, "Apple aggregate index"),
    policy.encoding.indexFields,
    "Apple aggregate index",
  );
  const decoded = decodeBundle(bundleBytes, policy);
  const { value: header } = validateHeader({
    contract,
    policy,
    header: decoded.header,
    payload: decoded.payload,
    expectedSourceSha,
    expectedCandidateCoordinate: candidate,
    expectedWorkflowCoordinate: workflow,
  });
  const expectedIndex = indexFor({
    policy,
    sourceSha: expectedSourceSha,
    candidateCoordinate: candidate,
    workflowCoordinate: workflow,
    header,
    bundle: decoded.bundle,
  });
  if (!sameCanonical(index, expectedIndex)) {
    throw new Error("Apple index does not bind the exact bundle, receipts, payload, or coordinates");
  }
  return index;
};
