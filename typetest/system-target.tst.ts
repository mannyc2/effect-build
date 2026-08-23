import type * as Target from "../packages/effect-build/src/SystemTarget.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _OperatingSystem = Assert<Same<Target.OperatingSystem, "macos" | "linux" | "windows">>;
export type _Architecture = Assert<Same<Target.Architecture, "x64" | "aarch64">>;
export type _Abi = Assert<Same<Target.Abi, "gnu" | "musl">>;
export type _SystemTarget = Assert<
  Same<
    Target.SystemTarget,
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-x64-musl"
    | "linux-aarch64-gnu"
    | "linux-aarch64-musl"
    | "windows-x64"
    | "windows-aarch64"
  >
>;

type ExactDescriptor =
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

export type _Descriptor = Assert<Same<Target.Descriptor, ExactDescriptor>>;
