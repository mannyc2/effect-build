export interface CertificationHostObservation {
  readonly certificationHost: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly libc: "glibc" | "not-applicable";
  readonly systemTarget: string;
}

export function observedSystemTarget(): string;
export function classifyCertificationHost(input: {
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly libc: "glibc" | "not-applicable" | "unknown";
}): string;
export function certificationHostDefinition(id: string): {
  readonly id: string;
  readonly runner: string;
  readonly systemTarget: string;
};
export function assertCertificationHost(expected: string): CertificationHostObservation;
