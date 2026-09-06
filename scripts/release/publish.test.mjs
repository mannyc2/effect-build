import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { EXIT, publish } from "./publish.mjs";

const candidate = () => ({
  version: "0.6.4",
  packages: ["effect-build", "effect-build-apple", "effect-build-bun"].map((name) => ({
    name,
    tarball: `/candidate/${name}.tgz`,
    integrity: `sha512-${createHash("sha512").update(`${name} candidate bytes`).digest("base64")}`,
  })),
});

// The fake retains immutable version bytes separately from mutable dist-tags. Time controls their
// independent visibility; a failed upload response may still have committed the version.
const setup = () => {
  const manifest = candidate();
  let now = 0;
  const clock = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
  const versions = new Map();
  const tags = new Map();
  const calls = [];
  const unknownVersions = new Set();
  const unknownTags = new Set();
  const preflightFailures = new Set();
  const lostResponses = new Set();
  const rejectedUploads = new Set();
  const visibilityLag = new Map();
  const tagLag = new Map();
  const newerLatest = new Set();
  const key = (name, version) => `${name}@${version}`;
  const seed = (entry) => {
    versions.set(key(entry.name, manifest.version), { integrity: entry.integrity, visibleAt: now });
    tags.set(entry.name, { version: manifest.version, visibleAt: now });
  };
  const npm = {
    newerThan: (left, right) => {
      calls.push({ operation: "compare", left, right });
      return newerLatest.has(left);
    },
    viewVersion: async (name, version) => {
      if (unknownVersions.has(name)) return { status: "unknown" };
      const entry = versions.get(key(name, version));
      if (entry === undefined || entry.visibleAt > now) return { status: "absent" };
      return { status: "present", integrity: entry.integrity };
    },
    latestTag: async (name) => {
      if (unknownTags.has(name)) return { status: "unknown" };
      const tag = tags.get(name);
      return tag === undefined || tag.visibleAt > now
        ? { status: "absent" }
        : { status: "present", version: tag.version };
    },
    publish: async (entry, { dryRun }) => {
      calls.push({ operation: dryRun ? "preflight" : "upload", name: entry.name, integrity: entry.integrity });
      if (dryRun) return { ok: !preflightFailures.has(entry.name) };
      if (rejectedUploads.has(entry.name)) return { ok: false };
      const coordinate = key(entry.name, manifest.version);
      assert.equal(versions.has(coordinate), false, "npm versions cannot be overwritten");
      versions.set(coordinate, { integrity: entry.integrity, visibleAt: now + (visibilityLag.get(entry.name) ?? 0) });
      tags.set(entry.name, { version: manifest.version, visibleAt: now + (tagLag.get(entry.name) ?? 0) });
      return { ok: !lostResponses.has(entry.name) };
    },
  };
  return {
    manifest,
    clock,
    versions,
    tags,
    calls,
    seed,
    npm,
    unknownVersions,
    unknownTags,
    preflightFailures,
    lostResponses,
    rejectedUploads,
    visibilityLag,
    tagLag,
    newerLatest,
    run: (overrides = {}) =>
      publish({ manifest, npm, clock, log: () => {}, visibilityTimeoutMs: 30_000, ...overrides }),
    names: (operation) => calls.filter((call) => call.operation === operation).map((call) => call.name),
  };
};

const noUploads = (fixture) => assert.deepEqual(fixture.names("upload"), []);
const allNames = (fixture) => fixture.manifest.packages.map((entry) => entry.name);

test("absent versions all receive an authenticated preflight before the first upload", async () => {
  const fixture = setup();
  const names = allNames(fixture);
  const outcome = await fixture.run();
  assert.deepEqual(outcome, { published: names, skipped: 0 });
  assert.deepEqual(fixture.names("upload"), names);
  const firstUpload = fixture.calls.findIndex((call) => call.operation === "upload");
  assert.deepEqual(fixture.calls.slice(0, firstUpload).map((call) => call.name), names);
  for (const entry of fixture.manifest.packages) {
    assert.deepEqual(await fixture.npm.viewVersion(entry.name, fixture.manifest.version), {
      status: "present",
      integrity: entry.integrity,
    });
  }
});

test("partial publication skips matching packages even when they are not a prefix", async () => {
  const fixture = setup();
  fixture.seed(fixture.manifest.packages[0]);
  fixture.seed(fixture.manifest.packages[2]);
  const missing = fixture.manifest.packages[1].name;
  assert.deepEqual(await fixture.run(), { published: [missing], skipped: 2 });
  assert.deepEqual(fixture.names("preflight"), [missing]);
  assert.deepEqual(fixture.names("upload"), [missing]);
});

test("a fully published candidate reruns without credentials or uploads", async () => {
  const fixture = setup();
  fixture.manifest.packages.forEach((entry) => fixture.seed(entry));
  allNames(fixture).forEach((name) => fixture.preflightFailures.add(name));
  assert.deepEqual(await fixture.run(), { published: [], skipped: fixture.manifest.packages.length });
  assert.deepEqual(fixture.names("preflight"), []);
  noUploads(fixture);
});

test("a rebuilt candidate that differs from an already published package cannot resume", async () => {
  const fixture = setup();
  fixture.seed(fixture.manifest.packages[2]);
  const rebuilt = structuredClone(fixture.manifest);
  rebuilt.packages[2].integrity = "sha512-different-rebuilt-bytes";
  await assert.rejects(fixture.run({ manifest: rebuilt }), {
    code: EXIT.CONFLICT,
    message: /published bytes differ/u,
  });
  assert.deepEqual(fixture.names("preflight"), []);
  noUploads(fixture);
});

