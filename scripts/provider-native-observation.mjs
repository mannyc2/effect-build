import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalBytes, decodeCanonical, sha256 } from "./node-finalizer/common.mjs";

export const providerNativeObservationSchema = "effect-build/provider-native-operation-observation@1";

const observationFields = [
  "certificationHost",
  "id",
  "kind",
  "providerRuntimeCell",
  "schema",
];

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
};

const kindFromId = (id) => id.startsWith("CAN-") ? "operation" : "atom";

export const providerNativeObservation = ({
  providerRuntimeCell,
  certificationHost,
  id,
}) => {
  requireText(providerRuntimeCell, "provider runtime cell");
  requireText(certificationHost, "certification host");
  requireText(id, "research evidence identifier");
  if (!/^[A-Z][A-Za-z0-9.-]*$/u.test(id)) throw new Error(`invalid research evidence identifier: ${id}`);
  return Object.freeze({
    schema: providerNativeObservationSchema,
    providerRuntimeCell,
    certificationHost,
    kind: kindFromId(id),
    id,
  });
};

const observationFilename = (id) => `${id}.json`;

export const writeProviderNativeObservation = async (input) => {
  const directory = resolve(requireText(input.directory, "provider-native observation directory"));
  const observation = providerNativeObservation(input);
  const destination = join(directory, observationFilename(observation.id));
  const bytes = canonicalBytes(observation);
  try {
    await writeFile(destination, bytes, { flag: "wx" });
  } catch (cause) {
    if (cause?.code !== "EEXIST") throw cause;
    const existing = await readFile(destination);
    if (!existing.equals(bytes)) throw new Error(`conflicting provider-native observation: ${observation.id}`);
  }
  return observation;
};

const readBoundedRegularFile = async (path) => {
  const before = await stat(path, { bigint: true });
  if (!before.isFile() || before.size <= 0n || before.size > 4096n) {
    throw new Error(`provider-native observation is not one bounded regular file: ${path}`);
  }
  const bytes = await readFile(path);
  const after = await stat(path, { bigint: true });
  if (
    before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs
    || BigInt(bytes.byteLength) !== before.size
  ) throw new Error(`provider-native observation changed while read: ${path}`);
  return bytes;
};

export const providerNativeObservationManifest = ({
  providerRuntimeCell,
  certificationHost,
  operationIds,
  atomIds,
}) => {
  const observations = [
    ...operationIds.map((id) => providerNativeObservation({ providerRuntimeCell, certificationHost, id })),
    ...atomIds.map((id) => providerNativeObservation({ providerRuntimeCell, certificationHost, id })),
  ].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const bytes = canonicalBytes({ observations });
  return Object.freeze({ observations, bytes, sha256: sha256(bytes) });
};

export const readProviderNativeObservationDirectory = async ({ directory, ...input }) => {
  const root = resolve(requireText(directory, "provider-native observation directory"));
  const expected = providerNativeObservationManifest(input);
  const expectedNames = expected.observations.map(({ id }) => observationFilename(id)).sort();
  const entries = await readdir(root, { withFileTypes: true });
  const actualNames = entries.map(({ name }) => name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames) || entries.some((entry) => !entry.isFile())) {
    throw new Error("provider-native observation directory does not contain the exact regular-file set");
  }
  for (const observation of expected.observations) {
    const bytes = await readBoundedRegularFile(join(root, observationFilename(observation.id)));
    const decoded = decodeCanonical(bytes, observationFields);
    if (!bytes.equals(canonicalBytes(observation)) || decoded.id !== observation.id) {
      throw new Error(`provider-native observation mismatch: ${observation.id}`);
    }
  }
  return expected;
};
