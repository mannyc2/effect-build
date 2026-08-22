import { Effect, Layer } from "effect";
import * as BunProvider from "effect-build-bun";
import * as EsbuildProvider from "effect-build-esbuild";
import { readFile } from "node:fs/promises";
import {
  type BuildStepObservation,
  type ContentIdentity,
  type NodeMain,
  NodeMainChanged,
  NodeMainProductionFailed,
  NodeMainProgram,
  NodeMainProgramProtocol,
  type NodeMainProgramRequest,
  type NodeMainProgramService,
  type NodeTarget,
  NodeTargetUnsupported,
  type ProfileAdapterObservation,
  ProfileProtocolUnsupported,
} from "./contracts.js";
import { checkNodeSyntax, identityOf, makeBorrowedNodeMain } from "./node-main.js";

const supportedNodeVersions = ["25.5.0", "26.7.0"];

const bunObservation: ProfileAdapterObservation = {
  providerPackage: "effect-build-bun",
  providerPackageVersion: "0.3.0",
  profile: "NodeMainProgram",
  profileProtocol: NodeMainProgramProtocol,
  adapterProtocol: "effect-build-bun/NodeMainProgramAdapter@2",
};

const esbuildObservation: ProfileAdapterObservation = {
  providerPackage: "effect-build-esbuild",
  providerPackageVersion: "0.3.0",
  profile: "NodeMainProgram",
  profileProtocol: NodeMainProgramProtocol,
  adapterProtocol: "effect-build-esbuild/NodeMainProgramAdapter@2",
};

const readBundle = (
  path: string,
  expected: ContentIdentity,
  providerPackage: string,
): Effect.Effect<Uint8Array, NodeMainProductionFailed> =>
  Effect.tryPromise({
    try: async () => Uint8Array.from(await readFile(path)),
    catch: (error) =>
      new NodeMainProductionFailed(
        providerPackage,
        "failed to read the produced Node main",
        error,
      ),
  }).pipe(
    Effect.flatMap((bytes) => {
      const observed = identityOf(bytes);
      return observed.digest === expected.digest && observed.bytes === expected.bytes
        ? Effect.succeed(bytes)
        : Effect.fail(
          new NodeMainProductionFailed(
            providerPackage,
            "produced Node main changed before canonicalization",
            new NodeMainChanged(expected, observed),
          ),
        );
    }),
  );

const normalizeSteps = (
  stages: readonly {
    readonly operation: string;
    readonly tool: { readonly name: string; readonly version: string; readonly path?: string };
  }[],
): readonly BuildStepObservation[] =>
  stages.map((stage) => ({
    operation: stage.operation,
    tool: {
      name: stage.tool.name,
      version: stage.tool.version,
      ...(stage.tool.path === undefined ? {} : { path: stage.tool.path }),
      compatibility: "matrix-tested",
    },
  }));

const validatePlan = (
  observation: ProfileAdapterObservation,
  consumerProtocol: string,
  target: NodeTarget,
): Effect.Effect<void, ProfileProtocolUnsupported | NodeTargetUnsupported> => {
  if (consumerProtocol !== NodeMainProgramProtocol) {
    return Effect.fail(
      new ProfileProtocolUnsupported(
        observation.providerPackage,
        "NodeMainProgram",
        consumerProtocol,
        [NodeMainProgramProtocol],
      ),
    );
  }
  if (!supportedNodeVersions.includes(target.version)) {
    return Effect.fail(
      new NodeTargetUnsupported(
        observation.providerPackage,
        target.version,
        supportedNodeVersions,
      ),
    );
  }
  return Effect.void;
};

