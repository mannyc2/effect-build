import { Schema } from "effect";

export const OperatingSystem = Schema.Literals(["macos", "linux", "windows"] as const);
export type OperatingSystem = typeof OperatingSystem.Type;

export const Architecture = Schema.Literals(["x64", "aarch64"] as const);
export type Architecture = typeof Architecture.Type;

export const Abi = Schema.Literals(["gnu", "musl"] as const);
export type Abi = typeof Abi.Type;

export const SystemTarget = Schema.Literals(
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
export type SystemTarget = typeof SystemTarget.Type;

export type Descriptor =
  | {
    readonly target: "macos-x64";
    readonly os: "macos";
    readonly architecture: "x64";
    readonly abi: null;
    readonly executableSuffix: "";
    readonly nativeFormat: "mach-o";
  }
  | {
    readonly target: "macos-aarch64";
    readonly os: "macos";
    readonly architecture: "aarch64";
    readonly abi: null;
    readonly executableSuffix: "";
    readonly nativeFormat: "mach-o";
  }
  | {
    readonly target: "linux-x64-gnu";
    readonly os: "linux";
    readonly architecture: "x64";
    readonly abi: "gnu";
    readonly executableSuffix: "";
    readonly nativeFormat: "elf";
  }
  | {
    readonly target: "linux-x64-musl";
    readonly os: "linux";
    readonly architecture: "x64";
    readonly abi: "musl";
    readonly executableSuffix: "";
    readonly nativeFormat: "elf";
  }
  | {
    readonly target: "linux-aarch64-gnu";
    readonly os: "linux";
    readonly architecture: "aarch64";
    readonly abi: "gnu";
    readonly executableSuffix: "";
    readonly nativeFormat: "elf";
  }
  | {
    readonly target: "linux-aarch64-musl";
    readonly os: "linux";
    readonly architecture: "aarch64";
    readonly abi: "musl";
    readonly executableSuffix: "";
    readonly nativeFormat: "elf";
  }
  | {
    readonly target: "windows-x64";
    readonly os: "windows";
    readonly architecture: "x64";
    readonly abi: null;
    readonly executableSuffix: ".exe";
    readonly nativeFormat: "pe";
  }
  | {
    readonly target: "windows-aarch64";
    readonly os: "windows";
    readonly architecture: "aarch64";
    readonly abi: null;
    readonly executableSuffix: ".exe";
    readonly nativeFormat: "pe";
  };
