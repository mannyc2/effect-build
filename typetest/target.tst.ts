import * as Target from "../packages/effect-build/src/Target.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _Target = Assert<
  Same<
    Target.Target,
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

export type _Info = Assert<
  Same<
    Target.Info,
    {
      readonly os: "macos" | "linux" | "windows";
      readonly architecture: "x64" | "aarch64";
      readonly abi: "gnu" | "musl" | undefined;
      readonly executableSuffix: "" | ".exe";
      readonly nativeFormat: "elf" | "mach-o" | "pe";
    }
  >
>;

const information = Target.info("linux-x64-musl");
export type _InfoResult = Assert<Same<typeof information, Target.Info>>;

const host = Target.host();
export type _Host = Assert<Same<typeof host, Target.Target | undefined>>;
