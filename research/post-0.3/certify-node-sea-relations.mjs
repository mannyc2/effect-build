import { nodeMainCanonResult } from "./node-main-canon-probe.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, markerValue, requiredPath, runRequired, sourceSha } from "./probe-runtime.mjs";

const result = markerValue((await runRequired(process.execPath, ["research/post-0.3/node-sea-version-probe.mjs"], {
  env: {
    EFFECT_BUILD_NODE_OLD_BIN: await requiredPath("EFFECT_BUILD_NODE_25_BIN"),
    EFFECT_BUILD_NODE_CURRENT_BIN: await requiredPath("EFFECT_BUILD_NODE_26_BIN"),
  },
  timeout: 600_000,
})).stdout, "EFFECT_BUILD_NODE_SEA_VERSION_RECEIPT");
conclusion(result.oldest.buildSucceeded === true && result.oldest.execution.succeeded === true, "matching Node 25 SEA did not build and run");
conclusion(result.current.buildSucceeded === true && result.current.execution.succeeded === true, "matching Node 26 SEA did not build and run");
conclusion(result.mismatchedBuilderAndTarget.buildSucceeded === true, "Node mismatch was rejected before demonstrating the intended upstream falsifier");
conclusion(result.mismatchedBuilderAndTarget.execution.succeeded === false, "mismatched Node SEA unexpectedly ran");
conclusion(nodeMainCanonResult.matrix.length === 16, "canonical Node-main matrix did not cover every provider/format/Node/acquisition cell");
conclusion(nodeMainCanonResult.externalRejections.length === 4, "canonical Node-main external-import matrix was incomplete");
conclusion(nodeMainCanonResult.mutation.borrowed._tag === "NodeMainIdentityMismatch", "borrowed mutation was not rejected");
conclusion(nodeMainCanonResult.mutation.capturedBytesAssembled === true, "captured bytes did not assemble after source mutation");
conclusion(nodeMainCanonResult.targetMismatch._tag === "NodeTargetMismatch", "canonical target mismatch was not rejected");
conclusion(nodeMainCanonResult.interruption.beforeCommit._tag === "PublicationInterruptedBeforeCommit", "before-commit interruption law changed");
conclusion(nodeMainCanonResult.interruption.afterCommit._tag === "PublicationInterruptedAfterCommit", "after-commit interruption law changed");
await writeReceipt({
  id: "node-sea-relations",
  sourceSha,
  claims: [
    {
      id: "same-version-node-sea",
      classification: "established",
      conclusion: "node-25.5.0-and-26.7.0-build-and-run-with-matching-base",
      assertions: [
        assertion("node-25-match"),
        assertion("node-26-match"),
        assertion("bun-and-esbuild-esm-and-commonjs"),
        assertion("file-and-bytes-acquisition-across-domain"),
        assertion("builtin-dynamic-json-and-top-level-await"),
        assertion("producer-and-assembler-observations-concatenated"),
      ],
    },
    {
      id: "mismatched-node-sea",
      classification: "falsified",
      conclusion: "node-26-builder-accepts-node-25-base-but-produced-executable-does-not-run",
      assertions: [
        assertion("builder-accepted-mismatch"),
        assertion("mismatched-output-execution-failed"),
        assertion("portable-recipe-rejects-target-mismatch-before-mutation"),
        assertion("portable-recipe-rejects-inadmissible-externals"),
        assertion("portable-recipe-authenticates-borrowed-main"),
        assertion("publication-interruption-classifies-commit-state"),
      ],
    },
  ],
  evidence: { upstream: result, canonical: nodeMainCanonResult },
});
