import type { Effect, Scope } from "effect";
import type { ChildProcess } from "effect/unstable/process";
import type { ProviderPackageObservation } from "./contracts.js";

export interface BunCommandWatchRequest {
  readonly entrypoint: string;
  readonly outdir: string;
  readonly cwd?: string;
  readonly target: "node" | "browser";
  readonly minify: boolean;
}

export interface DenoCommandWatchRequest {
  readonly entrypoint: string;
  readonly outdir: string;
  readonly cwd?: string;
  readonly platform: "node" | "browser";
  readonly minify: boolean;
}

export interface ProviderCommandWatchSurface<Request, Failure, Requirements = never> {
  readonly providerPackage: ProviderPackageObservation;
  readonly eventProtocol: "raw-stdio-and-exit-only";
  readonly watch: (
    request: Request,
  ) => Effect.Effect<ChildProcess.ChildProcess, Failure, Scope.Scope | Requirements>;
}

export type BunCommandWatchSurface<Failure, Requirements = never> = ProviderCommandWatchSurface<
  BunCommandWatchRequest,
  Failure,
  Requirements
>;

export type DenoCommandWatchSurface<Failure, Requirements = never> = ProviderCommandWatchSurface<
  DenoCommandWatchRequest,
  Failure,
  Requirements
>;
