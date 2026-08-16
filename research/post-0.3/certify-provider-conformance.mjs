import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conclusion, writeReceipt } from "./receipt.mjs";
import {
  assertion,
  markerValue,
  requiredPath,
  runRequired,
  sourceSha,
} from "./probe-runtime.mjs";

const bun = await requiredPath("EFFECT_BUILD_BUN_BIN");
const deno = await requiredPath("EFFECT_BUILD_DENO_BIN");
const denort = await requiredPath("EFFECT_BUILD_DENORT_BIN");
const node26 = await requiredPath("EFFECT_BUILD_NODE_26_BIN");
const wrapperRoot = await mkdtemp(join(tmpdir(), "effect-build-deno-research-wrapper-"));
const denoWrapper = join(wrapperRoot, "deno");
let result;
try {
  await writeFile(
    denoWrapper,
    `#!/usr/bin/env bash\nset -euo pipefail\nif [[ \"\${1:-}\" == \"compile\" ]]; then\n  shift\n  exec \"${deno}\" compile --no-check \"$@\"\nfi\nexec \"${deno}\" \"$@\"\n`,
  );
  await chmod(denoWrapper, 0o755);
  result = markerValue(
    (await runRequired(process.execPath, ["research/post-0.3/provider-conformance.mjs"], {
      env: {
        EFFECT_BUILD_BUN_BIN: bun,
        EFFECT_BUILD_DENO_BIN: denoWrapper,
        EFFECT_BUILD_DENORT_BIN: denort,
        EFFECT_BUILD_NODE_SEA_BIN: node26,
        DENORT_BIN: denort,
      },
    })).stdout,
    "EFFECT_BUILD_RESEARCH_RECEIPT",
  );
} finally {
  await rm(wrapperRoot, { recursive: true, force: true });
}

conclusion(
  result.nodeMainProgram.directMainConforms === true,
  "Bun and Esbuild Node mains no longer execute equivalently",
);
conclusion(
  result.nodeMainProgram.importableModuleConforms === false,
  "the importable-module falsifier unexpectedly disappeared",
);
conclusion(
  result.nodeMainProgram.conclusion === "narrow-main-role-valid-broad-importable-role-falsified",
  "the Node-main conclusion changed",
);
conclusion(
  result.runtimeExecutables.commonDurableObservation === true,
  "executable durable observations no longer overlap",
);
conclusion(
  result.runtimeExecutables.runtimeIdentitySubstitutable === false,
  "Bun and Deno executable runtime identities unexpectedly converged",
);
conclusion(
  result.runtimeExecutables.conclusion
    === "universal-runtime-executable-profile-falsified-runtime-named-roles-required",
  "the runtime-neutral executable conclusion changed",
);
conclusion(
  result.staticWebApplication.roleConforms === false,
  "the intentionally broad static-web fixture unexpectedly conformed natively",
);
conclusion(
  result.staticWebApplication.conclusion === "static-web-role-falsified",
  "the broad static-web conclusion changed",
);
conclusion(
  result.declarationSets.topologyEquivalent === false,
  "Deno and tsc declaration topology unexpectedly converged",
);
conclusion(
  result.declarationSets.conclusion
    === "broad-declaration-set-profile-falsified-rolled-up-vs-module-tree",
  "the declaration topology conclusion changed",
);
conclusion(
  result.commandWatch.rawScopedProcessConforms === true,
  "raw Bun/Deno watch process behavior was not reproduced",
);
conclusion(
  result.commandWatch.stableTypedEventsConform === false,
  "a stable typed Bun/Deno watch protocol unexpectedly appeared",
);
conclusion(
  result.commandWatch.conclusion
    === "typed-cross-provider-watch-event-protocol-rejected-opaque-provider-session-only",
  "the portable watch conclusion changed",
);
conclusion(
  typeof result.denoCompiledBundleApi.output === "string"
    && /Deno\.bundle is not a function/.test(result.denoCompiledBundleApi.output),
  "compiled Deno unexpectedly exposed Deno.bundle",
);

await writeReceipt({
  id: "existing-provider-research",
  sourceSha,
  claims: [
    {
      id: "node-main-role",
      classification: "established",
      conclusion: "node-main-entry-is-portable-importable-module-is-not",
      assertions: [assertion("direct-main-substitution"), assertion("importable-module-falsifier")],
    },
    {
      id: "runtime-neutral-executable",
      classification: "falsified",
      conclusion: "bun-and-deno-embed-distinct-runtimes",
      assertions: [assertion("common-file-observation"), assertion("distinct-runtime-execution")],
    },
    {
      id: "broad-static-web",
      classification: "falsified",
      conclusion: "top-level-linked-resource-is-not-preserved-natively",
      assertions: [assertion("adversarial-top-level-css-dropped")],
    },
    {
      id: "declaration-output-set",
      classification: "falsified",
      conclusion: "deno-and-tsc-output-topologies-differ",
      assertions: [assertion("declaration-topology-compared")],
    },
    {
      id: "portable-command-watch-events",
      classification: "falsified",
      conclusion: "bun-and-deno-expose-no-machine-readable-watch-protocol",
      assertions: [assertion("initial-and-rebuild-observed"), assertion("machine-protocol-absent")],
    },
    {
      id: "compiled-deno-bundle-api",
      classification: "falsified",
      conclusion: "compiled-deno-does-not-expose-deno-bundle",
      assertions: [assertion("compiled-runtime-invoked"), assertion("function-absent")],
    },
  ],
  evidence: result,
});
