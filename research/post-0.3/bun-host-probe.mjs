import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const root = await mkdtemp(join(tmpdir(), "effect-build-bun-host-research-"));
const receipt = { runtime: Bun.version };

try {
  const entrypoint = join(root, "main.ts");
  const executable = join(root, "compiled-bun");
  const largeLiteral = "x".repeat(8 * 1024 * 1024);
  await writeFile(entrypoint, `const payload = ${JSON.stringify(largeLiteral)}; console.log(payload.length);\n`);

  let settled = false;
  let observedBeforeSettlement = false;
  const compile = Bun.build({
    entrypoints: [entrypoint],
    compile: { outfile: executable },
  }).finally(() => {
    settled = true;
  });
  while (!settled) {
    try {
      const information = await stat(executable);
      if (information.isFile()) {
        observedBeforeSettlement = true;
        break;
      }
    } catch {
      // Output not written yet.
    }
    await sleep(1);
  }
  const compileResult = await compile;
  const executableInformation = await stat(executable);
  receipt.compile = {
    success: compileResult.success,
    logs: compileResult.logs.map((log) => String(log)),
    outputs: compileResult.outputs.map((output) => ({ path: output.path, size: output.size, kind: output.kind })),
    outputExistsAfterPromise: executableInformation.isFile(),
    outputObservedBeforePromiseSettlement: observedBeforeSettlement,
    cancellationHandle: false,
  };

  const web = join(root, "web");
  const outdir = join(root, "web-dist");
  await mkdir(web, { recursive: true });
  await writeFile(
    join(web, "index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><script type="module" src="./app.ts"></script></body></html>\n',
  );
  await writeFile(join(web, "app.ts"), 'document.body.textContent = "bun-host-api";\n');
  await writeFile(join(web, "style.css"), "body { color: black; }\n");
  const build = await Bun.build({ entrypoints: [join(web, "index.html")], outdir, target: "browser", splitting: true });
  receipt.browser = {
    success: build.success,
    logs: build.logs.map((log) => String(log)),
    outputs: build.outputs.map((output) => ({ path: output.path, size: output.size, kind: output.kind })),
    writtenEntries: (await readdir(outdir)).sort(),
  };

  console.log(`EFFECT_BUILD_BUN_HOST_RECEIPT=${JSON.stringify(receipt)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
