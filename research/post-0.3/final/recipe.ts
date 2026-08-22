import { Effect } from "effect";
import {
  type NodeExecutableArtifact,
  NodeMainExecutable,
  NodeMainExecutableProtocol,
  NodeMainProgram,
  NodeMainProgramProtocol,
  type NodeSourceExecutableError,
  NodeSourceExecutableProtocol,
  type NodeSourceExecutableRequest,
  ProfileProtocolUnsupported,
} from "./contracts.js";

export const nodeSourceExecutable = (
  request: NodeSourceExecutableRequest,
): Effect.Effect<
  NodeExecutableArtifact,
  NodeSourceExecutableError,
  NodeMainProgram | NodeMainExecutable
> => {
  if (request.protocol !== NodeSourceExecutableProtocol) {
    return Effect.fail(
      new ProfileProtocolUnsupported(
        "effect-build",
        "NodeSourceExecutable",
        request.protocol,
        [NodeSourceExecutableProtocol],
      ),
    );
  }
  return NodeMainExecutable.use((assembler) =>
    Effect.flatMap(
      assembler.plan(NodeMainExecutableProtocol, request.executable),
      (assemblerPlan) =>
        NodeMainProgram.use((producer) =>
          Effect.flatMap(
            producer.plan(NodeMainProgramProtocol, request.source, assemblerPlan.target),
            (producerPlan) => producerPlan.withMain((main) => assemblerPlan.assemble(main)),
          )
        ),
    )
  );
};
