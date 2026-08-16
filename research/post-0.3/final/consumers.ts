import { Effect } from "effect";
import {
  type NodeExecutableArtifact,
  type NodeMain,
  NodeMainExecutable,
  NodeMainExecutableProtocol,
  type NodeMainExecutableRequest,
  NodeMainProgram,
  NodeMainProgramProtocol,
  type NodeMainProgramRequest,
  type NodeSourceExecutableRequest,
  type NodeTarget,
} from "./contracts.js";
import { nodeSourceExecutable } from "./recipe.js";

export const consumeNodeMainProgram = (
  request: NodeMainProgramRequest,
  target: NodeTarget,
): Effect.Effect<
  {
    readonly format: NodeMain["format"];
    readonly imports: NodeMain["imports"];
    readonly identity: NodeMain["identity"];
    readonly provider: NodeMain["producer"];
    readonly leaseTag: "File" | "Bytes";
  },
  unknown,
  NodeMainProgram
> =>
  NodeMainProgram.use((service) =>
    Effect.flatMap(
      service.plan(NodeMainProgramProtocol, request, target),
      (plan) =>
        plan.withMain((main) =>
          Effect.scoped(Effect.map(main.acquire, (lease) => ({
            format: main.format,
            imports: main.imports,
            identity: main.identity,
            provider: main.producer,
            leaseTag: lease._tag,
          })))
        ),
    )
  );

export const consumeNodeMainExecutable = (
  main: NodeMain,
  request: NodeMainExecutableRequest,
): Effect.Effect<NodeExecutableArtifact, unknown, NodeMainExecutable> =>
  NodeMainExecutable.use((service) =>
    Effect.flatMap(
      service.plan(NodeMainExecutableProtocol, request),
      (plan) => plan.assemble(main),
    )
  );

export const consumeNodeSourceExecutable = (
  request: NodeSourceExecutableRequest,
): ReturnType<typeof nodeSourceExecutable> => nodeSourceExecutable(request);
