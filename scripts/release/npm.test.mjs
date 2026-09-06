import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { authenticatedPreflight, createNpmAdapter, runNpm } from "./npm.mjs";

const cli = resolve(import.meta.dirname, "../../node_modules/npm/bin/npm-cli.js");
const name = "effect-build-npm-boundary-fixture";
const version = "1.2.3";
const marker = "npm verbose oidc Successfully retrieved and set token";
const integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;

const registryFixture = async (t, document, status = 200) => {
  const cwd = await mkdtemp(resolve(tmpdir(), "effect-build-npm-"));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method,
      path: request.url,
      authenticated: request.headers.authorization !== undefined,
    });
    response.writeHead(request.method === "GET" ? status : 405, { "content-type": "application/json" });
    const body = status === 200 && request.url.endsWith("/dist-tags") ? document?.["dist-tags"] : document;
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(cwd, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const registry = `http://127.0.0.1:${server.address().port}/`;
  // Whitelist basic OS variables: neither user npm configuration nor CI credentials reach npm.
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec"]
      .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    HOME: cwd,
    USERPROFILE: cwd,
    npm_config_cache: resolve(cwd, "cache"),
    npm_config_userconfig: resolve(cwd, "user.npmrc"),
    npm_config_globalconfig: resolve(cwd, "global.npmrc"),
    npm_config_update_notifier: "false",
  });
  const run = (args) =>
    runNpm(cli, [
      ...args,
      "--registry",
      registry,
      "--json",
      "--fetch-retries=0",
      "--fetch-timeout=3000",
    ], { cwd, env });
  return { cwd, requests, run, npm: createNpmAdapter({ cwd, cli, registry, env }) };
};

const packument = (manifest) => ({
  _id: name,
  name,
  "dist-tags": { latest: version },
  versions: { [version]: manifest },
});

test("preflight requires both successful exit and npm's OIDC exchange marker on stderr", () => {
  assert.equal(authenticatedPreflight({ status: 0, stdout: "", stderr: marker }), true);
  assert.equal(authenticatedPreflight({ status: 1, stdout: "", stderr: marker }), false);
  assert.equal(authenticatedPreflight({ status: null, stdout: "", stderr: marker }), false);
  assert.equal(authenticatedPreflight({ status: 0, stdout: marker, stderr: "" }), false);
  assert.equal(authenticatedPreflight({ status: 0, stdout: "", stderr: "npm info ok" }), false);
});

test("version ordering uses npm's SemVer prerelease and build metadata semantics", () => {
  const npm = createNpmAdapter({ cwd: import.meta.dirname, cli });
  assert.equal(npm.newerThan("1.2.3", "1.2.3-rc.9"), true);
  assert.equal(npm.newerThan("1.2.3-rc.10", "1.2.3-rc.2"), true);
  assert.equal(npm.newerThan("1.3.0-alpha.1", "1.2.3"), true);
  assert.equal(npm.newerThan("1.2.3-rc.1", "1.2.3"), false);
  assert.equal(npm.newerThan("1.2.3+build.2", "1.2.3+build.1"), false);
  assert.equal(npm.newerThan("invalid", "1.2.3"), false);
});

