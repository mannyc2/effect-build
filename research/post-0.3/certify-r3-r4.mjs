import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { conclusion, writeReceipt } from "./receipt.mjs";
import {
  assertion,
  markerValue,
  repository,
  runRequired,
  sourceSha,
} from "./probe-runtime.mjs";

const locateBun = async () => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? "bun.exe" : "bun");
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through explicit absolute PATH entries.
    }
  }
  throw new Error("Bun is unavailable for R3/R4 certification");
};

const bun = await locateBun();
const tsc = join(repository, "node_modules", "typescript", "bin", "tsc");
await access(tsc);

await runRequired(bun, [
  "test",
  "research/post-0.3/r3-provider-compatibility.test.ts",
  "research/post-0.3/r4-author-laws.test.mjs",
]);
await runRequired(process.execPath, [
  tsc,
  "--ignoreConfig",
  "--noEmit",
  "--strict",
  "--skipLibCheck",
  "--module",
  "NodeNext",
  "--moduleResolution",
  "NodeNext",
  "--target",
  "ESNext",
  "--lib",
  "ESNext,DOM",
  "research/post-0.3/author/Tool.ts",
  "research/post-0.3/author/BorrowedOutput.ts",
  "research/post-0.3/author/Executable.ts",
  "research/post-0.3/r3-compatibility.ts",
  "research/post-0.3/r3-provider-policies.ts",
]);

await writeReceipt({
  id: "r3-provider-compatibility",
  sourceSha,
  claims: [
    {
      id: "provider-owned-total-evaluator",
      classification: "established",
      conclusion: "provider-owned-policies-evaluate-complete-identities-coordinate-holes-capabilities-relations-peers-and-profiles-with-one-refusal",
      assertions: [
        assertion("complete-host-installed-and-command-identities"),
        assertion("operation-lane-host-target-holes"),
        assertion("capability-present-missing-and-indeterminate"),
        assertion("node-deno-esbuild-relations"),
        assertion("peer-and-composed-profile-contracts"),
        assertion("single-owner-reason-and-phase"),
      ],
    },
    {
      id: "launch-reauthentication-and-cache-authority",
      classification: "established",
      conclusion: "selected-command-full-content-is-reauthenticated-at-launch-and-cache-keys-cover-every-authority-input",
      assertions: [
        assertion("same-length-selected-command-replacement-rejected"),
        assertion("missing-launch-observation-rejected"),
        assertion("canonical-cache-key"),
        assertion("cache-key-sensitive-to-all-authority-components"),
        assertion("evaluation-timing-map"),
      ],
    },
    {
      id: "exact-untested-override-eligibility",
      classification: "established",
      conclusion: "only-unknown-support-after-all-non-policy-gates-may-become-an-observable-untested-override",
      assertions: [
        assertion("observed-evidence-does-not-self-admit"),
        assertion("reviewed-exact-admission"),
        assertion("support-unknown-is-the-only-eligible-refusal"),
        assertion("all-non-policy-refusals-remain-blocked"),
      ],
    },
  ],
  evidence: {
    test: "bun test research/post-0.3/r3-provider-compatibility.test.ts",
    assertions: 350,
    providerDecisionTables: [
      "bun/compile-executable/selected-command",
      "deno/compile-executable/selected-command",
      "esbuild/build-memory/installed-library-api",
      "esbuild/context-memory/installed-library-api",
      "node-sea/assemble-direct/selected-command",
    ],
  },
});

