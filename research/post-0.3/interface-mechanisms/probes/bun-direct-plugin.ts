import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "effect-build-bun-direct-plugin-"));
let resolveCalls = 0;
let loadCalls = 0;

try {
  const entrypoint = join(root, "entry.ts");
  await writeFile(entrypoint, 'import value from "research:virtual"; console.log(value);\n');
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "bun",
    write: false,
    plugins: [{
      name: "research-callback",
      setup(build) {
        build.onResolve({ filter: /^research:virtual$/ }, (args) => {
          resolveCalls += 1;
          return { path: args.path, namespace: "research" };
        });
        build.onLoad({ filter: /.*/, namespace: "research" }, () => {
          loadCalls += 1;
          return { contents: 'export default "callback-ran";', loader: "js" };
        });
      },
    }],
  });
  console.log(JSON.stringify({
    runtime: Bun.version,
    success: result.success,
    outputs: result.outputs.length,
    resolveCalls,
    loadCalls,
  }));
} finally {
  await rm(root, { recursive: true, force: true });
}