test("real npm 11.11.0 dry-run succeeds without credentials but fails authenticated preflight", {
  timeout: 30_000,
}, async (t) => {
  const fixture = await registryFixture(t, { error: "Not found" }, 404);
  await writeFile(resolve(fixture.cwd, "package.json"), JSON.stringify({ name, version, files: ["index.js"] }));
  await writeFile(resolve(fixture.cwd, "index.js"), "module.exports = 42;\n");
  const packed = await fixture.run(["pack", ".", "--ignore-scripts"]);
  assert.equal(packed.status, 0, packed.stderr);
  const tarball = resolve(fixture.cwd, JSON.parse(packed.stdout)[0].filename);
  const result = await fixture.run([
    "publish",
    tarball,
    "--dry-run",
    "--ignore-scripts",
    "--provenance",
    "--access",
    "public",
    "--tag",
    "latest",
    "--loglevel=verbose",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /This command requires you to be logged in .*\(dry-run\)/u);
  assert.equal(authenticatedPreflight(result), false);
  assert.deepEqual(await fixture.npm.publish({ tarball }, { dryRun: true }), { ok: false });
  assert.ok(fixture.requests.length > 0, "npm must actually read the loopback registry");
  assert.ok(fixture.requests.every((request) => request.method === "GET"), "dry-run must not mutate the registry");
});

test(
  "registry reads admit package integrity and semantic latest versions without credentials",
  { timeout: 15_000 },
  async (t) => {
    const fixture = await registryFixture(t, packument({ name, version, dist: { integrity } }));
    assert.deepEqual(await fixture.npm.viewVersion(name, version), { status: "present", integrity });
    assert.deepEqual(await fixture.npm.latestTag(name), { status: "present", version });
    assert.deepEqual(fixture.requests, [
      { method: "GET", path: `/${name}`, authenticated: false },
      { method: "GET", path: `/-/package/${name}/dist-tags`, authenticated: false },
    ]);
  },
);

test("malformed present versions and package documents remain unknown", { timeout: 15_000 }, async (t) => {
  for (
    const [label, document] of [
      ["invalid JSON", "{"],
      ["empty body", ""],
      ["empty object", {}],
      ["wrong package name", { ...packument({ name, version, dist: { integrity } }), name: "different" }],
      ["invalid versions map", { name, versions: [] }],
      ["wrong embedded name", packument({ name: "different", version, dist: { integrity } })],
      ["wrong embedded version", packument({ name, version: "9.9.9", dist: { integrity } })],
      ["missing integrity", packument({ name, version, dist: {} })],
      ["invalid integrity", packument({ name, version, dist: { integrity: "invalid" } })],
    ]
  ) {
    await t.test(label, async (t) => {
      const fixture = await registryFixture(t, document);
      assert.deepEqual(await fixture.npm.viewVersion(name, version), { status: "unknown" });
    });
  }
});

test("a valid versions map lacking the requested version means absent", { timeout: 15_000 }, async (t) => {
  const fixture = await registryFixture(t, packument({ name, version, dist: { integrity } }));
  assert.deepEqual(await fixture.npm.viewVersion(name, "1.2.4"), { status: "absent" });
});

test("a package without latest differs from a malformed latest tag", { timeout: 30_000 }, async (t) => {
  await t.test("missing latest", async (t) => {
    const document = packument({ name, version, dist: { integrity } });
    document["dist-tags"] = { reserved: version };
    const fixture = await registryFixture(t, document);
    const result = await fixture.run(["view", name, "dist-tags"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "", "npm view cannot distinguish missing latest from empty output");
    assert.deepEqual(await fixture.npm.latestTag(name), { status: "absent" });
  });
  await t.test("malformed latest", async (t) => {
    const document = packument({ name, version, dist: { integrity } });
    document["dist-tags"].latest = { invalid: true };
    const fixture = await registryFixture(t, document);
    const result = await fixture.run(["view", name, "dist-tags"]);
    assert.equal(JSON.parse(result.stdout).error.code, "E404", "npm view fabricates E404 from malformed latest");
    assert.deepEqual(await fixture.npm.latestTag(name), { status: "unknown" });
  });
  for (
    const [label, tags, expected] of [
      ["empty tag map", {}, "absent"],
      ["empty response body", "", "unknown"],
      ["invalid JSON", "{", "unknown"],
      ["invalid tag map", [], "unknown"],
      ["invalid version", { latest: "invalid" }, "unknown"],
    ]
  ) {
    await t.test(label, async (t) => {
      const fixture = await registryFixture(t, { "dist-tags": tags });
      assert.deepEqual(await fixture.npm.latestTag(name), { status: expected });
    });
  }
});

test("HTTP 404 means absent while failed registry reads remain unknown", { timeout: 15_000 }, async (t) => {
  await t.test("404", async (t) => {
    const fixture = await registryFixture(t, { error: "Not found" }, 404);
    const result = await fixture.run(["view", `${name}@${version}`]);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).error.code, "E404");
    assert.deepEqual(await fixture.npm.viewVersion(name, version), { status: "absent" });
    assert.deepEqual(await fixture.npm.latestTag(name), { status: "absent" });
  });
  await t.test("503", async (t) => {
    const fixture = await registryFixture(t, { error: "Temporarily unavailable" }, 503);
    assert.deepEqual(await fixture.npm.viewVersion(name, version), { status: "unknown" });
    assert.deepEqual(await fixture.npm.latestTag(name), { status: "unknown" });
  });
});