const { r4RuntimeResult } = await import("./r4-runtime-probe.mjs");
conclusion(r4RuntimeResult.child.directChildTerminatedAndReaped === true, "Effect child was not terminated and reaped");
conclusion(r4RuntimeResult.child.durableProviderDirectRemnants.partialBytes === 32 * 1024, "partial remnant evidence changed");
conclusion(r4RuntimeResult.esbuildOneShot.callerFiberInterrupted === true, "esbuild one-shot caller was not interrupted");
conclusion(r4RuntimeResult.esbuildOneShot.providerCompletedAfterInterruption === true, "esbuild one-shot provider did not continue");
conclusion(r4RuntimeResult.esbuildOneShot.delayedPluginCompleted === true, "esbuild one-shot delayed plugin did not complete");
conclusion(r4RuntimeResult.esbuild.activeCancel === "rejected", "esbuild active cancel changed");
conclusion(r4RuntimeResult.esbuild.rebuildAfterCancel === "fulfilled", "esbuild was not reusable after cancel");
conclusion(r4RuntimeResult.esbuild.postDispose === "rejected", "esbuild accepted work after dispose");
conclusion(r4RuntimeResult.esbuildContextRaces.concurrentRebuilds.coalesced === true, "esbuild concurrent rebuild coalescing changed");
conclusion(
  r4RuntimeResult.esbuildContextRaces.disposeDuringActiveRebuild.disposeResolvedBeforeActivePluginRelease === false,
  "esbuild dispose unexpectedly resolved before active plugin release",
);
conclusion(
  Object.values(r4RuntimeResult.esbuildContextRaces.postDispose).every((status) => status === "rejected"),
  "esbuild accepted a context method after dispose",
);
conclusion(
  r4RuntimeResult.esbuildContextRaces.delayedPluginCleanup.disposeResolvedBeforePluginCleanupRelease === true,
  "esbuild dispose unexpectedly awaited delayed plugin cleanup",
);
conclusion(
  r4RuntimeResult.esbuildContextRaces.delayedPluginCleanup.cleanupEventuallyFinished === true,
  "esbuild delayed plugin cleanup never finished",
);
conclusion(r4RuntimeResult.rolldown.concurrency.maxActive === 2, "Rolldown concurrency changed");
conclusion(r4RuntimeResult.rolldown.closeRace.methods.cancel === "undefined", "Rolldown unexpectedly exposed cancel");
conclusion(r4RuntimeResult.rolldown.closeRace.methods.dispose === "undefined", "Rolldown unexpectedly exposed dispose");
conclusion(r4RuntimeResult.rolldown.closeRace.methods.asyncDispose === "function", "Rolldown async dispose disappeared");
conclusion(r4RuntimeResult.rolldown.closeRace.closeResolvedWhileGenerateBlocked === true, "Rolldown close race changed");
conclusion(r4RuntimeResult.rolldown.closeRace.activeGenerateAfterClose === "fulfilled", "Rolldown close canceled active generation");
conclusion(r4RuntimeResult.rolldown.closeRace.postCloseMarker === "ALREADY_CLOSED", "Rolldown post-close refusal changed");

