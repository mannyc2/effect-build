import { conclusion, writeReceipt } from "./receipt.mjs";
import { isSelfContainedDeclarationOutput } from "./declaration-classifier.mjs";
import { assertion, markerValue, requiredPath, runRequired, sourceSha } from "./probe-runtime.mjs";

const bun = await requiredPath("EFFECT_BUILD_BUN_BIN");
const deno = await requiredPath("EFFECT_BUILD_DENO_BIN");
const denoCurrent = await requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN");
const external = await requiredPath("RESEARCH_EXTERNAL_NODE_MODULES");
const result = markerValue((await runRequired(process.execPath, ["research/post-0.3/profile-refinement-probe.mjs"], {
  env: {
    EFFECT_BUILD_BUN_BIN: bun,
    EFFECT_BUILD_DENO_BIN: deno,
    EFFECT_BUILD_DENO_CURRENT_BIN: denoCurrent,
    RESEARCH_EXTERNAL_NODE_MODULES: external,
  },
})).stdout, "EFFECT_BUILD_PROFILE_REFINEMENT_RECEIPT");
conclusion(result.browser.browserModuleOutputSet.conforms === true, "browser module output set no longer conforms");
conclusion(result.browser.htmlApplicationWithModuleOwnedCss.conforms === true, "HTML module graph application no longer conforms");
conclusion(isSelfContainedDeclarationOutput(result.declarations.selectedDeno) === false, "Deno 2.9.3 declaration rollup unexpectedly became self-contained");
conclusion(isSelfContainedDeclarationOutput(result.declarations.currentDeno) === false, "Deno 2.9.5 declaration rollup unexpectedly became self-contained");
conclusion(isSelfContainedDeclarationOutput(result.declarations.rolldown) === true, "Rolldown declaration rollup did not classify as self-contained");
await writeReceipt({
  id: "profile-refinement",
  sourceSha,
  claims: [
    { id: "browser-module-output-set", classification: "established", conclusion: "bun-and-deno-preserve-module-reachable-javascript-and-css", assertions: [assertion("bun-output-set"), assertion("deno-output-set")] },
    { id: "html-module-graph-application", classification: "established", conclusion: "bun-and-deno-preserve-html-module-graph-applications", assertions: [assertion("bun-html-references-resolve"), assertion("deno-html-references-resolve")] },
    { id: "rolled-up-declaration-file", classification: "falsified", conclusion: "deno-output-has-unresolved-local-type-import-while-rolldown-is-self-contained", assertions: [assertion("deno-2.9.3-unresolved-import"), assertion("deno-2.9.5-unresolved-import"), assertion("rolldown-self-contained")] },
  ],
  evidence: result,
});
