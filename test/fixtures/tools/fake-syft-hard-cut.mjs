#!/usr/bin/env bun
import { writeSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const stdout = (text) => writeSync(1, text);
const stderr = (text) => writeSync(2, text);

if (process.env.FAKE_SYFT_LOG) {
  await mkdir(dirname(process.env.FAKE_SYFT_LOG), { recursive: true });
  await writeFile(
    process.env.FAKE_SYFT_LOG,
    `${JSON.stringify({ argv, cwd: process.cwd(), marker: process.env.FAKE_PROJECT_MARKER ?? "" })}\n`,
    { flag: "a" },
  );
}

if (argv.length === 1 && argv[0] === "version") {
  stdout(`Application: syft\nVersion: ${process.env.FAKE_SYFT_VERSION ?? "1.50.0"}\n`);
  process.exit(0);
}

if (process.env.FAKE_SYFT_MODE === "fail") {
  stdout("native syft stdout");
  stderr("native syft stderr");
  process.exit(23);
}

const outputIndex = argv.indexOf("--output");
const output = outputIndex === -1 ? undefined : argv[outputIndex + 1];
const separator = output?.indexOf("=") ?? -1;
const format = separator === -1 ? undefined : output.slice(0, separator);
const target = separator === -1 ? undefined : output.slice(separator + 1);
if (!format || !target) {
  stderr("missing --output format=path");
  process.exit(24);
}

if (process.env.FAKE_SYFT_MODE !== "missing") {
  if (process.env.FAKE_SYFT_MODE === "invalid-utf8") {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
    process.exit(0);
  }
  const document = process.env.FAKE_SYFT_MODE === "invalid"
    ? { spdxVersion: "SPDX-2.2", bomFormat: "not-cyclonedx" }
    : format === "spdx-json@2.3"
    ? {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: "SPDXRef-DOCUMENT",
      name: "fixture",
      documentNamespace: "https://example.test/spdx/fixture",
      creationInfo: { created: "2026-08-25T00:00:00Z", creators: ["Tool: syft-1.50.0"] },
      packages: [{
        SPDXID: "SPDXRef-Package-fixture",
        name: "fixture-package",
        versionInfo: "1.0.0",
        downloadLocation: "NOASSERTION",
      }],
    }
    : {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
      version: 1,
      metadata: { timestamp: "2026-08-25T00:00:00Z" },
      components: [{ type: "library", name: "fixture-package", version: "1.0.0" }],
    };
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(document)}\n`);
}
