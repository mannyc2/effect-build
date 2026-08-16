import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, markerValue, rawMarkerValue, requiredPath, runRequired, sourceSha } from "./probe-runtime.mjs";

const bunOldPath = await requiredPath("EFFECT_BUILD_BUN_BIN");
const bunCurrentPath = await requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN");
const denoOldPath = await requiredPath("EFFECT_BUILD_DENO_BIN");
const denoCurrentPath = await requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN");
const bunHost = async (executable) => markerValue(
  (await runRequired(executable, ["research/post-0.3/bun-host-probe.mjs"])).stdout,
  "EFFECT_BUILD_BUN_HOST_RECEIPT",
);
const bunOld = await bunHost(bunOldPath);
const bunCurrent = await bunHost(bunCurrentPath);
conclusion(bunOld.runtime === "1.3.9" && bunCurrent.runtime === "1.3.14", "Bun host boundary versions changed");
for (const result of [bunOld, bunCurrent]) {
  conclusion(result.compile.success === true && result.browser.success === true, `Bun ${result.runtime} host API failed`);
  conclusion(result.compile.cancellationHandle === false, `Bun ${result.runtime} unexpectedly exposed one-shot cancellation`);
}

const denoHost = async (executable, version) => {
  const root = await mkdtemp(join(tmpdir(), `effect-build-deno-host-${version}-`));
  try {
    await mkdir(join(root, "out"), { recursive: true });
    await writeFile(join(root, "main.ts"), 'export const value: string = "deno-host";\n');
    const success = markerValue((await runRequired(executable, [
      "run", "--unstable-bundle", `--allow-read=${root}`, `--allow-write=${join(root, "out")}`,
      "research/post-0.3/deno-host-probe.ts", "success", join(root, "main.ts"), join(root, "out"),
    ])).stdout, "EFFECT_BUILD_DENO_HOST_RECEIPT");
    const readWithoutGrant = rawMarkerValue((await runRequired(executable, [
      "run", "--unstable-bundle", "research/post-0.3/deno-host-probe.ts", "permission", join(root, "main.ts"),
    ])).stdout, "EFFECT_BUILD_DENO_PERMISSION_RECEIPT");
    const writeWithoutGrant = rawMarkerValue((await runRequired(executable, [
      "run", "--unstable-bundle", "research/post-0.3/deno-write-permission-probe.ts", join(root, "main.ts"), join(root, "denied.js"),
    ])).stdout, "EFFECT_BUILD_DENO_WRITE_PERMISSION_RECEIPT");
    return { success, readWithoutGrant, writeWithoutGrant };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
const denoOld = await denoHost(denoOldPath, "2.9.3");
const denoCurrent = await denoHost(denoCurrentPath, "2.9.5");
conclusion(denoOld.success.runtime === "2.9.3" && denoCurrent.success.runtime === "2.9.5", "Deno host boundary versions changed");
for (const result of [denoOld, denoCurrent]) {
  conclusion(result.success.memory.success === true && result.success.written.success === true, "Deno.bundle host operation failed");
  conclusion(result.success.cancellationHandle === false, "Deno.bundle unexpectedly exposed one-shot cancellation");
  conclusion(result.readWithoutGrant === "unexpected-success", "Deno local read without grant no longer reproduces the documented contradiction");
  conclusion(result.writeWithoutGrant === "unexpected-success", "Deno local write without grant no longer reproduces the documented contradiction");
}
await writeReceipt({
  id: "host-api-boundaries",
  sourceSha,
  claims: [
    { id: "bun-host-boundaries", classification: "established", conclusion: "bun-host-api-shape-reproduced-at-1.3.9-and-1.3.14", assertions: [assertion("oldest-host-executed"), assertion("current-host-executed"), assertion("one-shot-no-cancel-handle")] },
    { id: "deno-host-boundaries", classification: "established", conclusion: "deno-host-api-shape-reproduced-at-2.9.3-and-2.9.5", assertions: [assertion("oldest-host-executed"), assertion("current-host-executed"), assertion("memory-and-write-modes")] },
    { id: "deno-permission-comments", classification: "falsified", conclusion: "local-read-and-write-succeeded-without-explicit-grants", assertions: [assertion("read-without-grant"), assertion("write-without-grant"), assertion("both-version-boundaries")] },
  ],
  evidence: { bun: { oldest: bunOld, current: bunCurrent }, deno: { oldest: denoOld, current: denoCurrent } },
});
