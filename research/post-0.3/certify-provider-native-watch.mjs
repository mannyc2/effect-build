import { providerNativeWatchResult } from "./provider-native-watch-probe.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

conclusion(providerNativeWatchResult.portableTypedEventProtocol === "falsified", "portable typed watch conclusion changed");
conclusion(providerNativeWatchResult.providerNativeCommandWatch === "established", "provider-native watch capability was not reproduced");
conclusion(providerNativeWatchResult.eventProtocol === "raw-stdio-and-exit-only", "provider-native watch event contract changed");
conclusion(providerNativeWatchResult.readinessProtocol === "not-advertised", "an unproved readiness protocol was advertised");
conclusion(providerNativeWatchResult.bun.rebuildObserved === true, "Bun provider-native watch did not rebuild");
conclusion(providerNativeWatchResult.deno.rebuildObserved === true, "Deno provider-native watch did not rebuild");
conclusion(providerNativeWatchResult.interruption.terminatedAfterFiberInterruption === true, "scope interruption did not terminate child");
conclusion(providerNativeWatchResult.forceKill.forceKilledAfterIgnoredSignal === true, "force-kill timeout did not terminate child");

await writeReceipt({
  id: "provider-native-watch",
  sourceSha,
  claims: [{
    id: "provider-native-command-watch",
    classification: "established",
    conclusion: "bun-and-deno-command-watch-surfaces-preserve-scoped-process-stdio-signals-exit-and-force-kill-without-portable-events",
    assertions: [
      assertion("bun-initial-and-rebuild-output"),
      assertion("deno-initial-and-rebuild-output"),
      assertion("raw-stdout-and-stderr"),
      assertion("official-effect-child-process-signal"),
      assertion("scope-interruption-terminates-child"),
      assertion("ignored-signal-force-kill"),
      assertion("no-universal-readiness-or-rebuild-event"),
    ],
  }],
  evidence: providerNativeWatchResult,
});
