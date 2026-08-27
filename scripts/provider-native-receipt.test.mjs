import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProviderNativeReceipt,
  providerNativeAccounting,
  providerNativeReceiptExpectation,
  writeProviderNativeReceipt,
} from "./provider-native-receipt.mjs";
import { writeProviderNativeObservation } from "./provider-native-observation.mjs";
import { researchEvidenceAccountingForPackage } from "./research-evidence-accounting.mjs";

const researchContractSource = await readFile(
  new URL("../tooling/research-complete-contract.json", import.meta.url),
  "utf8",
);

const exactAccounting = {
  "bun@1.3.14": {
    provider: "bun",
    operations: Array.from({ length: 12 }, (_, index) => `CAN-BUN-${String(index + 1).padStart(3, "0")}`),
    atoms: ["B02.1", "B06.1", "B06.2", "B07.1", "B08.1", "B08.2", "B10.1"],
  },
  "deno@2.9.5": {
    provider: "deno",
    operations: Array.from({ length: 11 }, (_, index) => `CAN-DENO-${String(index + 1).padStart(3, "0")}`),
    atoms: ["D06.1", "D08.1", "D10.1"],
  },
  "node@26.7.0": {
    provider: "node-sea",
    operations: ["CAN-NODE-001"],
    atoms: ["S02.1", "S03.1", "S04.1", "S04.2", "S05.1", "S06.1", "S07.1", "S09.1", "S10.1"],
  },
  "esbuild@0.28.2+node@24.14.1": {
    provider: "esbuild",
    operations: [
      "CAN-ESB-001",
      "CAN-ESB-002",
      "CAN-ESB-003",
      "CAN-ESB-004",
      "CAN-ESB-005",
      "CAN-ESB-011",
      "CAN-ESB-012",
      "CAN-ESB-015",
      "CAN-ESB-016",
      "CAN-ESB-017",
      "CAN-ESB-018",
    ],
    atoms: ["E04.1", "E05.1", "E06.1", "E07.1", "E08.1", "E09.1", "E09.2", "E10.1", "E12.1"],
  },
  "esbuild@0.28.2+bun@1.3.14": {
    provider: "esbuild",
    operations: [
      "CAN-ESB-001",
      "CAN-ESB-002",
      "CAN-ESB-003",
      "CAN-ESB-004",
      "CAN-ESB-005",
      "CAN-ESB-011",
      "CAN-ESB-012",
      "CAN-ESB-015",
      "CAN-ESB-016",
      "CAN-ESB-017",
      "CAN-ESB-018",
    ],
    atoms: ["E04.1", "E05.1", "E06.1", "E07.1", "E08.1", "E09.1", "E09.2", "E10.1", "E12.1"],
  },
  "rolldown@1.2.5+node@24.14.1": {
    provider: "rolldown",
    operations: [
      "CAN-ROL-001",
      "CAN-ROL-002",
      "CAN-ROL-003",
      "CAN-ROL-005",
      "CAN-ROL-006",
      "CAN-ROL-007",
      "CAN-ROL-008",
      "CAN-ROL-010",
      "CAN-ROL-011",
      "CAN-ROL-012",
      "CAN-ROL-013",
      "CAN-ROL-014",
      "CAN-ROL-015",
      "CAN-ROL-016",
      "CAN-ROL-017",
      "CAN-ROL-018A",
      "CAN-ROL-018B",
      "CAN-ROL-020",
      "CAN-ROL-022",
    ],
    atoms: ["OP-ROL-004.release", "OP-ROL-009.release", "OP-ROL-019.release"],
  },
  "rolldown@1.2.5+bun@1.3.14": {
    provider: "rolldown",
    operations: [
      "CAN-ROL-001",
      "CAN-ROL-002",
      "CAN-ROL-003",
      "CAN-ROL-005",
      "CAN-ROL-006",
      "CAN-ROL-007",
      "CAN-ROL-008",
      "CAN-ROL-010",
      "CAN-ROL-011",
      "CAN-ROL-012",
      "CAN-ROL-013",
      "CAN-ROL-014",
      "CAN-ROL-015",
      "CAN-ROL-016",
      "CAN-ROL-017",
      "CAN-ROL-018A",
      "CAN-ROL-018B",
      "CAN-ROL-020",
      "CAN-ROL-022",
    ],
    atoms: ["OP-ROL-004.release", "OP-ROL-009.release", "OP-ROL-019.release"],
  },
};

