import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  admitsNodeBuiltins,
  canonicalBytes,
  canonicalNodeBuiltinInventory,
  capability,
  coordinate,
  decodeCanonical,
  decodeDistributionDescriptor,
  inspectNativeExecutable,
  nodeMainApplicableCoordinates,
  nodeMainApplicableTargets,
  nodeBuiltinInventoryProgram,
  observeArtifact,
  observeJob,
  evidenceControl,
  readArtifactZip,
  researchContract,
  requireEntries,
  targetCell,
} from "./common.mjs";
import { buildNodeMainMatrices } from "./matrix.mjs";

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (records) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of records) {
    const filename = Buffer.from(name);
    const contents = Buffer.from(value);
    const crc = crc32(contents);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    locals.push(local, contents);
    const directory = Buffer.alloc(46 + filename.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE((3 << 8) | 20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(contents.length, 20);
    directory.writeUInt32LE(contents.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    filename.copy(directory, 46);
    central.push(directory);
    offset += local.length + contents.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
};

test("canonical controls reject unknown fields, numbers, and noncanonical bytes", () => {
  const fields = ["protocol", "value"];
  const value = { protocol: "example@1", value: "1" };
  assert.deepEqual(decodeCanonical(canonicalBytes(value), fields), value);
  assert.throws(() => canonicalBytes({ value: 1 }), /forbids numbers/u);
  assert.throws(() => decodeCanonical(canonicalBytes({ ...value, extra: "x" }), fields), /field mismatch/u);
  assert.throws(() => decodeCanonical(Buffer.from('{"value":"1","protocol":"example@1"}\n'), fields), /canonically/u);
});

test("authenticated Node built-in inventories are canonical and admit only observed subsets", () => {
  const probed = canonicalNodeBuiltinInventory(
    JSON.parse(execFileSync(process.execPath, ["--eval", nodeBuiltinInventoryProgram], { encoding: "utf8" })),
  );
  assert.equal(probed.includes("node:sea"), true);
  assert.equal(probed.includes("node:test"), true);
  const inventory = canonicalNodeBuiltinInventory(["path", "node:sea", "assert/strict", "fs", "path"]);
  assert.deepEqual(inventory, ["node:assert/strict", "node:fs", "node:path", "node:sea"]);
  assert.equal(admitsNodeBuiltins(inventory, ["node:assert/strict", "node:sea"]), true);
  assert.equal(admitsNodeBuiltins(inventory, ["node:not-admitted"]), false);
  assert.throws(() => canonicalNodeBuiltinInventory(["fs", "not a builtin"]), /invalid Node built-in/u);
});

test("run aggregation snapshots every job and artifact page once", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    const page = Number(url.searchParams.get("page"));
    const resource = url.pathname.endsWith("/jobs") ? "jobs" : "artifacts";
    const selectedArtifact = url.searchParams.get("name");
    const offset = (page - 1) * 100;
    const values = Array.from({ length: resource === "artifacts" ? 1 : page === 1 ? 100 : 1 }, (_, index) => {
      const id = offset + index;
      return resource === "jobs"
        ? { id, name: `job-${id}`, run_attempt: 1 }
        : {
          id: Number(selectedArtifact?.slice("artifact-".length)),
          name: selectedArtifact,
          workflow_run: { id: 999999997 },
          expired: false,
          expires_at: "2100-01-01T00:00:00Z",
          digest: `sha256:${"0".repeat(64)}`,
        };
    });
    return new Response(JSON.stringify({ total_count: resource === "artifacts" ? 1 : 101, [resource]: values }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const authority = { repository: "effect-build/snapshot-test", runId: "999999997", token: "test-token" };
    const [firstJob, lastJob, firstArtifact, lastArtifact] = await Promise.all([
      observeJob({ ...authority, runAttempt: "1", name: "job-0" }),
      observeJob({ ...authority, runAttempt: "1", name: "job-100" }),
      observeArtifact({ ...authority, name: "artifact-0" }),
      observeArtifact({ ...authority, name: "artifact-100" }),
    ]);
    assert.deepEqual([firstJob.id, lastJob.id, firstArtifact.id, lastArtifact.id], [0, 100, 0, 100]);
    assert.equal(calls.filter((call) => call.includes("/jobs?")).length, 2);
    assert.equal(calls.filter((call) => call.includes("/artifacts?")).length, 2);
    assert.equal(calls.filter((call) => call.includes("/artifacts?")).every((call) => call.includes("name=artifact-")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("artifact ZIP validation admits only exact regular top-level entries", () => {
  const entries = readArtifactZip(zip([["payload.bin", "payload"], ["offer.json", "{}\n"]]));
  requireEntries(entries, ["offer.json", "payload.bin"]);
  assert.equal(entries.get("payload.bin").toString(), "payload");
  assert.throws(() => readArtifactZip(zip([["nested/payload.bin", "payload"]])), /unsafe/u);
  assert.throws(() => requireEntries(entries, ["payload.bin"]), /layout mismatch/u);
  const corrupt = zip([["payload.bin", "payload"]]);
  corrupt[30 + Buffer.byteLength("payload.bin")] ^= 1;
  assert.throws(() => readArtifactZip(corrupt), /CRC mismatch/u);
});

test("the private finalizer accounts for 150 applicable and 30 rejected coordinates without collision", () => {
  assert.equal(capability.publicExport, "none-package-private-research-complete");
  const axes = evidenceControl.coordinateRules.nodeMainExecutable.axes;
  const names = axes.producerGroup.flatMap((producerGroup) =>
    axes.mainFormat.flatMap((format) =>
      axes.constructionHost.flatMap((constructionHost) =>
        axes.target.map((target) => coordinate({ producerGroup, format, constructionHost, target }))
      )
    )
  );
  assert.equal(names.length, 180);
  assert.equal(new Set(names).size, 180);
  assert.deepEqual(nodeMainApplicableTargets, [
    "macos-aarch64",
    "linux-x64-gnu",
    "linux-aarch64-gnu",
    "windows-x64",
    "windows-aarch64",
  ]);
  assert.equal(nodeMainApplicableCoordinates.length, 150);
  assert.equal(evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedCoordinates.length, 30);
  assert.equal(
    nodeMainApplicableCoordinates.length
      + evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedCoordinates.length,
    180,
  );
  assert.ok(nodeMainApplicableCoordinates.every(({ target }) => target !== "macos-x64"));
});

test("GitHub Node matrices are generated only from applicable contract coordinates", () => {
  const matrices = buildNodeMainMatrices();
  assert.equal(matrices.construction.include.length, 150);
  assert.equal(matrices.finalization.include.length, 150);
  assert.ok(matrices.construction.include.every(({ target }) => target !== "macos-x64"));
  assert.ok(matrices.finalization.include.every(({ target }) => target.token !== "macos-x64"));
  const constructionNames = matrices.construction.include.map(({ producer, format, construction, target }) =>
    coordinate({ producerGroup: producer, format, constructionHost: construction.id, target })
  );
  const finalizationNames = matrices.finalization.include.map(({ producer, format, construction_host, target }) =>
    coordinate({ producerGroup: producer, format, constructionHost: construction_host, target: target.token })
  );
  assert.deepEqual(finalizationNames, constructionNames);
  assert.equal(new Set(constructionNames).size, 150);
});

test("D13 host identities are independent from artifact targets and exclusions never become passes", () => {
  assert.deepEqual(evidenceControl.certificationHosts, [
    { id: "linux-x64", runner: "ubuntu-24.04", systemTarget: "linux-x64-gnu" },
    { id: "linux-arm64", runner: "ubuntu-24.04-arm", systemTarget: "linux-aarch64-gnu" },
    { id: "macos-arm64", runner: "macos-15", systemTarget: "macos-aarch64" },
    { id: "macos-x64", runner: "macos-15-intel", systemTarget: "macos-x64" },
    { id: "windows-x64", runner: "windows-2025", systemTarget: "windows-x64" },
  ]);
  const rule = evidenceControl.coordinateRules.providerNativeLanes;
  const unsupported = rule.explicitUnsupportedCoordinates.map(
    ({ providerRuntimeCell, certificationHost }) => `${providerRuntimeCell}|${certificationHost}`,
  );
  assert.deepEqual(unsupported, [
    "node@26.7.0|linux-arm64",
    "node@26.7.0|macos-arm64",
    "node@26.7.0|macos-x64",
    "node@26.7.0|windows-x64",
  ]);
  const applicable = rule.axes.providerRuntimeCell.flatMap((providerRuntimeCell) =>
    rule.axes.certificationHost
      .map((certificationHost) => `${providerRuntimeCell}|${certificationHost}`)
      .filter((cell) => !unsupported.includes(cell))
  );
  assert.equal(applicable.length, 31);
  assert.equal(applicable.some((cell) => unsupported.includes(cell)), false);
});

test("the current evidence schema is owned by research-complete scope", () => {
  assert.equal(researchContract.schema, "effect-build/research-complete-contract@1");
  assert.equal(researchContract.authority.replacesAsProductAuthority, "tooling/v05-contract.json");
  assert.strictEqual(evidenceControl, researchContract.evidenceControl);
  const rules = evidenceControl.coordinateRules;
  assert.deepEqual(
    [...rules.packedConsumers.axes.package].sort(),
    [...researchContract.invariants.firstPartyPackages].sort(),
  );
  assert.deepEqual(
    rules.packedConditionalProviderCandidates.axes.package,
    researchContract.invariants.conditionalPackageCandidates,
  );
  const browser = Object.values(rules.browserModulePayload.axes).reduce((total, axis) => total * axis.length, 1);
  const nativeCartesian = Object.values(rules.providerNativeLanes.axes).reduce((total, axis) => total * axis.length, 1);
  const native = nativeCartesian - rules.providerNativeLanes.explicitUnsupportedCoordinates.length;
  const packed = Object.values(rules.packedConsumers.axes).reduce((total, axis) => total * axis.length, 1);
  const conditionalPacked = Object.values(rules.packedConditionalProviderCandidates.axes)
    .reduce((total, axis) => total * axis.length, 1);
  assert.deepEqual({ browser, native, packed, conditionalPacked, total: browser + native + packed + conditionalPacked }, {
    browser: 45,
    native: 31,
    packed: 60,
    conditionalPacked: 10,
    total: 146,
  });
});

test("authenticated distribution descriptors bind exact bytes and target archives", () => {
  const cell = targetCell("linux-x64-gnu");
  const descriptor = {
    protocol: "effect-build/authenticated-node-distribution-executable@1",
    nodeVersion: "26.7.0",
    target: "linux-x64-gnu",
    executable: resolve("effect-build-node-descriptor-test"),
    executableBytes: "20",
    executableSha256: "a".repeat(64),
    archiveName: cell.distribution,
    archiveSha256: cell.sha256,
  };
  assert.deepEqual(decodeDistributionDescriptor(canonicalBytes(descriptor)), descriptor);
  assert.throws(
    () => decodeDistributionDescriptor(canonicalBytes({ ...descriptor, archiveSha256: "b".repeat(64) })),
    /outside the frozen target cell/u,
  );
});

test("native inspection proves each admitted executable family and architecture", () => {
  const elf = Buffer.alloc(20);
  elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  elf.writeUInt16LE(183, 18);
  assert.deepEqual(inspectNativeExecutable(elf, "linux-aarch64-gnu"), {
    nativeFormat: "elf",
    architecture: "aarch64",
  });

  const pe = Buffer.alloc(72);
  pe.write("MZ", 0, "ascii");
  pe.writeUInt32LE(64, 0x3c);
  pe.write("PE\0\0", 64, "binary");
  pe.writeUInt16LE(0x8664, 68);
  assert.deepEqual(inspectNativeExecutable(pe, "windows-x64"), { nativeFormat: "pe", architecture: "x64" });

  const macho = Buffer.alloc(8);
  macho.writeUInt32LE(0xfeedfacf, 0);
  macho.writeUInt32LE(0x0100000c, 4);
  assert.deepEqual(inspectNativeExecutable(macho, "macos-aarch64"), {
    nativeFormat: "mach-o",
    architecture: "aarch64",
  });
  assert.throws(() => inspectNativeExecutable(macho, "macos-x64"), /architecture mismatch/u);
});

test("the private adapter uses offer-first roles and hard-cut provider roots", async () => {
  const common = await readFile(new URL("./common.mjs", import.meta.url), "utf8");
  const construct = await readFile(new URL("./construct.mjs", import.meta.url), "utf8");
  const adapters = await readFile(new URL("./private-adapters.mjs", import.meta.url), "utf8");
  const completeReceipt = await readFile(new URL("./complete-receipt.mjs", import.meta.url), "utf8");
  const source = `${construct}\n${adapters}`;
  for (const stale of ["BuildError", "effect-build/Target", "NodeMain.seal", "/Profile", "node-sea/Raw"]) {
    assert.equal(source.includes(stale), false, stale);
  }
  assert.match(construct, /NodeMain\.assemble/u);
  assert.match(adapters, /effect-build-bun\/Command/u);
  assert.match(adapters, /effect-build-esbuild\/Api/u);
  assert.match(adapters, /packages\/effect-build-rolldown\/dist\/Api\/Build\.js/u);
  assert.doesNotMatch(adapters, /from "effect-build-rolldown\/Api"/u);
  assert.match(adapters, /makePrivateAssemblerLayer/u);
  assert.match(adapters, /probe-builder-builtins/u);
  assert.match(common, /builtinModules, isBuiltin/u);
  assert.match(adapters, /admitsNodeBuiltins/u);
  assert.doesNotMatch(adapters, /builtins: Object\.freeze\(\[\]\)/u);
  assert.doesNotMatch(adapters, /main\.builtins\.length !== 0/u);
  assert.match(construct, /node:sea/u);
  assert.match(adapters, /disableExperimentalSEAWarning: true/u);
  assert.match(completeReceipt, /canonicalBytes\(pending\.request\)\.equals\(requestBytes\)/u);
  assert.doesNotMatch(completeReceipt, /JSON\.stringify\(request\).*JSON\.stringify\(pending\.request\)/u);
});

test("the 45, 31, and split 60 plus 10-cell lanes use hard-cut suites and non-admitting receipts", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const aggregate = await readFile(new URL("../aggregate-compatibility.mjs", import.meta.url), "utf8");
  const packed = await readFile(new URL("../test-packed-coordinate.mjs", import.meta.url), "utf8");
  const consumer = await readFile(new URL("../test-built-consumer.mjs", import.meta.url), "utf8");
  const nativeReceipt = await readFile(new URL("../provider-native-receipt.mjs", import.meta.url), "utf8");
  const nodeBase = await readFile(new URL("./verify-node-base.mjs", import.meta.url), "utf8");

  assert.match(workflow, /browser-module-payload-compatibility\.test\.ts/u);
  assert.doesNotMatch(workflow, /static-browser-compatibility\.test\.ts/u);
  assert.doesNotMatch(workflow, /esbuild-watch\.test\.ts/u);
  assert.match(workflow, /EFFECT_BUILD_BUN="\$executable" bun run test:integration:bun/u);
  assert.match(workflow, /EFFECT_BUILD_DENO="\$executable" bun run test:integration:deno/u);
  assert.match(workflow, /EFFECT_BUILD_NODE="\$\(command -v node\)" bun run test:integration:node-sea/u);
  assert.match(workflow, /if \[\[ "\$RUNNER_OS" == "Windows" \]\]; then executable="\$\(cygpath -w "\$executable"\)"; fi/u);
  assert.match(workflow, /command -v gpg\n\s+command -v gpgv\n\s+command -v tar\n\s+command -v unzip/u);
  assert.doesNotMatch(workflow, /choco install gnupg/u);
  assert.match(workflow, /provider-host-runtime\.test\.ts/u);
  assert.equal(workflow.match(/host_runtime='bun@1\.3\.14'\n\s+bun run build/gu)?.length, 2);
  assert.equal(
    workflow.match(/bun \.\/node_modules\/vitest\/vitest\.mjs run --pool=forks/gu)?.length,
    4,
  );
  assert.doesNotMatch(workflow, /\bbun test\b/u);
  assert.doesNotMatch(workflow, /bun --bun \.\/node_modules\/vitest\/vitest\.mjs/u);
  assert.match(workflow, /node scripts\/provider-native-receipt\.mjs/u);
  assert.match(nativeReceipt, /provider-native-test-observed-exact-operation-and-atom-evidence-no-conditional-admission/u);
  assert.match(nativeReceipt, /readProviderNativeObservationDirectory/u);
  assert.doesNotMatch(workflow, /execution_scope|EXECUTION_SCOPE/u);
  assert.doesNotMatch(workflow, /ineligible-public-target-static-contract-tested/u);
  assert.match(aggregate, /conditional-candidate-executed-no-profile-admission/u);
  assert.match(aggregate, /packed-declaration-runtime-fixtures-executed-no-operation-admission/u);
  assert.match(aggregate, /conditional-provider-packed-runtime-fixtures-executed-no-package-admission/u);
  assert.match(aggregate, /providerNativeReceiptExpectation/u);
  assert.match(aggregate, /researchEvidenceAccountingForPackage/u);
  assert.match(aggregate, /coreTarballSha256/u);
  assert.match(aggregate, /packageLockSha256/u);
  assert.match(aggregate, /effectRuntimeIdentityCount: "1"/u);
  assert.match(aggregate, /operationIds: accounting\.operationIds/u);
  assert.match(aggregate, /atomIds: accounting\.atomIds/u);
  assert.match(packed, /targetPublicSurface\.providerLanes/u);
  assert.match(packed, /assertFixtureCoverage/u);
  assert.match(packed, /\["test", \.\.\.fixture\.bunTests\]/u);
  assert.doesNotMatch(packed, /\["--bun", vitest, "run", \.\.\.fixture\.bunTests\]/u);
  assert.match(packed, /observedEffectPaths\.size/u);
  assert.match(nodeBase, /\["--keyring", `\.\/\$\{keyringName\}`, signatureName, manifestName\]/u);
  assert.match(nodeBase, /\["-q", cell\.distribution, "-d", "extract"\]/u);
  assert.match(nodeBase, /\["-xf", cell\.distribution, "-C", "extract"\]/u);
  assert.match(nodeBase, /cwd: scratch/u);
  assert.doesNotMatch(nodeBase, /\["--keyring", keyring/u);
  assert.doesNotMatch(nodeBase, /\["-xf", archivePath/u);
  assert.match(consumer, /effect-build-bun\/Api/u);
  assert.match(consumer, /effect-build-node-sea\/Command/u);
  assert.doesNotMatch(consumer, /RolldownApi\.Build/u);
  assert.doesNotMatch(consumer, /DenoApi\.Bundle/u);
});
