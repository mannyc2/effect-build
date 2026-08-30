import type * as Artifact from "effect-build/Artifact";
import {
  assemble,
  type Asset,
  type Error,
  type Input,
  type Main,
  type MainFormat,
  publicInputKeys,
} from "../internal/Assemble.js";

export type { Asset, Error, Input, Main, MainFormat };

/**
 * Runs the admitted direct Node SEA operation. The public request deliberately
 * fixes snapshot and code-cache modes off and exposes no embedded-argument
 * policy until their separate provider-native evidence gates close.
 */
export const assembleDirect = <Mode extends Artifact.ObservationMode>(input: Input<Mode>) =>
  assemble(input, { useSnapshot: false, useCodeCache: false }, publicInputKeys);

export {
  NodeSeaCandidateInvalid,
  NodeSeaCommandFailed,
  NodeSeaInputInvalid,
  NodeSeaTransportFailed,
} from "../internal/Error.js";