const linuxHost = {
  certificationHost: "linux-x64",
  platform: "linux",
  architecture: "x64",
  libc: "glibc",
  systemTarget: "linux-x64-gnu",
};

const writeExpectedObservations = async (directory, providerRuntimeCell, certificationHost) => {
  await mkdir(directory, { recursive: true });
  const accounting = providerNativeAccounting(providerRuntimeCell);
  for (const id of [...accounting.operationIds, ...accounting.atomIds]) {
    await writeProviderNativeObservation({ directory, providerRuntimeCell, certificationHost, id });
  }
};

test("derives every cell's exact live operation and applicable atom IDs from the research contract", () => {
  for (const [cell, expected] of Object.entries(exactAccounting)) {
    const accounting = providerNativeAccounting(cell);
    assert.equal(accounting.provider, expected.provider);
    assert.deepEqual(accounting.operationIds, [...expected.operations].sort());
    assert.deepEqual(accounting.atomIds, [...expected.atoms].sort());
    const expectation = providerNativeReceiptExpectation(cell, "linux-x64");
    assert.equal(expectation.wrapperJobCount, "1");
    assert.equal(expectation.operationCount, String(expected.operations.length));
    assert.equal(expectation.atomCount, String(expected.atoms.length));
    assert.equal(expectation.observationCount, String(expected.operations.length + expected.atoms.length));
    assert.match(expectation.observationManifestSha256, /^[0-9a-f]{64}$/u);
  }
});

test("shares the same exact accounting with packed core, Apple, and provider packages", () => {
  assert.deepEqual(researchEvidenceAccountingForPackage("effect-build"), {
    provider: "effect",
    operationIds: [],
    atomIds: ["F01.1", "F02.1", "F03.1", "F04.1", "F05.1", "F06.1", "F07.1"],
  });
  assert.deepEqual(researchEvidenceAccountingForPackage("effect-build-apple"), {
    provider: "apple",
    operationIds: [],
    atomIds: ["S09.2"],
  });
  for (const [cell, expected] of Object.entries(exactAccounting)) {
    const packageName = expected.provider === "node-sea"
      ? "effect-build-node-sea"
      : `effect-build-${expected.provider}`;
    assert.deepEqual(researchEvidenceAccountingForPackage(packageName), {
      provider: expected.provider,
      operationIds: [...expected.operations].sort(),
      atomIds: [...expected.atoms].sort(),
    }, cell);
  }
  assert.throws(
    () => researchEvidenceAccountingForPackage("effect-build-unknown"),
    /outside research-complete release accounting/u,
  );
});

test("keeps wrapper, operation, and atom counts separate in deterministic receipt bytes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "effect-build-native-receipt-"));
  try {
    const output = join(temporary, "receipt.json");
    const observationDirectory = join(temporary, "observations");
    await writeExpectedObservations(observationDirectory, "bun@1.3.14", "linux-x64");
    const input = {
      providerRuntimeCell: "bun@1.3.14",
      certificationHost: "linux-x64",
      hostRuntime: "bun@1.3.14",
      observedHost: linuxHost,
      observationDirectory,
      output,
    };
    const receipt = await writeProviderNativeReceipt(input);
    assert.equal(receipt.wrapperJobCount, "1");
    assert.equal(receipt.operationCount, "12");
    assert.equal(receipt.atomCount, "7");
    assert.equal(receipt.observationCount, "19");
    assert.equal(receipt.observationSchema, "effect-build/provider-native-operation-observation@1");
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), receipt);
    await assert.rejects(() => writeProviderNativeReceipt(input), /EEXIST/u);
  } finally {
    await rm(temporary, { recursive: true });
  }
});