await writeReceipt({
  id: "r4-author-laws",
  sourceSha,
  claims: [
    {
      id: "exact-author-rent",
      classification: "established",
      conclusion: "exactly-tool-borrowed-output-and-executable-reduce-author-state-space-without-a-generic-handle",
      assertions: [
        assertion("exactly-three-author-modules"),
        assertion("no-node-imports-in-public-contracts"),
        assertion("no-effect-runner-in-public-contracts"),
        assertion("unhashed-variants-cannot-carry-optional-digests"),
        assertion("shared-canonical-decimal-byte-count"),
        assertion("shared-sha256-digest-grammar"),
      ],
    },
    {
      id: "borrowed-output-laws",
      classification: "established",
      conclusion: "close-drains-winning-acquisition-and-file-tree-observation-is-contained-mutation-sensitive-and-bounded",
      assertions: [
        assertion("acquire-close-race-has-one-winner"),
        assertion("close-rejects-new-observation"),
        assertion("file-and-tree-traversal-contained"),
        assertion("same-size-mutation-rejected"),
        assertion("symlink-and-traversal-rejected"),
        assertion("hashed-and-unhashed-streaming-bounded"),
      ],
    },
    {
      id: "executable-publication-laws",
      classification: "established",
      conclusion: "private-partial-candidates-never-replace-the-old-destination-and-native-publication-is-streamed-then-same-parent-committed",
      assertions: [
        assertion("private-same-parent-candidate"),
        assertion("provider-failure-removes-partial-candidate"),
        assertion("old-destination-survives-provider-failure"),
        assertion("native-format-inspected-before-commit"),
        assertion("hashed-and-unhashed-publication-streaming-bounded"),
        assertion("windows-lock-model-fails-closed"),
      ],
    },
    {
      id: "scoped-process-and-remnant-laws",
      classification: "established",
      conclusion: "effect-scope-termination-reaps-the-direct-child-and-provider-direct-complete-and-partial-remnants-remain-observable",
      assertions: [
        assertion("official-effect-child-process-command"),
        assertion("scope-interruption-terminates-and-reaps-direct-child"),
        assertion("unix-process-group-descendant-termination"),
        assertion("provider-direct-complete-remnant-durable"),
        assertion("provider-direct-partial-remnant-durable"),
      ],
    },
    {
      id: "provider-handle-laws",
      classification: "established",
      conclusion: "esbuild-cancel-dispose-and-rolldown-concurrent-generate-close-semantics-remain-provider-specific",
      assertions: [
        assertion("esbuild-cancel-rejects-active-build"),
        assertion("esbuild-cancel-does-not-dispose"),
        assertion("esbuild-post-dispose-rejected"),
        assertion("rolldown-concurrent-generates-overlap"),
        assertion("rolldown-has-close-and-async-dispose-but-no-cancel"),
        assertion("rolldown-close-does-not-drain-or-cancel-active-generate"),
        assertion("rolldown-post-close-rejected"),
      ],
    },
    {
      id: "esbuild-one-shot-interruption-law",
      classification: "established",
      conclusion: "effect-interruption-stops-waiting-while-esbuild-one-shot-provider-and-delayed-plugin-complete",
      assertions: [
        assertion("one-shot-effect-fiber-interrupted"),
        assertion("provider-promise-remained-active"),
        assertion("delayed-onload-released-after-interruption"),
        assertion("provider-onend-and-memory-output-observed"),
      ],
    },
    {
      id: "esbuild-context-lifecycle-matrix",
      classification: "established",
      conclusion: "esbuild-context-coalesces-rebuilds-drains-active-plugin-before-dispose-rejects-post-dispose-methods-and-does-not-await-delayed-plugin-cleanup",
      assertions: [
        assertion("concurrent-rebuilds-coalesced"),
        assertion("cancel-race-rejects-active-rebuild"),
        assertion("cancel-does-not-dispose-context"),
        assertion("dispose-waits-for-active-plugin"),
        assertion("post-dispose-rebuild-watch-and-serve-rejected"),
        assertion("dispose-resolves-before-delayed-plugin-cleanup"),
        assertion("delayed-plugin-cleanup-eventually-finishes"),
        assertion("dispose-idempotent"),
      ],
    },
  ],
  evidence: {
    test: "bun test research/post-0.3/r4-author-laws.test.mjs",
    assertions: 103,
    host: { platform: process.platform, architecture: process.arch },
    runtime: r4RuntimeResult,
  },
});

const adapterResult = markerValue(
  (await runRequired(process.execPath, ["research/post-0.3/external-author-adapter-probe.mjs"])).stdout,
  "EFFECT_BUILD_EXTERNAL_AUTHOR_ADAPTER",
);
conclusion(adapterResult.imports.length === 3, "external adapter imported outside the Author contracts");
conclusion(adapterResult.coreCopies.length === 2, "external adapter did not cross two compatible core copies");
conclusion(adapterResult.typecheck === "passed", "external adapter consumer did not typecheck");
conclusion(adapterResult.runtime.sameObjectAcrossCoreCopies === true, "external adapter depended on nominal core identity");

await writeReceipt({
  id: "r4-external-author-adapter",
  sourceSha,
  claims: [{
    id: "packed-public-contract-only-adapter",
    classification: "established",
    conclusion: "an-independent-packed-adapter-typechecks-and-runs-across-compatible-core-copies-using-only-the-three-author-contracts",
    assertions: [
      assertion("adapter-packed-independently"),
      assertion("only-public-author-subpaths-imported"),
      assertion("no-first-party-internal-import"),
      assertion("bounded-peer-range"),
      assertion("two-compatible-core-copies-installed"),
      assertion("consumer-typecheck-passed"),
      assertion("runtime-structure-crossed-core-copy-boundary"),
    ],
  }],
  evidence: adapterResult,
});
