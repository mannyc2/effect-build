import { Effect } from "effect";
import * as Core from "effect-build";
import * as Provider from "effect-build/Provider";
import { type EsbuildBundleError, type EsbuildVersionMismatch, makeLiveEsbuildService } from "./internal/Esbuild.js";
import { makeLiveNodeSeaService, type NodeSeaCandidateError, type NodeSeaLayerError } from "./internal/NodeSea.js";

export interface Asset {
  readonly key: string;
  readonly path: string;
}

export interface Options {
  readonly format: "esm" | "cjs";
  readonly assets?: readonly Asset[];
}

interface ValidatedOptions {
  readonly format: "esm" | "cjs";
  readonly assets: readonly Asset[];
}

const invalid = (reason: string): Provider.Validation<ValidatedOptions> => ({ _tag: "Invalid", reason });

const validateOptions = (input: unknown): Provider.Validation<ValidatedOptions> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid("options must be an object");
  }
  const value = input as Readonly<Record<string, unknown>>;
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !["format", "assets"].includes(key))) {
    return invalid("unknown Node SEA option");
  }
  if (value.format !== "esm" && value.format !== "cjs") return invalid("format must be esm or cjs");
  const rawAssets = value.assets ?? [];
  if (!Array.isArray(rawAssets) || rawAssets.length > 256) {
    return invalid("assets must be an array of at most 256 items");
  }
  const keys = new Set<string>();
  const assets: Asset[] = [];
  for (const rawAsset of rawAssets) {
    if (typeof rawAsset !== "object" || rawAsset === null || Array.isArray(rawAsset)) {
      return invalid("each asset must be an object");
    }
    const asset = rawAsset as Readonly<Record<string, unknown>>;
    if (
      Reflect.ownKeys(asset).some((key) => typeof key !== "string" || !["key", "path"].includes(key))
      || !Object.hasOwn(asset, "key")
      || !Object.hasOwn(asset, "path")
    ) return invalid("each asset must contain exactly key and path");
    if (typeof asset.key !== "string" || asset.key.length === 0 || asset.key.includes("\0")) {
      return invalid("asset key must be a non-empty string without NUL");
    }
    if (new TextEncoder().encode(asset.key).byteLength > 1024) return invalid("asset key is too long");
    if (keys.has(asset.key)) return invalid("asset keys must be unique");
    if (typeof asset.path !== "string" || asset.path.length === 0 || asset.path.includes("\0")) {
      return invalid("asset path must be a non-empty string without NUL");
    }
    keys.add(asset.key);
    assets.push({ key: asset.key, path: asset.path });
  }
  return { _tag: "Valid", value: { format: value.format, assets } };
};

const errorText = (
  error: Exclude<EsbuildBundleError | NodeSeaCandidateError, { readonly _tag: "NodeSeaFailed" }>,
): string => {
  switch (error._tag) {
    case "BundleMaterializationFailed":
    case "NodeSeaPreparationFailed":
      return `${error._tag} (${error.operation} ${error.path}): ${error.reason}`;
    case "EsbuildFailed":
      return `${error._tag}: ${JSON.stringify(error.diagnostics)}`;
    case "InvalidBundleInput":
    case "JavaScriptBundleInvalid":
    case "InvalidNodeSeaInput":
    case "NodeSeaSpawnFailed":
      return `${error._tag}: ${error.reason}`;
  }
};

export const executionFailed = (
  error: EsbuildBundleError | NodeSeaCandidateError,
): Core.BuildError.ToolFailed => {
  if (error._tag === "NodeSeaFailed") {
    return new Core.BuildError.ToolFailed({
      tool: "node-sea",
      exitCode: error.exitCode,
      diagnostics: [...error.diagnostics],
    });
  }
  return new Core.BuildError.ToolFailed({
    tool: "node-sea",
    exitCode: 1,
    diagnostics: [{
      channel: "stderr",
      text: errorText(error),
      truncated: error._tag === "EsbuildFailed" ? error.truncated : false,
    }],
  });
};

const layerError = (
  error: EsbuildVersionMismatch | NodeSeaLayerError,
): Provider.ToolNotFound | Provider.ToolProbeFailed =>
  error._tag === "NodeSeaToolNotFound"
    ? new Core.BuildError.ToolNotFound({ tool: "node-sea", command: error.command })
    : new Core.BuildError.ToolProbeFailed({
      tool: "node-sea",
      reason: error._tag === "EsbuildVersionMismatch"
        ? `expected esbuild ${error.expected}, observed ${error.observed}`
        : error.reason,
    });

export const targetTokens = { "linux-x64-gnu": "linux-x64-gnu" } as const satisfies Readonly<
  Record<Provider.TargetFor<"node-sea">, string>
>;

export const definition = {
  kind: "composed",
  defaultTarget: "linux-x64-gnu",
  targetTokens,
  validateOptions,
  makeProducer: (options: Provider.LayerOptions, execute: Provider.ExecuteCommand) =>
    Effect.gen(function*() {
      const esbuild = yield* makeLiveEsbuildService;
      const nodeSea = yield* makeLiveNodeSeaService(options, execute);
      return {
        produceCandidate: (input: Provider.ComposedCandidateInput<ValidatedOptions, "linux-x64-gnu">) =>
          esbuild.withJavaScriptBundle(
            {
              entrypoint: input.entrypoint,
              format: input.options.format,
              ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
            },
            (main) =>
              nodeSea.produceCandidate({
                main,
                stagedOutfile: input.stagedOutfile,
                resolvedDestination: input.resolvedDestination,
                ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
                ...(input.options.assets.length === 0
                  ? {}
                  : { assets: input.options.assets.map(({ key, path }) => ({ key, path })) }),
              }),
          ).pipe(Effect.mapError(executionFailed)),
      };
    }).pipe(Effect.mapError(layerError)),
} as const;
