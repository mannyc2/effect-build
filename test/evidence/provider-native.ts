import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const schema = "effect-build/provider-native-operation-observation@1" as const;

const compareUtf16 = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const canonicalValue = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("provider observation requires canonical JSON values");
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${
    Object.keys(record).sort(compareUtf16).map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(",")
  }}`;
};

const canonicalBytes = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalValue(value)}\n`);

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

export const observeProviderNativeEvidence = async (...ids: readonly string[]): Promise<void> => {
  const directory = process.env.EFFECT_BUILD_PROVIDER_EVIDENCE_DIRECTORY;
  if (directory === undefined) return;
  const providerRuntimeCell = process.env.EFFECT_BUILD_PROVIDER_RUNTIME_CELL;
  const certificationHost = process.env.EFFECT_BUILD_CERTIFICATION_HOST;
  if (providerRuntimeCell === undefined || certificationHost === undefined) {
    throw new Error("provider-native evidence output requires the exact runtime cell and certification host");
  }
  for (const id of [...new Set(ids)].sort()) {
    if (!/^[A-Z][A-Za-z0-9.-]*$/u.test(id)) throw new Error(`invalid research evidence identifier: ${id}`);
    const bytes = canonicalBytes({
      schema,
      providerRuntimeCell,
      certificationHost,
      kind: id.startsWith("CAN-") ? "operation" : "atom",
      id,
    });
    const destination = join(resolve(directory), `${id}.json`);
    try {
      await writeFile(destination, bytes, { flag: "wx" });
    } catch (cause) {
      if (
        cause === null
        || typeof cause !== "object"
        || !("code" in cause)
        || cause.code !== "EEXIST"
      ) throw cause;
      const existing = await readFile(destination);
      if (!sameBytes(existing, bytes)) throw new Error(`conflicting provider-native observation: ${id}`);
    }
  }
};
