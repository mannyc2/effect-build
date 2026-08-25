import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const contract = JSON.parse(
  await readFile(new URL("../tooling/research-complete-contract.json", import.meta.url), "utf8"),
);
if (contract.schema !== "effect-build/research-complete-contract@1") {
  throw new Error("research-complete certification-host authority is unavailable");
}
const definitions = contract.evidenceControl.certificationHosts;

export const observedSystemTarget = () => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "macos-aarch64" : "macos-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "windows-aarch64" : "windows-x64";
  if (process.platform === "linux") return process.arch === "arm64" ? "linux-aarch64-gnu" : "linux-x64-gnu";
  throw new Error(`unsupported runner ${process.platform}/${process.arch}`);
};

const observedLibc = () => {
  if (process.platform !== "linux") return "not-applicable";
  const report = process.report?.getReport();
  return typeof report?.header?.glibcVersionRuntime === "string" ? "glibc" : "unknown";
};

export const classifyCertificationHost = ({ platform, architecture, libc }) => {
  if (platform === "linux" && architecture === "x64" && libc === "glibc") return "linux-x64";
  if (platform === "linux" && architecture === "arm64" && libc === "glibc") return "linux-arm64";
  if (platform === "darwin" && architecture === "arm64" && libc === "not-applicable") return "macos-arm64";
  if (platform === "darwin" && architecture === "x64" && libc === "not-applicable") return "macos-x64";
  if (platform === "win32" && architecture === "x64" && libc === "not-applicable") return "windows-x64";
  throw new Error(`runner is outside the D13 host set: ${platform}/${architecture}/${libc}`);
};

export const certificationHostDefinition = (id) => {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new Error(`unknown D13 certification host ${id}`);
  return definition;
};

export const assertCertificationHost = (expected) => {
  const platform = process.platform;
  const architecture = process.arch;
  const libc = observedLibc();
  const observed = classifyCertificationHost({ platform, architecture, libc });
  if (observed !== expected) throw new Error(`D13 host mismatch: expected ${expected}, observed ${observed}`);
  const definition = certificationHostDefinition(observed);
  const systemTarget = observedSystemTarget();
  if (definition.systemTarget !== systemTarget) {
    throw new Error(`D13 host target mismatch: ${definition.systemTarget} != ${systemTarget}`);
  }
  return Object.freeze({
    certificationHost: observed,
    platform,
    architecture,
    libc,
    systemTarget,
  });
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const expected = process.argv[2];
  if (expected === undefined) throw new Error("usage: certification-host.mjs <expected-host>");
  process.stdout.write(`${JSON.stringify(assertCertificationHost(expected))}\n`);
}
