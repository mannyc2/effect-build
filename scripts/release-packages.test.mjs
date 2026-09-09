import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { publish, readCandidate } from "./release-packages.mjs";

const fixture = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-build-publish-"));
  const bytes = Buffer.from("exact candidate tarball");
  const item = {
    name: "effect-build",
    version: "0.7.0",
    filename: "effect-build-0.7.0.tgz",
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
  const metadata = new Map();
  const packages = [item];
  let body = bytes;
  let status = 200;
  const server = createServer((request, response) => {
    if (request.url === "/tarball") {
      response.end(body);
      return;
    }
    const current = metadata.get(decodeURIComponent(request.url.split("/")[1]));
    response.writeHead(current ? status : 404, { "content-type": "application/json" });
    response.end(JSON.stringify(current ?? { error: "not found" }));
  });
  await new Promise((resume) => server.listen(0, "127.0.0.1", resume));
  const registry = `http://127.0.0.1:${server.address().port}/`;
  const observe = (integrity = item.integrity, name = item.name) => {
    metadata.set(name, { ...item, name, dist: { integrity, tarball: `${registry}tarball` } });
  };
  const manifest = () =>
    writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({ schema: 1, commit: process.env.GITHUB_SHA ?? "a".repeat(40), packages }),
    );
  try {
    await writeFile(join(directory, item.filename), bytes);
    await manifest();
    await run({
      directory,
      item,
      registry,
      observe,
      add: async (name) => {
        const next = { ...item, name, filename: `${name}-${item.version}.tgz` };
        packages.push(next);
        await writeFile(join(directory, next.filename), bytes);
        await manifest();
      },
      replace: (value) => {
        body = value;
      },
      fail: () => {
        status = 503;
      },
    });
  } finally {
    await new Promise((resume) => server.close(resume));
    await rm(directory, { recursive: true, force: true });
  }
};

test("resumption skips identical installed registry bytes", () =>
  fixture(async ({ directory, registry, observe }) => {
    observe();
    await publish(directory, { registry, publishPackage: () => assert.fail("must not republish") });
  }));

test("resumption refuses conflicting registry bytes before publishing", () =>
  fixture(async ({ directory, registry, observe }) => {
    observe("sha512-different");
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => assert.fail("must not publish") }),
      /Published bytes differ/u,
    );
  }));

test("verifies downloaded bytes, not just registry integrity metadata", () =>
  fixture(async ({ directory, registry, observe, replace }) => {
    observe();
    replace(Buffer.from("different bytes"));
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => assert.fail("must not publish") }),
      /tarball failed integrity/u,
    );
  }));

test("ambiguous successful upload is observed and does not publish twice", () =>
  fixture(async ({ directory, registry, observe }) => {
    let uploads = 0;
    await publish(directory, {
      registry,
      publishPackage: () => {
        uploads++;
        observe();
        throw new Error("connection lost");
      },
      attempts: 1,
    });
    assert.equal(uploads, 1);
  }));

test("an unconfirmed upload stops with a resumable candidate", () =>
  fixture(async ({ directory, registry }) => {
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => {}, attempts: 1 }),
      /resume with these exact tarballs/u,
    );
    assert.equal((await readCandidate(directory)).packages.length, 1);
  }));

test("local candidate tampering is rejected before any upload", () =>
  fixture(async ({ directory, registry, item }) => {
    await writeFile(join(directory, item.filename), "repacked bytes");
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => assert.fail("must not publish") }),
      /Candidate bytes changed/u,
    );
  }));

test("registry errors cannot be mistaken for an unpublished version", () =>
  fixture(async ({ directory, registry, observe, fail }) => {
    observe();
    fail();
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => assert.fail("must not publish") }),
      /lookup failed/u,
    );
  }));

test("checks every existing coordinate before publishing a missing prefix", () =>
  fixture(async ({ directory, registry, observe, add }) => {
    await add("effect-build-bun");
    observe("sha512-conflict", "effect-build-bun");
    await assert.rejects(
      publish(directory, { registry, publishPackage: () => assert.fail("must not publish prefix") }),
      /Published bytes differ/u,
    );
  }));

test("resumes a partial multi-package release without republishing its prefix", () =>
  fixture(async ({ directory, registry, observe, add }) => {
    await add("effect-build-bun");
    const first = [];
    await assert.rejects(
      publish(directory, {
        registry,
        attempts: 1,
        publishPackage: (item) => {
          first.push(item.name);
          if (item.name === "effect-build") observe(item.integrity, item.name);
        },
      }),
      /unconfirmed/u,
    );
    assert.deepEqual(first, ["effect-build", "effect-build-bun"]);
    const resumed = [];
    await publish(directory, {
      registry,
      attempts: 1,
      publishPackage: (item) => {
        resumed.push(item.name);
        observe(item.integrity, item.name);
      },
    });
    assert.deepEqual(resumed, ["effect-build-bun"]);
  }));