test("rejects incomplete, invented, and conflicting test observations", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "effect-build-native-observation-rejection-"));
  try {
    const observationDirectory = join(temporary, "observations");
    await mkdir(observationDirectory);
    await writeProviderNativeObservation({
      directory: observationDirectory,
      providerRuntimeCell: "bun@1.3.14",
      certificationHost: "linux-x64",
      id: "CAN-BUN-001",
    });
    await assert.rejects(
      () =>
        writeProviderNativeReceipt({
          providerRuntimeCell: "bun@1.3.14",
          certificationHost: "linux-x64",
          hostRuntime: "bun@1.3.14",
          observedHost: linuxHost,
          observationDirectory,
          output: join(temporary, "receipt.json"),
        }),
      /exact regular-file set/u,
    );
    await writeExpectedObservations(observationDirectory, "bun@1.3.14", "linux-x64");
    await writeProviderNativeObservation({
      directory: observationDirectory,
      providerRuntimeCell: "bun@1.3.14",
      certificationHost: "linux-x64",
      id: "CAN-BUN-999",
    });
    await assert.rejects(
      () =>
        writeProviderNativeReceipt({
          providerRuntimeCell: "bun@1.3.14",
          certificationHost: "linux-x64",
          hostRuntime: "bun@1.3.14",
          observedHost: linuxHost,
          observationDirectory,
          output: join(temporary, "invented-receipt.json"),
        }),
      /exact regular-file set/u,
    );
    await assert.rejects(
      () =>
        writeProviderNativeObservation({
          directory: observationDirectory,
          providerRuntimeCell: "bun@1.3.14",
          certificationHost: "linux-arm64",
          id: "CAN-BUN-001",
        }),
      /conflicting provider-native observation/u,
    );
  } finally {
    await rm(temporary, { recursive: true });
  }
});

test("rejects unknown cells, wrong runtimes, unsupported coordinates, and false host identities", () => {
  assert.throws(() => providerNativeAccounting("bun@latest"), /outside the research contract/u);
  assert.throws(
    () =>
      createProviderNativeReceipt({
        providerRuntimeCell: "bun@1.3.14",
        certificationHost: "linux-x64",
        hostRuntime: "node@24.14.1",
        observedHost: linuxHost,
      }),
    /host runtime mismatch/u,
  );
  assert.throws(
    () =>
      createProviderNativeReceipt({
        providerRuntimeCell: "node@26.7.0",
        certificationHost: "macos-arm64",
        hostRuntime: "node@26.7.0",
        observedHost: {
          certificationHost: "macos-arm64",
          platform: "darwin",
          architecture: "arm64",
          libc: "not-applicable",
          systemTarget: "macos-aarch64",
        },
      }),
    /explicitly unsupported/u,
  );
  assert.throws(
    () =>
      createProviderNativeReceipt({
        providerRuntimeCell: "bun@1.3.14",
        certificationHost: "linux-x64",
        hostRuntime: "bun@1.3.14",
        observedHost: { ...linuxHost, certificationHost: "linux-arm64" },
      }),
    /certification host mismatch/u,
  );
  assert.throws(
    () =>
      createProviderNativeReceipt({
        providerRuntimeCell: "bun@1.3.14",
        certificationHost: "linux-x64",
        hostRuntime: "bun@1.3.14",
        observedHost: { ...linuxHost, platform: "darwin", libc: "not-applicable" },
      }),
    /observed host fields do not match/u,
  );
});

test("fails closed when a disposition could be silently omitted from exact accounting", () => {
  const contract = JSON.parse(researchContractSource);
  contract.operationRegister.operations.find(({ operationId }) => operationId === "CAN-BUN-001").disposition =
    "new-unaccounted-state";
  assert.throws(() => providerNativeAccounting("bun@1.3.14", contract), /unknown disposition/u);
});
