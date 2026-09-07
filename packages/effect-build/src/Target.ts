import { Schema } from "effect";

/** Names follow Node/Bun and ts-release; Linux without a suffix means glibc. */
export const Target = Schema.Literals([
  "linux-x64",
  "linux-x64-musl",
  "linux-arm64",
  "linux-arm64-musl",
  "darwin-x64",
  "darwin-arm64",
  "windows-x64",
  "windows-arm64",
] as const);
export type Target = typeof Target.Type;

export type Os = "linux" | "darwin" | "windows";
export type Arch = "x64" | "arm64";
export type Abi = "gnu" | "musl";
export type Format = "elf" | "mach-o" | "pe";

export interface Parts {
  readonly os: Os;
  readonly arch: Arch;
  readonly abi: Abi | undefined;
  readonly format: Format;
  readonly executableSuffix: "" | ".exe";
}

export const parts = (target: Target): Parts => {
  const [os, arch, abi] = target.split("-") as [Os, Arch, Abi | undefined];
  return {
    os,
    arch,
    abi: os === "linux" ? (abi ?? "gnu") : undefined,
    format: os === "linux" ? "elf" : os === "darwin" ? "mach-o" : "pe",
    executableSuffix: os === "windows" ? ".exe" : "",
  };
};

export const all: readonly Target[] = Target.literals;

/** The target of the machine running this process, if it is one we support. */
export const host = (): Target | undefined => {
  const os = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : undefined;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : undefined;
  if (os === undefined || arch === undefined) return undefined;
  return `${os}-${arch}` as Target;
};
