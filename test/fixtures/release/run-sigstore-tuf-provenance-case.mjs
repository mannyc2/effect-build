#!/usr/bin/env node

import {
  loadRetainedSigstoreTufInputs,
  verifyRetainedSigstoreTufProvenance,
} from "../../../scripts/release/verify-sigstore-tuf-provenance.mjs";

const kind = process.argv[2];
const inputs = await loadRetainedSigstoreTufInputs();

if (kind === "metadata") {
  const path = inputs.tuf.acquisition.metadata.targets.path;
  const text = inputs.evidence.get(path);
  inputs.evidence.set(path, `${text.slice(0, -2)}A\n`);
} else if (kind === "target") {
  inputs.trustedRootBytes[0] ^= 1;
} else if (kind === "seed") {
  inputs.seedDocumentBytes[0] ^= 1;
} else if (kind === "client") {
  inputs.installedPackages.set("@sigstore/tuf", {
    ...inputs.installedPackages.get("@sigstore/tuf"),
    version: "4.0.1",
  });
} else if (kind === "manifest") {
  inputs.packageManifest.devDependencies["tuf-js"] = "4.0.0";
} else if (kind === "lock-relocation") {
  const left = inputs.tuf.acquisition.clients[0].integrity;
  const right = inputs.tuf.acquisition.clients[1].integrity;
  inputs.lockfileText = inputs.lockfileText
    .replace(left, "sha512-integrity-swap-sentinel")
    .replace(right, left)
    .replace("sha512-integrity-swap-sentinel", right);
} else if (kind !== "baseline") {
  throw new Error("unknown retained Sigstore TUF provenance test case");
}

try {
  const result = await verifyRetainedSigstoreTufProvenance(inputs);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
