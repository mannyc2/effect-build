import { Effect } from "effect";
import {
  NodeMainExecutable,
  NodeMainExecutableProtocol,
  NodeMainProgram,
  NodeMainProgramProtocol,
  NodeSourceExecutableProtocol,
  ProfileProtocolUnsupported,
  type NodeExecutableArtifact,
  type NodeSourceExecutableError,
  type NodeSourceExecutableRequest,
} from "./contracts.js";

export const nodeSourceExecutable = (
  request: NodeSourceExecutableRequest,
): Effect.Effect<
  NodeExecutableArtifact,
  NodeSourceExecutableError,
  NodeMainProgram | NodeMainExecutable
> => {
  if (request.protocol !== NodeSourceExecutableProtocol) {
    return Effect.fail(new ProfileProtocolUnsupported(
      "effect-build",
      "NodeSourceExecutable",
      request.protocol,
      [NodeSourceExecutableProtocol],
    ));
  }
  return NodeMainExecutable.use((assembler) =>
    Effect.flatMap(
      assembler.plan(NodeMainExecutableProtocol, request.executable),
      (assemblerPlan) => NodeMainProgram.use((producer) =>
        Effect.flatMap(
          producer.plan(NodeMainProgramProtocol, request.source, assemblerPlan.target),
          (producerPlan) => producerPlan.withMain((main) => assemblerPlan.assemble(main)),
        )
      ),
    )
  );
};
