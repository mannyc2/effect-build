import { Schema } from "effect";

export const Target = Schema.Literals(
  [
    "macos-x64",
    "macos-aarch64",
    "linux-x64-gnu",
    "linux-x64-musl",
    "linux-aarch64-gnu",
    "linux-aarch64-musl",
    "windows-x64",
    "windows-aarch64",
  ] as const,
);
export type Target = typeof Target.Type;

export type OperatingSystem = "macos" | "linux" | "windows";
export type Architecture = "x64" | "aarch64";
export type Abi = "gnu" | "musl";
export type NativeFormat = "elf" | "mach-o" | "pe";

export interface Info {
  readonly os: OperatingSystem;
  readonly architecture: Architecture;
  readonly abi: Abi | undefined;
  readonly executableSuffix: "" | ".exe";
  readonly nativeFormat: NativeFormat;
}

const entry = (
  os: OperatingSystem,
  architecture: Architecture,
  abi: Abi | undefined,
  executableSuffix: "" | ".exe",
  nativeFormat: NativeFormat,
): Info => ({ os, architecture, abi, executableSuffix, nativeFormat });

const table: Record<Target, Info> = {
  "macos-x64": entry("macos", "x64", undefined, "", "mach-o"),
  "macos-aarch64": entry("macos", "aarch64", undefined, "", "mach-o"),
  "linux-x64-gnu": entry("linux", "x64", "gnu", "", "elf"),
  "linux-x64-musl": entry("linux", "x64", "musl", "", "elf"),
  "linux-aarch64-gnu": entry("linux", "aarch64", "gnu", "", "elf"),
  "linux-aarch64-musl": entry("linux", "aarch64", "musl", "", "elf"),
  "windows-x64": entry("windows", "x64", undefined, ".exe", "pe"),
  "windows-aarch64": entry("windows", "aarch64", undefined, ".exe", "pe"),
};

export const info = (target: Target): Info => table[target];
