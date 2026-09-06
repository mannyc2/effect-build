import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { run } from "./Cli.ts";

// The application owns its runtime boundary. The report program remains an
// Effect whose filesystem and CLI services are supplied at composition time.
run.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
