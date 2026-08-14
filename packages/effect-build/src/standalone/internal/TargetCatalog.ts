import { Schema } from "effect";

export const OperatingSystem = Schema.Literals(["macos", "linux", "windows"] as const);
export type OperatingSystem = typeof OperatingSystem.Type;

export const Architecture = Schema.Literals(["x64", "aarch64"] as const);
export type Architecture = typeof Architecture.Type;

export const Abi = Schema.Literals(["gnu", "musl"] as const);
export type Abi = typeof Abi.Type;

export interface TargetDescriptor {
  readonly os: OperatingSystem;
  readonly architecture: Architecture;
  readonly abi?: Abi;
  readonly executableSuffix: "" | ".exe";
}

const catalog = {
  "macos-x64": { os: "macos", architecture: "x64", executableSuffix: "" },
  "macos-aarch64": { os: "macos", architecture: "aarch64", executableSuffix: "" },
  "linux-x64-gnu": { os: "linux", architecture: "x64", abi: "gnu", executableSuffix: "" },
  "linux-x64-musl": { os: "linux", architecture: "x64", abi: "musl", executableSuffix: "" },
  "linux-aarch64-gnu": { os: "linux", architecture: "aarch64", abi: "gnu", executableSuffix: "" },
  "linux-aarch64-musl": { os: "linux", architecture: "aarch64", abi: "musl", executableSuffix: "" },
  "windows-x64": { os: "windows", architecture: "x64", executableSuffix: ".exe" },
  "windows-aarch64": { os: "windows", architecture: "aarch64", executableSuffix: ".exe" },
} as const satisfies Readonly<Record<string, TargetDescriptor>>;

export type SystemTarget = keyof typeof catalog;

// Object.keys cannot retain literal keys. Keep the one audited assertion here.
const literals = Object.freeze(Object.keys(catalog)) as readonly [SystemTarget, ...SystemTarget[]];

export const SystemTarget = Schema.Literals(literals);

// Temporary compatibility alias for the pre-granular compile internals. The
// value is the same Schema authority, not a second target catalog.
export const Target = SystemTarget;
export type Target = SystemTarget;

export const descriptorOf = (target: SystemTarget): TargetDescriptor => catalog[target];

export interface NativeTargetObservation {
  readonly os: OperatingSystem;
  readonly architecture: Architecture;
  readonly abi?: Abi;
}

export const matchesObservation = (target: SystemTarget, observation: NativeTargetObservation): boolean => {
  const descriptor = descriptorOf(target);
  return descriptor.os === observation.os
    && descriptor.architecture === observation.architecture
    && (observation.abi === undefined || descriptor.abi === observation.abi);
};

export const targetFromObservation = (
  observation: NativeTargetObservation,
  fallback?: SystemTarget,
): SystemTarget | undefined => {
  const matches = SystemTarget.literals.filter((target) => matchesObservation(target, observation));
  if (matches.length === 1) return matches[0];
  if (fallback !== undefined && matches.includes(fallback)) return fallback;
  return undefined;
};
