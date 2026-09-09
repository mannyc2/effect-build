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

/** Host target when OS, architecture and (on Linux) libc are established.
 * Unknown libc returns undefined; native compilers should select their own host. */
export const host = (): Target | undefined => {
  if (typeof process === "undefined") return undefined;
  const os = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : undefined;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : undefined;
  if (os === undefined || arch === undefined) return undefined;
  if (os === "linux") {
    try {
      const report: unknown = process.report?.getReport();
      if (typeof report !== "object" || report === null) return undefined;
      const header: unknown = Reflect.get(report, "header");
      const glibc: unknown = typeof header === "object" && header !== null ? Reflect.get(header, "glibcVersionRuntime") : undefined;
      if (typeof glibc === "string" && glibc.length > 0) return `linux-${arch}`;
      const shared: unknown = Reflect.get(report, "sharedObjects");
      if (Array.isArray(shared) && shared.some((path: unknown) => typeof path === "string" && /(?:^|\/)ld-musl-[^/]+\.so\.1$/u.test(path))) {
        return `linux-${arch}-musl`;
      }
    } catch {
      // Some runtimes omit process reports. Absence of libc evidence is unknown.
    }
    return undefined;
  }
  return `${os}-${arch}` as Target;
};
