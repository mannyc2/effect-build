import { Effect } from "effect";
import { NodeSea } from "effect-build-node-sea";

/** The entry point supplies NodeSea.layer and its chosen platform services. */
export const assemble = Effect.fn("Example.assemble")(function*(main: string, outfile: string) {
  const sea = yield* NodeSea;
  return yield* sea.assemble({ main, outfile, atomic: true });
});
