import { Effect } from "effect";
import { Build } from "effect-build-esbuild/Api";

const program = Build.build({ entryPoints: ["src/main.ts"], bundle: true, write: false });

await Effect.runPromise(program);
