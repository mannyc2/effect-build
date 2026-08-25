import type { SystemTarget } from "../packages/effect-build/src/SystemTarget.js";

export const hostTarget = (): SystemTarget => {
  const architecture = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error(`unsupported test host architecture: ${process.arch}`);
  if (process.platform === "darwin") return architecture === "x64" ? "macos-x64" : "macos-aarch64";
  if (process.platform === "linux") return architecture === "x64" ? "linux-x64-gnu" : "linux-aarch64-gnu";
  if (process.platform === "win32") return architecture === "x64" ? "windows-x64" : "windows-aarch64";
  throw new Error(`unsupported test host platform: ${process.platform}`);
};
