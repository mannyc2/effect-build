import { dependencyAndOfflineResult } from "./dependency-and-offline-probe.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

conclusion(dependencyAndOfflineResult.esbuild.decision === "exact-provider-dependency", "Esbuild dependency ownership changed");
conclusion(dependencyAndOfflineResult.esbuild.consumer.topLevel === "0.28.1", "Esbuild consumer control changed");
conclusion(dependencyAndOfflineResult.esbuild.consumer.providerOwned === "0.28.2", "Esbuild provider did not resolve its exact dependency");
for (const result of dependencyAndOfflineResult.deno) {
  conclusion(result.offlineControl === "unreachable-loopback-proxy", `Deno ${result.version} offline control changed`);
  conclusion(result.emptyCache.failed === true, `Deno ${result.version} network-blocked empty-cache probe unexpectedly succeeded`);
  conclusion(result.emptyCache.outputFiles.length === 0, `Deno ${result.version} network-blocked empty-cache probe mutated output`);
  conclusion(result.acquisition.onlineSucceeded === true, `Deno ${result.version} provider-managed acquisition failed`);
  conclusion(result.acquisition.esbuildCacheEntries.length > 0, `Deno ${result.version} did not cache Esbuild`);
  conclusion(result.offlineAfterAcquisition.succeeded === true, `Deno ${result.version} did not work offline after acquisition`);
}

await writeReceipt({
  id: "dependency-and-offline",
  sourceSha,
  claims: [
    {
      id: "esbuild-dependency-ownership",
      classification: "established",
      conclusion: "effect-build-esbuild-owns-an-exact-esbuild-dependency-rather-than-a-peer-or-injected-api",
      assertions: [
        assertion("manifest-exact-esbuild-0.28.2"),
        assertion("no-esbuild-peer"),
        assertion("packed-provider-resolves-owned-version"),
        assertion("consumer-version-does-not-substitute-provider-version"),
      ],
    },
    {
      id: "deno-managed-esbuild-offline",
      classification: "established",
      conclusion: "deno-bundle-manages-esbuild-acquisition-fails-with-network-blocked-empty-cache-before-output-and-runs-from-populated-cache-with-network-blocked",
      assertions: [
        assertion("deno-2.9.3-network-blocked-empty-cache-fails-before-output"),
        assertion("deno-2.9.3-acquires-and-caches-esbuild"),
        assertion("deno-2.9.3-network-blocked-after-acquisition"),
        assertion("deno-2.9.5-network-blocked-empty-cache-fails-before-output"),
        assertion("deno-2.9.5-acquires-and-caches-esbuild"),
        assertion("deno-2.9.5-network-blocked-after-acquisition"),
      ],
    },
  ],
  evidence: dependencyAndOfflineResult,
});
