import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { classifyCertificationHost } from "./certification-host.mjs";
import { researchCompleteContract } from "./research-evidence-accounting.mjs";

export const compilerTargetReceiptSchema = "effect-build/compiler-target-evidence-receipt@1";

const exactVersions = Object.freeze({ bun: "1.3.14", deno: "2.9.5" });
const operationIds = Object.freeze({ bun: "CAN-BUN-012", deno: "CAN-DENO-010" });

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
};

const ruleFrom = (contract) => {
  if (contract?.schema !== "effect-build/research-complete-contract@1") {
    throw new Error("research-complete compiler-target authority is unavailable");
  }
  const rule = contract.evidenceControl?.coordinateRules?.compilerTargets;
  if (!Array.isArray(rule?.coordinates) || rule.expectedCoordinateCount !== rule.coordinates.length) {
    throw new Error("research-complete compiler-target coordinate authority is unavailable");
  }
  return rule;
};

export const compilerTargetReceiptExpectation = (compiler, target, contract = researchCompleteContract) => {
  requireText(compiler, "compiler");
  requireText(target, "target");
  const rule = ruleFrom(contract);
  if (!rule.coordinates.some((coordinate) => coordinate.compiler === compiler && coordinate.target === target)) {
    throw new Error(`compiler target is outside the research contract: ${compiler}/${target}`);
  }
  return Object.freeze({
    schema: compilerTargetReceiptSchema,
    compiler,
    target,
    certificationHost: rule.constructionHost,
    toolVersion: exactVersions[compiler],
    oracle: "file-and-readelf-structural-inspection",
    claim: "compiled-hashed-and-structurally-inspected-no-target-execution-claim",
    scopeSchema: contract.schema,
    targetExecutionClaim: rule.targetExecutionClaim,
    wrapperJobCount: "1",
    operationCount: "1",
    operationIds: Object.freeze([operationIds[compiler]]),
  });
};

export const createCompilerTargetReceipt = ({
  compiler,
  target,
  toolVersion,
  artifactBytes,
  artifactSha256,
  observedHost,
  contract = researchCompleteContract,
}) => {
  const expectation = compilerTargetReceiptExpectation(compiler, target, contract);
  if (toolVersion !== expectation.toolVersion) {
    throw new Error(`compiler target tool version mismatch: expected ${String(expectation.toolVersion)}`);
  }
  if (typeof artifactBytes !== "string" || !/^[1-9][0-9]*$/u.test(artifactBytes)) {
    throw new Error("compiler target artifact bytes must be a positive decimal string");
  }
  if (typeof artifactSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(artifactSha256)) {
    throw new Error("compiler target artifact digest must be lowercase SHA-256");
  }
  const hostPlatform = requireText(observedHost?.platform, "observed host platform");
  const hostArchitecture = requireText(observedHost?.architecture, "observed host architecture");
  const hostLibc = requireText(observedHost?.libc, "observed host libc");
  if (
    observedHost.certificationHost !== expectation.certificationHost
    || classifyCertificationHost({
      platform: hostPlatform,
      architecture: hostArchitecture,
      libc: hostLibc,
    }) !== expectation.certificationHost
  ) throw new Error("compiler target receipt was not produced on the exact construction host");
  const definition = contract.evidenceControl.certificationHosts.find(({ id }) => id === expectation.certificationHost);
  if (definition === undefined || definition.systemTarget !== observedHost.systemTarget) {
    throw new Error("compiler target construction host target does not match the research contract");
  }
  return Object.freeze({
    ...expectation,
    hostPlatform,
    hostArchitecture,
    hostLibc,
    hostSystemTarget: observedHost.systemTarget,
    artifactBytes,
    artifactSha256,
  });
};

export const writeCompilerTargetReceipt = async ({ output, ...input }) => {
  requireText(output, "compiler target receipt output");
  const receipt = createCompilerTargetReceipt(input);
  const destination = resolve(output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(receipt)}\n`, { flag: "wx" });
  return receipt;
};
