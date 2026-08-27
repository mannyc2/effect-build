import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertCertificationHost, classifyCertificationHost } from "./certification-host.mjs";
import {
  researchCompleteContract,
  researchEvidenceAccountingForProvider,
} from "./research-evidence-accounting.mjs";
import {
  providerNativeObservationManifest,
  providerNativeObservationSchema,
  readProviderNativeObservationDirectory,
} from "./provider-native-observation.mjs";

export const providerNativeReceiptSchema = "effect-build/provider-native-evidence-receipt@2";

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
};

const ruleFrom = (contract) => {
  if (contract?.schema !== "effect-build/research-complete-contract@1") {
    throw new Error("research-complete provider-native receipt authority is unavailable");
  }
  const rule = contract.evidenceControl?.coordinateRules?.providerNativeLanes;
  if (!Array.isArray(rule?.axes?.providerRuntimeCell) || !Array.isArray(rule.axes.certificationHost)) {
    throw new Error("research-complete provider-native coordinate authority is unavailable");
  }
  return rule;
};

const providerFromCell = (providerRuntimeCell) => {
  if (providerRuntimeCell.startsWith("bun@")) return "bun";
  if (providerRuntimeCell.startsWith("deno@")) return "deno";
  if (providerRuntimeCell.startsWith("node@")) return "node-sea";
  if (providerRuntimeCell.startsWith("esbuild@")) return "esbuild";
  if (providerRuntimeCell.startsWith("rolldown@")) return "rolldown";
  throw new Error(`unknown provider-native runtime cell: ${providerRuntimeCell}`);
};

const hostRuntimeFromCell = (providerRuntimeCell) => {
  const separator = providerRuntimeCell.indexOf("+");
  return separator === -1 ? providerRuntimeCell : providerRuntimeCell.slice(separator + 1);
};

const unsupportedCoordinate = (rule, providerRuntimeCell, certificationHost) =>
  rule.explicitUnsupportedCoordinates?.some(
    (coordinate) =>
      coordinate.providerRuntimeCell === providerRuntimeCell
      && coordinate.certificationHost === certificationHost,
  ) ?? false;

export const providerNativeAccounting = (providerRuntimeCell, contract = researchCompleteContract) => {
  requireText(providerRuntimeCell, "provider runtime cell");
  const rule = ruleFrom(contract);
  if (!rule.axes.providerRuntimeCell.includes(providerRuntimeCell)) {
    throw new Error(`provider-native runtime cell is outside the research contract: ${providerRuntimeCell}`);
  }
  const provider = providerFromCell(providerRuntimeCell);
  const { operationIds, atomIds } = researchEvidenceAccountingForProvider(provider, contract);
  if (operationIds.length === 0) throw new Error(`${providerRuntimeCell} has no live operation evidence`);

  return Object.freeze({
    provider,
    hostRuntime: hostRuntimeFromCell(providerRuntimeCell),
    operationIds,
    atomIds,
  });
};

export const providerNativeReceiptExpectation = (
  providerRuntimeCell,
  certificationHost,
  contract = researchCompleteContract,
) => {
  requireText(certificationHost, "certification host");
  const accounting = providerNativeAccounting(providerRuntimeCell, contract);
  const observationManifest = providerNativeObservationManifest({
    providerRuntimeCell,
    certificationHost,
    operationIds: accounting.operationIds,
    atomIds: accounting.atomIds,
  });
  return Object.freeze({
    schema: providerNativeReceiptSchema,
    provider: accounting.provider,
    hostRuntime: accounting.hostRuntime,
    claim: "provider-native-test-observed-exact-operation-and-atom-evidence-no-conditional-admission",
    scopeSchema: contract.schema,
    observationSchema: providerNativeObservationSchema,
    observationCount: String(observationManifest.observations.length),
    observationManifestSha256: observationManifest.sha256,
    wrapperJobCount: "1",
    operationCount: String(accounting.operationIds.length),
    operationIds: accounting.operationIds,
    atomCount: String(accounting.atomIds.length),
    atomIds: accounting.atomIds,
  });
};

