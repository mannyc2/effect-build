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

export interface Descriptor {
  readonly target: SystemTarget;
  readonly os: OperatingSystem;
  readonly architecture: Architecture;
  readonly abi: Abi | null;
  readonly executableSuffix: "" | ".exe";
  readonly nativeFormat: "elf" | "mach-o" | "pe";
}

const descriptors: Readonly<Record<SystemTarget, Descriptor>> = Object.freeze({
  "macos-x64": {
    target: "macos-x64",
    os: "macos",
    architecture: "x64",
    abi: null,
    executableSuffix: "",
    nativeFormat: "mach-o",
  },
  "macos-aarch64": {
    target: "macos-aarch64",
    os: "macos",
    architecture: "aarch64",
    abi: null,
    executableSuffix: "",
    nativeFormat: "mach-o",
  },
  "linux-x64-gnu": {
    target: "linux-x64-gnu",
    os: "linux",
    architecture: "x64",
    abi: "gnu",
    executableSuffix: "",
    nativeFormat: "elf",
  },
  "linux-x64-musl": {
    target: "linux-x64-musl",
    os: "linux",
    architecture: "x64",
    abi: "musl",
    executableSuffix: "",
    nativeFormat: "elf",
  },
  "linux-aarch64-gnu": {
    target: "linux-aarch64-gnu",
    os: "linux",
    architecture: "aarch64",
    abi: "gnu",
    executableSuffix: "",
    nativeFormat: "elf",
  },
  "linux-aarch64-musl": {
    target: "linux-aarch64-musl",
    os: "linux",
    architecture: "aarch64",
    abi: "musl",
    executableSuffix: "",
    nativeFormat: "elf",
  },
  "windows-x64": {
    target: "windows-x64",
    os: "windows",
    architecture: "x64",
    abi: null,
    executableSuffix: ".exe",
    nativeFormat: "pe",
  },
  "windows-aarch64": {
    target: "windows-aarch64",
    os: "windows",
    architecture: "aarch64",
    abi: null,
    executableSuffix: ".exe",
    nativeFormat: "pe",
  },
});

export const describe = (target: SystemTarget): Descriptor => descriptors[target];
