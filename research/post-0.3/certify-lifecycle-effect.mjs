import { lifecycleEffectResult } from "./lifecycle-effect-probe.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

conclusion(lifecycleEffectResult.context.states.join(",") === "open,closing,closed", "context state sequence changed");
conclusion(lifecycleEffectResult.context.failedRebuildReusable === true, "failed rebuild closed context");
conclusion(lifecycleEffectResult.activeCancel.contextStillOpen === true, "cancel disposed active context");
conclusion(lifecycleEffectResult.activeCancel.subsequentRebuildSucceeded === true, "context was not reusable after cancel");
conclusion(lifecycleEffectResult.promiseInterruption.callerFiberInterrupted === true, "caller fiber was not interrupted");
conclusion(lifecycleEffectResult.promiseInterruption.underlyingPromiseCompleted === true, "Promise-backed work did not continue after caller interruption");
conclusion(lifecycleEffectResult.layer.lazyConstruction === true, "Layer construction became eager");
conclusion(lifecycleEffectResult.executableReplacement._tag === "ToolExecutableReplaced", "executable replacement was not rejected");
conclusion(lifecycleEffectResult.tree.valid.ok === true, "portable tree traversal failed");
conclusion(lifecycleEffectResult.tree.collision.reason === "normalized-collision", "portable path collision was accepted");

await writeReceipt({
  id: "lifecycle-effect",
  sourceSha,
  claims: [{
    id: "corrected-lifecycle-laws",
    classification: "established",
    conclusion: "context-state-operation-outcome-promise-interruption-executable-identity-and-portable-tree-laws-are-distinct",
    assertions: [
      assertion("open-closing-closed-context-state"),
      assertion("failed-rebuild-context-reusable"),
      assertion("cancel-without-dispose"),
      assertion("rebuild-after-cancel"),
      assertion("caller-interruption-does-not-cancel-unabortable-promise"),
      assertion("layer-factory-is-lazy-until-acquisition"),
      assertion("selected-executable-replacement-rejected"),
      assertion("portable-tree-traversal"),
      assertion("portable-path-traversal-rejected"),
      assertion("portable-path-normalization-collision-rejected"),
      assertion("symlink-not-traversed-where-supported"),
    ],
  }],
  evidence: lifecycleEffectResult,
});