export const createProviderNativeReceipt = ({
  providerRuntimeCell,
  certificationHost,
  hostRuntime,
  observedHost,
  observationCount,
  observationManifestSha256,
  contract = researchCompleteContract,
}) => {
  requireText(certificationHost, "certification host");
  const rule = ruleFrom(contract);
  if (!rule.axes.certificationHost.includes(certificationHost)) {
    throw new Error(`certification host is outside the provider-native research contract: ${certificationHost}`);
  }
  if (unsupportedCoordinate(rule, providerRuntimeCell, certificationHost)) {
    throw new Error(`provider-native coordinate is explicitly unsupported: ${providerRuntimeCell}/${certificationHost}`);
  }
  const expectation = providerNativeReceiptExpectation(providerRuntimeCell, certificationHost, contract);
  if (hostRuntime !== expectation.hostRuntime) {
    throw new Error(`provider-native host runtime mismatch: expected ${expectation.hostRuntime}, observed ${hostRuntime}`);
  }
  if (observedHost?.certificationHost !== certificationHost) {
    throw new Error(
      `provider-native certification host mismatch: expected ${certificationHost}, observed ${String(observedHost?.certificationHost)}`,
    );
  }
  const definition = contract.evidenceControl.certificationHosts?.find(({ id }) => id === certificationHost);
  if (definition === undefined || definition.systemTarget !== observedHost.systemTarget) {
    throw new Error("provider-native certification host target does not match the research contract");
  }
  const hostPlatform = requireText(observedHost.platform, "observed host platform");
  const hostArchitecture = requireText(observedHost.architecture, "observed host architecture");
  const hostLibc = requireText(observedHost.libc, "observed host libc");
  if (
    classifyCertificationHost({
      platform: hostPlatform,
      architecture: hostArchitecture,
      libc: hostLibc,
    }) !== certificationHost
  ) {
    throw new Error("provider-native observed host fields do not match the certification host");
  }
  if (
    observationCount !== expectation.observationCount
    || observationManifestSha256 !== expectation.observationManifestSha256
  ) throw new Error("provider-native test observations do not cover the exact research accounting");

  return Object.freeze({
    schema: expectation.schema,
    providerRuntimeCell,
    provider: expectation.provider,
    certificationHost,
    hostPlatform,
    hostArchitecture,
    hostLibc,
    hostSystemTarget: observedHost.systemTarget,
    hostRuntime: expectation.hostRuntime,
    claim: expectation.claim,
    scopeSchema: expectation.scopeSchema,
    observationSchema: expectation.observationSchema,
    observationCount: expectation.observationCount,
    observationManifestSha256: expectation.observationManifestSha256,
    wrapperJobCount: expectation.wrapperJobCount,
    operationCount: expectation.operationCount,
    operationIds: expectation.operationIds,
    atomCount: expectation.atomCount,
    atomIds: expectation.atomIds,
  });
};

export const writeProviderNativeReceipt = async ({ output, observationDirectory, ...input }) => {
  requireText(output, "provider-native receipt output");
  requireText(observationDirectory, "provider-native observation directory");
  const accounting = providerNativeAccounting(input.providerRuntimeCell, input.contract ?? researchCompleteContract);
  const observationManifest = await readProviderNativeObservationDirectory({
    directory: observationDirectory,
    providerRuntimeCell: input.providerRuntimeCell,
    certificationHost: input.certificationHost,
    operationIds: accounting.operationIds,
    atomIds: accounting.atomIds,
  });
  const receipt = createProviderNativeReceipt({
    ...input,
    observationCount: String(observationManifest.observations.length),
    observationManifestSha256: observationManifest.sha256,
  });
  await writeFile(resolve(output), `${JSON.stringify(receipt)}\n`, { flag: "wx" });
  return receipt;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [providerRuntimeCell, certificationHost, hostRuntime, observationDirectory, output] = process.argv.slice(2);
  if (
    providerRuntimeCell === undefined
    || certificationHost === undefined
    || hostRuntime === undefined
    || observationDirectory === undefined
    || output === undefined
  ) {
    throw new Error(
      "usage: provider-native-receipt.mjs <provider-runtime-cell> <certification-host> <host-runtime> <observation-directory> <output-file>",
    );
  }
  const observedHost = assertCertificationHost(certificationHost);
  await writeProviderNativeReceipt({
    providerRuntimeCell,
    certificationHost,
    hostRuntime,
    observedHost,
    observationDirectory,
    output,
  });
}
