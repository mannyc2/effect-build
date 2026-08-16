import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, markerValue, runRequired, sourceSha } from "./probe-runtime.mjs";

const result = markerValue((await runRequired(process.execPath, ["research/post-0.3/independent-versioning.mjs"], {
  timeout: 600_000,
})).stdout, "EFFECT_BUILD_VERSIONING_RECEIPT");
conclusion(result.compatible.installed === true, "compatible provider/core mock graph did not install");
conclusion(result.incompatible.rejectedByPeerRange === true, "incompatible provider/core mock graph unexpectedly installed");
await writeReceipt({
  id: "independent-versioning",
  sourceSha,
  claims: [{ id: "provider-core-skew", classification: "established", conclusion: "bounded-peer-range-allows-compatible-core-and-rejects-incompatible-core", assertions: [assertion("compatible-peer-install"), assertion("incompatible-peer-rejection")] }],
  evidence: result,
});