for (const boundary of ["unknownVersions", "unknownTags"]) {
  test(`an inconclusive ${boundary === "unknownVersions" ? "version" : "latest"} read never becomes permission to publish`, async () => {
    const fixture = setup();
    fixture[boundary].add(fixture.manifest.packages[2].name);
    await assert.rejects(fixture.run(), { code: EXIT.UNKNOWN });
    assert.deepEqual(fixture.names("preflight"), []);
    noUploads(fixture);
  });
}

test("an OIDC failure for the last missing package prevents every upload", async () => {
  const fixture = setup();
  fixture.preflightFailures.add(fixture.manifest.packages[2].name);
  await assert.rejects(fixture.run(), {
    code: EXIT.FAILED,
    message: /OIDC exchange.*trusted-publisher/u,
  });
  assert.deepEqual(fixture.names("preflight"), allNames(fixture));
  noUploads(fixture);
});

test("successful uploads wait for both version bytes and independently delayed latest tags", async () => {
  const fixture = setup();
  fixture.visibilityLag.set(fixture.manifest.packages[2].name, 10_000);
  fixture.tagLag.set(fixture.manifest.packages[0].name, 20_000);
  await fixture.run();
  assert.deepEqual(fixture.names("upload"), allNames(fixture));
  assert.ok(fixture.clock.now() >= 20_000);
});

test("a lost response is resolved by visible matching bytes without another upload", async () => {
  const fixture = setup();
  const entry = fixture.manifest.packages[0];
  fixture.lostResponses.add(entry.name);
  fixture.visibilityLag.set(entry.name, 20_000);
  await fixture.run();
  assert.deepEqual(fixture.names("upload"), allNames(fixture));
  assert.ok(fixture.clock.now() >= 20_000);
});

test("an unresolved lost response stops subsequent uploads and a later rerun retains matching bytes", async () => {
  const fixture = setup();
  const first = fixture.manifest.packages[0];
  fixture.lostResponses.add(first.name);
  fixture.visibilityLag.set(first.name, 60_000);
  await assert.rejects(fixture.run(), { code: EXIT.UNKNOWN, message: /retain this candidate.*retry later/u });
  assert.deepEqual(fixture.names("upload"), [first.name]);
  await fixture.clock.sleep(60_000);
  const result = await fixture.run();
  assert.equal(result.skipped, 1);
  assert.deepEqual(fixture.names("upload"), allNames(fixture));
});

test("a rejected upload with no observable version stops without retrying or publishing later packages", async () => {
  const fixture = setup();
  const first = fixture.manifest.packages[0];
  fixture.rejectedUploads.add(first.name);
  await assert.rejects(fixture.run(), { code: EXIT.UNKNOWN });
  assert.deepEqual(fixture.names("upload"), [first.name]);
  assert.equal(fixture.versions.size, 0);
});

test("visibility timeout after successful uploads is resumable without uploading again", async () => {
  const fixture = setup();
  fixture.visibilityLag.set(fixture.manifest.packages[2].name, 60_000);
  await assert.rejects(fixture.run(), { code: EXIT.UNKNOWN });
  await fixture.clock.sleep(60_000);
  assert.deepEqual(await fixture.run(), { published: [], skipped: fixture.manifest.packages.length });
  assert.deepEqual(fixture.names("upload"), allNames(fixture));
});

for (const tag of ["0.6.3", undefined]) {
  test(`matching bytes with ${tag === undefined ? "no latest tag" : "an older latest tag"} require actionable repair`, async () => {
    const fixture = setup();
    fixture.manifest.packages.forEach((entry) => fixture.seed(entry));
    const first = fixture.manifest.packages[0];
    if (tag === undefined) fixture.tags.delete(first.name);
    else fixture.tags.set(first.name, { version: tag, visibleAt: 0 });
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(fixture.run(), {
        code: EXIT.CONFLICT,
        message: /Repair the dist-tags.*uploading again cannot repair/u,
      });
    }
    noUploads(fixture);
    fixture.tags.set(first.name, { version: fixture.manifest.version, visibleAt: 0 });
    await fixture.run();
    noUploads(fixture);
  });
}

// The npm adapter owns SemVer ordering, including prereleases. These cases exercise the
// publisher's use of that decision rather than introducing another SemVer implementation.
for (const latest of ["0.7.0", "0.7.0-beta.1"]) {
  test(`an adapter-confirmed newer latest ${latest} cannot be downgraded`, async () => {
    const fixture = setup();
    const name = fixture.manifest.packages[2].name;
    fixture.tags.set(name, { version: latest, visibleAt: 0 });
    fixture.newerLatest.add(latest);
    await assert.rejects(fixture.run(), { code: EXIT.CONFLICT, message: /refusing to move it back/u });
    assert.deepEqual(fixture.calls.find((call) => call.operation === "compare"), {
      operation: "compare",
      left: latest,
      right: fixture.manifest.version,
    });
    assert.deepEqual(fixture.names("preflight"), []);
    noUploads(fixture);
  });
}

test("a prerelease below the target version does not block publishing the stable version", async () => {
  const fixture = setup();
  fixture.tags.set(fixture.manifest.packages[0].name, { version: "0.6.4-beta.1", visibleAt: 0 });
  await fixture.run();
  assert.deepEqual(fixture.names("upload"), allNames(fixture));
});
