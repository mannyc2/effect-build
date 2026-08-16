import { browserBehaviorResult } from "./browser-behavior-probe.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, markerValue, requiredPath, runRequired, sourceSha } from "./probe-runtime.mjs";

const result = markerValue((await runRequired(process.execPath, ["research/post-0.3/version-boundary-probe.mjs"], {
  env: {
    EFFECT_BUILD_BUN_BIN: await requiredPath("EFFECT_BUILD_BUN_BIN"),
    EFFECT_BUILD_BUN_CURRENT_BIN: await requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN"),
    EFFECT_BUILD_DENO_BIN: await requiredPath("EFFECT_BUILD_DENO_BIN"),
    EFFECT_BUILD_DENO_CURRENT_BIN: await requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN"),
    RESEARCH_EXTERNAL_NODE_MODULES: await requiredPath("RESEARCH_EXTERNAL_NODE_MODULES"),
  },
})).stdout, "EFFECT_BUILD_VERSION_BOUNDARY_RECEIPT");
conclusion(result.bun.map((item) => item.version).join(",") === "1.3.9,1.3.14", "Bun boundary set changed");
conclusion(result.deno.every((item) => item.buildSucceeded === true), "a Deno command boundary failed");
conclusion(result.esbuild.map((item) => item.version).join(",") === "0.28.1,0.28.2", "Esbuild boundary set changed");
for (const item of [...result.bun, ...result.deno]) conclusion(item.buildSucceeded === true, `${item.label} command build failed`);
for (const item of result.esbuild) conclusion(item.build === true && item.context === true && item.cancel === true && item.dispose === true, `Esbuild ${item.version} capability probe failed`);
conclusion(browserBehaviorResult.role === "BrowserModuleApplication", "browser behavior no longer supports the application role");
conclusion(browserBehaviorResult.nativeTopLevelResourcePortability === "falsified", "native top-level resource falsifier changed");
conclusion(browserBehaviorResult.adapterNormalizedApplicationSemantics === "established", "browser adapter normalization failed");
await writeReceipt({
  id: "version-boundaries",
  sourceSha,
  claims: [{
    id: "provider-version-boundaries",
    classification: "established",
    conclusion: "advertised-command-and-api-capabilities-exist-at-each-exercised-boundary",
    assertions: [
      assertion("bun-1.3.9-and-1.3.14"),
      assertion("deno-2.9.3-and-2.9.5"),
      assertion("esbuild-0.28.1-and-0.28.2"),
      assertion("headless-browser-all-provider-boundaries"),
      assertion("native-top-level-resource-falsifier"),
      assertion("adapter-normalized-application-semantics"),
    ],
  }],
  evidence: { versions: result, browser: browserBehaviorResult },
});
