import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, markerValue, requiredPath, runRequired, sourceSha } from "./probe-runtime.mjs";

const node26 = await requiredPath("EFFECT_BUILD_NODE_26_BIN");
const external = await requiredPath("RESEARCH_EXTERNAL_NODE_MODULES");
const result = markerValue((await runRequired(node26, ["research/post-0.3/external-provider-probe.mjs"], {
  env: { RESEARCH_EXTERNAL_NODE_MODULES: external, EFFECT_BUILD_NODE_SEA_BIN: node26 },
  timeout: 600_000,
})).stdout, "EFFECT_BUILD_EXTERNAL_RESEARCH_RECEIPT");
conclusion(result.nodeMainExecutable.nodeSeaConforms === true, "Node SEA adapter stopped conforming");
conclusion(result.nodeMainExecutable.pkgConforms === true, "pkg adapter stopped conforming or was unavailable");
conclusion(result.incrementalNodeMain.esbuildConforms === true, "Esbuild incremental adapter stopped conforming");
conclusion(result.incrementalNodeMain.rolldownConforms === true, "Rolldown incremental adapter stopped conforming or was unavailable");
await writeReceipt({
  id: "external-provider-research",
  sourceSha,
  claims: [
    { id: "node-main-executable", classification: "established", conclusion: "node-sea-and-pkg-produced-equivalent-node-main-executables", assertions: [assertion("node-sea-ran"), assertion("pkg-ran"), assertion("application-result-equal")] },
    { id: "incremental-node-main", classification: "sequenced", conclusion: "esbuild-and-rolldown-conform-but-rolldown-is-not-a-0.4-product-package", assertions: [assertion("esbuild-context-rebuilt"), assertion("rolldown-build-regenerated"), assertion("release-enforced")] },
  ],
  evidence: result,
});
