import * as SystemTarget from "../packages/effect-build/src/SystemTarget.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _SystemTarget = Assert<
  Same<
    SystemTarget.SystemTarget,
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

export type _Descriptor = Assert<
  Same<
    SystemTarget.Descriptor,
    {
      readonly target: SystemTarget.SystemTarget;
      readonly os: SystemTarget.OperatingSystem;
      readonly architecture: SystemTarget.Architecture;
      readonly abi: SystemTarget.Abi | null;
      readonly executableSuffix: "" | ".exe";
      readonly nativeFormat: "elf" | "mach-o" | "pe";
    }
  >
>;

const descriptor = SystemTarget.describe("linux-aarch64-musl");
export type _Describe = Assert<Same<typeof descriptor, SystemTarget.Descriptor>>;
