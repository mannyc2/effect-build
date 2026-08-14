export * as Artifact from "./standalone/Artifact.js";
export * as BuildError from "./standalone/BuildError.js";
import {
  Format,
  InvalidJavaScriptBundle,
  InvalidReason,
  JavaScriptBundleAccessFailed,
  JavaScriptBundleAccessOperation,
  JavaScriptBundleTemporaryDirectoryFailed,
  withFile,
} from "./JavaScriptBundle.js";
import type * as JavaScriptBundleTypes from "./JavaScriptBundle.js";
import type { StageObservation } from "./standalone/Artifact.js";

export const JavaScriptBundle = Object.freeze({
  Format,
  InvalidReason,
  InvalidJavaScriptBundle,
  JavaScriptBundleAccessOperation,
  JavaScriptBundleAccessFailed,
  JavaScriptBundleTemporaryDirectoryFailed,
  withFile,
});

export namespace JavaScriptBundle {
  export type Format = JavaScriptBundleTypes.Format;
  export type Input<Stages extends readonly StageObservation[] = readonly StageObservation[]> =
    JavaScriptBundleTypes.Input<Stages>;
  export type Artifact<Stages extends readonly StageObservation[] = readonly StageObservation[]> =
    JavaScriptBundleTypes.Artifact<Stages>;
  export type InvalidReason = JavaScriptBundleTypes.InvalidReason;
  export type InvalidJavaScriptBundle = JavaScriptBundleTypes.InvalidJavaScriptBundle;
  export type JavaScriptBundleAccessOperation = JavaScriptBundleTypes.JavaScriptBundleAccessOperation;
  export type JavaScriptBundleAccessFailed = JavaScriptBundleTypes.JavaScriptBundleAccessFailed;
  export type JavaScriptBundleTemporaryDirectoryFailed = JavaScriptBundleTypes.JavaScriptBundleTemporaryDirectoryFailed;
  export type JavaScriptBundleError = JavaScriptBundleTypes.JavaScriptBundleError;
}

export * as MatrixError from "./standalone/MatrixError.js";
export * as Target from "./standalone/Target.js";