const bunPlan = (
  compiler: BunProvider.Service,
  request: NodeMainProgramRequest,
  target: NodeTarget,
) => ({
  target,
  provider: bunObservation,
  withMain: <A, E, R>(
    use: (main: NodeMain) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, NodeMainProductionFailed | E, R> =>
    Effect.gen(function*() {
      const exit = yield* compiler.withJavaScriptBundle(
        {
          entrypoint: request.entrypoint,
          format: request.format,
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        },
        (artifact) =>
          Effect.gen(function*() {
            const expected: ContentIdentity = {
              algorithm: "sha256",
              digest: artifact.digest,
              bytes: artifact.bytes,
            };
            const bytes = yield* readBundle(artifact.path, expected, bunObservation.providerPackage);
            yield* checkNodeSyntax(target, request.format, bytes);
            const capability = makeBorrowedNodeMain({
              path: artifact.path,
              format: request.format,
              transport: request.transport,
              target,
              providerObservedImports: artifact.observedExternalImports,
              producer: bunObservation,
              steps: normalizeSteps(artifact.stages),
              expectedIdentity: expected,
            }, bytes);
            return yield* Effect.exit(
              use(capability.main).pipe(
                Effect.ensuring(Effect.sync(capability.expire)),
              ),
            );
          }),
      ).pipe(
        Effect.mapError((error) =>
          error instanceof NodeMainProductionFailed
            ? error
            : new NodeMainProductionFailed(bunObservation.providerPackage, "Bun Node main production failed", error)
        ),
      );
      return yield* exit;
    }),
});

const makeBunServiceFinal = (
  compiler: BunProvider.Service,
): NodeMainProgramService<NodeMainProductionFailed> => ({
  protocol: NodeMainProgramProtocol,
  supportedProtocols: [NodeMainProgramProtocol],
  provider: bunObservation,
  plan: (consumerProtocol, request, target) =>
    Effect.as(validatePlan(bunObservation, consumerProtocol, target), bunPlan(compiler, request, target)),
});

const esbuildPlan = (
  service: EsbuildProvider.Service,
  request: NodeMainProgramRequest,
  target: NodeTarget,
) => ({
  target,
  provider: esbuildObservation,
  withMain: <A, E, R>(
    use: (main: NodeMain) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, NodeMainProductionFailed | E, R> =>
    Effect.gen(function*() {
      const exit = yield* service.withJavaScriptBundle(
        {
          entrypoint: request.entrypoint,
          format: request.format,
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        },
        (artifact) =>
          Effect.gen(function*() {
            const expected: ContentIdentity = {
              algorithm: "sha256",
              digest: artifact.digest,
              bytes: artifact.bytes,
            };
            const bytes = yield* readBundle(artifact.path, expected, esbuildObservation.providerPackage);
            yield* checkNodeSyntax(target, request.format, bytes);
            const capability = makeBorrowedNodeMain({
              path: artifact.path,
              format: request.format,
              transport: request.transport,
              target,
              providerObservedImports: artifact.observedExternalImports,
              producer: esbuildObservation,
              steps: normalizeSteps(artifact.stages),
              expectedIdentity: expected,
            }, bytes);
            return yield* Effect.exit(
              use(capability.main).pipe(
                Effect.ensuring(Effect.sync(capability.expire)),
              ),
            );
          }),
      ).pipe(
        Effect.mapError((error) =>
          error instanceof NodeMainProductionFailed
            ? error
            : new NodeMainProductionFailed(
              esbuildObservation.providerPackage,
              "Esbuild Node main production failed",
              error,
            )
        ),
      );
      return yield* exit;
    }),
});

const makeEsbuildService = (
  service: EsbuildProvider.Service,
): NodeMainProgramService<NodeMainProductionFailed> => ({
  protocol: NodeMainProgramProtocol,
  supportedProtocols: [NodeMainProgramProtocol],
  provider: esbuildObservation,
  plan: (consumerProtocol, request, target) =>
    Effect.as(validatePlan(esbuildObservation, consumerProtocol, target), esbuildPlan(service, request, target)),
});

export const bunNodeMainProgramLayer: Layer.Layer<NodeMainProgram, never, BunProvider.Compiler> = Layer.effect(
  NodeMainProgram,
  BunProvider.Compiler.use((compiler) => Effect.succeed(makeBunServiceFinal(compiler))),
);

export const esbuildNodeMainProgramLayer: Layer.Layer<NodeMainProgram, never, EsbuildProvider.Esbuild> = Layer.effect(
  NodeMainProgram,
  EsbuildProvider.Esbuild.use((service) => Effect.succeed(makeEsbuildService(service))),
);
