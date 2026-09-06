import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("..", import.meta.url));
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const run = (...args: readonly string[]) =>
  spawnSync(process.execPath, [main, ...args], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 10_000,
  });

test("reports validated measurements as machine-readable JSON", () => {
  const result = run("fixtures/bundles.json", "--format", "json", "--check");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    totalBytes: 166000,
    exceeded: 0,
    assets: [
      { name: "app.js", bytes: 48000, budgetBytes: 50000, overBudgetBy: 0 },
      { name: "vendor.js", bytes: 110000, budgetBytes: 120000, overBudgetBy: 0 },
      { name: "styles.css", bytes: 8000, budgetBytes: 10000, overBudgetBy: 0 },
    ],
  });
});

test("defaults to a readable table", () => {
  const result = run("fixtures/bundles.json");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Asset\s+Bytes\s+Budget\s+Status/u);
  assert.match(result.stdout, /Total: 166000 bytes; over budget: 0/u);
});

test("budget checking preserves JSON output and fails only when requested", () => {
  const report = run("fixtures/over-budget.json", "--format", "json");
  const checked = run("fixtures/over-budget.json", "--format", "json", "--check");
  assert.equal(report.status, 0, report.stderr);
  assert.equal(checked.status, 1);
  assert.equal(checked.stdout, report.stdout);
  assert.equal(JSON.parse(checked.stdout).exceeded, 2);
  assert.match(checked.stderr, /Bundle budget exceeded by 2 asset/u);
});

test("rejects invalid measurements before producing a report", () => {
  const result = run("fixtures/invalid.json");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Could not read valid bundle measurements/u);
  assert.match(result.stderr, /bytes/u);
});

test("rejects malformed JSON through the same decoding boundary", () => {
  const temporary = mkdtempSync(join(tmpdir(), "effect-build-cli-json-"));
  try {
    const filename = join(temporary, "malformed.json");
    writeFileSync(filename, "{ invalid JSON");
    const result = run(filename);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Could not read valid bundle measurements/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("shows help without a report or compiler and validates flag choices", () => {
  const help = run("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--format/u);
  assert.match(help.stdout, /--check/u);
  assert.match(help.stdout, /fixtures\/bundles\.json/u);
  const invalid = run("fixtures/bundles.json", "--format", "csv");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /csv/u);
});
