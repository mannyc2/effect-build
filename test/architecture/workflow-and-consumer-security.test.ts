import { describe, expect, it } from "vitest";

interface ConsumerSecurity {
  assertCandidateBytesUnchanged: (candidate: unknown, contents: Uint8Array) => void;
  assertLockUnchanged: (before: Uint8Array, after: Uint8Array) => void;
  normalizeDependencyTree: (tree: unknown) => unknown;
  validateBunLock: (lock: unknown, expectation: unknown) => void;
  validateNpmLock: (lock: unknown, expectation: unknown) => void;
}

const {
  assertCandidateBytesUnchanged,
  assertLockUnchanged,
  normalizeDependencyTree,
  validateBunLock,
  validateNpmLock,
} = await import(
  new URL("../../scripts/test-built-consumer.mjs", import.meta.url).href
) as ConsumerSecurity;

const fixtureName = "fixture-bun-effect-build";
const integrity = {
  bun: "sha512-27RoALzmzx6Qp4LrPIE8bYJfHe+8ZaAO3xLhJMEE6mVA8fxcPh4HAGwBv09Nk2qTFVh578SlSCY5ojUlqeSJ4A==",
  core: "sha512-tAvYccPrX3bO6F6keOHdkBCptqV23zF4xw3dCsSqiD7k+ZqqFUfnptQ3fJ5feUWij+m+b3sBTFhFIWrHBKAUfw==",
  registry: "sha512-Nof78154BaHGdSYr4TPQFZ5+Dg+HkpmbI3SQUdwsby5QNs6yahGJPu2AgdIVqdx7pKZ2w7j/bvdnqoMmkG0PbA==",
  shared1: "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
  shared2: "sha512-I2Qekl1oQYM+dpI2RQUCKi1TBuaA7Od3LNzxcqls9s1e2ytiZyREL4403qHJ6UbLNAwbqO2ZhdWAWDUQAajyiA==",
};
const candidates = [
  {
    name: "effect-build",
    version: "0.3.0",
    tarball: "/candidate/effect-build-0.3.0.tgz",
    integrity: integrity.core,
  },
  {
    name: "effect-build-bun",
    version: "0.3.0",
    tarball: "/candidate/effect-build-bun-0.3.0.tgz",
    integrity: integrity.bun,
  },
] as const;
const expectation = { fixtureName, fixtureDirectory: "/fixture", candidates };

const expectLockRejection = (
  validator: unknown,
  operation: () => unknown,
  expected: RegExp,
): void => {
  expect(validator).toBeTypeOf("function");
  expect(operation).toThrow(expected);
};

interface NpmPackage {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
}

interface NpmLock {
  name: string;
  version: string;
  lockfileVersion: number;
  requires: boolean;
  packages: Record<string, NpmPackage>;
}

interface BunWorkspace {
  name: string;
  dependencies: Record<string, string>;
}

interface BunLock {
  lockfileVersion: number;
  configVersion: number;
  workspaces: Record<string, BunWorkspace>;
  packages: Record<string, unknown[]>;
  overrides?: Record<string, string>;
}

const directDependencies = {
  effect: "4.0.0-rc.108",
  "effect-build": `file:${candidates[0].tarball}`,
  "effect-build-bun": `file:${candidates[1].tarball}`,
  "parent-a": "1.0.0",
  "parent-b": "1.0.0",
};

const npmFixture = (): NpmLock => ({
  name: fixtureName,
  version: "1.0.0",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": { name: fixtureName, version: "1.0.0", dependencies: { ...directDependencies } },
    "node_modules/effect": {
      version: "4.0.0-rc.108",
      resolved: "https://registry.npmjs.org/effect/-/effect-4.0.0-rc.108.tgz",
      integrity: integrity.registry,
    },
    "node_modules/effect-build": {
      version: "0.3.0",
      resolved: `file:${candidates[0].tarball}`,
      integrity: integrity.core,
    },
    "node_modules/effect-build-bun": {
      version: "0.3.0",
      resolved: `file:${candidates[1].tarball}`,
      integrity: integrity.bun,
      dependencies: { "effect-build": "^0.3.0" },
    },
    "node_modules/parent-a": {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/parent-a/-/parent-a-1.0.0.tgz",
      integrity: integrity.registry,
      dependencies: { shared: "1.0.0" },
    },
    "node_modules/parent-b": {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/parent-b/-/parent-b-1.0.0.tgz",
      integrity: integrity.registry,
      dependencies: { shared: "2.0.0" },
    },
    "node_modules/shared": {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/shared/-/shared-1.0.0.tgz",
      integrity: integrity.shared1,
    },
    "node_modules/parent-b/node_modules/shared": {
      version: "2.0.0",
      resolved: "https://registry.npmjs.org/shared/-/shared-2.0.0.tgz",
      integrity: integrity.shared2,
    },
  },
});

const bunFixture = (): BunLock => ({
  lockfileVersion: 1,
  configVersion: 1,
  workspaces: { "": { name: fixtureName, dependencies: { ...directDependencies } } },
  overrides: {
    "@effect/platform-node-shared": "4.0.0-rc.108",
    "effect-build": `file:${candidates[0].tarball}`,
  },
  packages: {
    effect: ["effect@4.0.0-rc.108", "", {}, integrity.registry],
    "effect-build": ["effect-build@/candidate/effect-build-0.3.0.tgz", {}, integrity.core],
    "effect-build-bun": [
      "effect-build-bun@/candidate/effect-build-bun-0.3.0.tgz",
      { dependencies: { "effect-build": "^0.3.0" } },
      integrity.bun,
    ],
    "parent-a": ["parent-a@1.0.0", "", { dependencies: { shared: "1.0.0" } }, integrity.registry],
    "parent-b": ["parent-b@1.0.0", "", { dependencies: { shared: "2.0.0" } }, integrity.registry],
    shared: ["shared@1.0.0", "", {}, integrity.shared1],
    "parent-b/shared": ["shared@2.0.0", "", {}, integrity.shared2],
  },
});

describe("packed-consumer lock authority", () => {
  it("accepts exact candidate tarballs and legitimate duplicate transitive versions", () => {
    expect(() => validateNpmLock(npmFixture(), expectation)).not.toThrow();
    expect(() => validateBunLock(bunFixture(), expectation)).not.toThrow();
  });

  it("rejects the wrong fixture name", () => {
    const npm = npmFixture();
    npm.name = "fixture-attacker";
    npm.packages[""]!.name = "fixture-attacker";
    const bun = bunFixture();
    bun.workspaces[""]!.name = "fixture-attacker";
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /fixture|name/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /fixture|name/i);
  });

  it("rejects floating direct registry dependencies", () => {
    const npm = npmFixture();
    npm.packages[""]!.dependencies!.effect = "^4.0.0-rc.108";
    const bun = bunFixture();
    bun.workspaces[""]!.dependencies.effect = ">=4";
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /direct|exact|floating/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /direct|exact|floating/i);
  });

  it("rejects missing or malformed integrity", () => {
    const npmMissing = npmFixture();
    delete npmMissing.packages["node_modules/effect"]!.integrity;
    const npmInvalid = npmFixture();
    npmInvalid.packages["node_modules/effect"]!.integrity = "sha512-not-base64!";
    const npmShort = npmFixture();
    npmShort.packages["node_modules/effect"]!.integrity = "sha512-YQ==";
    const bunMissing = bunFixture();
    bunMissing.packages.effect![3] = undefined;
    const bunInvalid = bunFixture();
    bunInvalid.packages.effect![3] = "sha512-not-base64!";
    const bunShort = bunFixture();
    bunShort.packages.effect![3] = "sha512-YQ==";
    for (const lock of [npmMissing, npmInvalid, npmShort]) {
      expectLockRejection(validateNpmLock, () => validateNpmLock(lock, expectation), /integrity|sri/i);
    }
    for (const lock of [bunMissing, bunInvalid, bunShort]) {
      expectLockRejection(validateBunLock, () => validateBunLock(lock, expectation), /integrity|sri/i);
    }
  });

  it.each(["workspace:*", "file:/tmp/attacker.tgz", "link:../attacker"])(
    "rejects an unauthorized %s locator",
    (locator) => {
      const npm = npmFixture();
      npm.packages[""]!.dependencies!.effect = locator;
      const bun = bunFixture();
      bun.workspaces[""]!.dependencies.effect = locator;
      expectLockRejection(
        validateNpmLock,
        () => validateNpmLock(npm, expectation),
        /candidate|locator|registry|workspace|file|link/i,
      );
      expectLockRejection(
        validateBunLock,
        () => validateBunLock(bun, expectation),
        /candidate|locator|registry|workspace|file|link/i,
      );
    },
  );

  it("rejects unauthorized local locators below the root", () => {
    const npm = npmFixture();
    npm.packages["node_modules/parent-a"]!.dependencies!.attacker = "file:/tmp/attacker.tgz";
    const bun = bunFixture();
    const metadata = bun.packages["parent-a"]![2] as { dependencies: Record<string, string> };
    metadata.dependencies.attacker = "workspace:*";
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /unauthorized locator/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /unauthorized locator/i);
  });

  it("rejects an exact candidate locator when it appears in transitive Bun metadata", () => {
    const bun = bunFixture();
    const metadata = bun.packages["parent-a"]![2] as { dependencies: Record<string, string> };
    metadata.dependencies.attacker = `file:${candidates[0].tarball}`;
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /unauthorized locator/i);
  });

  it("rejects an unvalidated Bun root install section", () => {
    const bun = bunFixture();
    (bun.workspaces[""] as BunWorkspace & { devDependencies: Record<string, string> }).devDependencies = {
      attacker: "file:/tmp/attacker.tgz",
    };
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /root devDependencies/i);
  });

  it("rejects candidate tarball identity or SRI drift", () => {
    const npmIdentity = npmFixture();
    npmIdentity.packages[""]!.dependencies!["effect-build"] = "file:/candidate/effect-build-copy-0.3.0.tgz";
    npmIdentity.packages["node_modules/effect-build"]!.resolved = "file:/candidate/effect-build-copy-0.3.0.tgz";
    const bunIdentity = bunFixture();
    bunIdentity.workspaces[""]!.dependencies["effect-build"] = "file:/candidate/effect-build-copy-0.3.0.tgz";
    bunIdentity.packages["effect-build"]![0] = "effect-build@/candidate/effect-build-copy-0.3.0.tgz";
    expectLockRejection(
      validateNpmLock,
      () => validateNpmLock(npmIdentity, expectation),
      /candidate|tarball|identity/i,
    );
    expectLockRejection(
      validateBunLock,
      () => validateBunLock(bunIdentity, expectation),
      /candidate|tarball|identity/i,
    );

    const npmResolved = npmFixture();
    npmResolved.packages["node_modules/effect-build"]!.resolved = "file:/candidate/same-bytes-copy.tgz";
    expectLockRejection(
      validateNpmLock,
      () => validateNpmLock(npmResolved, expectation),
      /candidate|tarball|identity/i,
    );

    const npmSri = npmFixture();
    npmSri.packages["node_modules/effect-build"]!.integrity = integrity.shared1;
    const bunSri = bunFixture();
    bunSri.packages["effect-build"]![2] = integrity.shared1;
    expectLockRejection(
      validateNpmLock,
      () => validateNpmLock(npmSri, expectation),
      /candidate|integrity|sri/i,
    );
    expectLockRejection(
      validateBunLock,
      () => validateBunLock(bunSri, expectation),
      /candidate|integrity|sri/i,
    );
  });

  it("rejects a missing direct candidate lock record", () => {
    const npm = npmFixture();
    delete npm.packages["node_modules/effect-build"];
    const bun = bunFixture();
    delete bun.packages["effect-build"];
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /candidate lock record.*missing/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /candidate lock record.*missing/i);
  });

  it("rejects a candidate lock record bound to a noncanonical key", () => {
    const npm = npmFixture();
    npm.packages["node_modules/parent-a/node_modules/effect-build"] = npm.packages["node_modules/effect-build"]!;
    delete npm.packages["node_modules/effect-build"];
    const bun = bunFixture();
    bun.packages["parent-a/effect-build"] = bun.packages["effect-build"]!;
    delete bun.packages["effect-build"];
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /candidate|canonical|identity/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /candidate|canonical|identity/i);
  });

  it("rejects a noncandidate identity at a canonical Bun candidate key", () => {
    const bun = bunFixture();
    bun.packages["effect-build"] = ["attacker@1.0.0", {}, integrity.registry];
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /candidate|tarball|identity/i);
  });

  it("rejects a noncandidate Bun package without an exact resolved version", () => {
    const bun = bunFixture();
    bun.packages.effect![0] = "effect@latest";
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /exact registry identity/i);
  });

  it("accepts SRI-pinned HTTPS tarball identities consistently", () => {
    const npm = npmFixture();
    const bun = bunFixture();
    bun.packages.effect![0] = "effect@https://registry.npmjs.org/effect/-/effect-4.0.0-rc.108.tgz";
    expect(() => validateNpmLock(npm, expectation)).not.toThrow();
    expect(() => validateBunLock(bun, expectation)).not.toThrow();
  });

  it("rejects non-HTTPS remote tarball identities consistently", () => {
    const npm = npmFixture();
    npm.packages["node_modules/effect"]!.resolved = "http://registry.npmjs.org/effect/-/effect-4.0.0-rc.108.tgz";
    const bun = bunFixture();
    bun.packages.effect![0] = "effect@http://registry.npmjs.org/effect/-/effect-4.0.0-rc.108.tgz";
    expectLockRejection(validateNpmLock, () => validateNpmLock(npm, expectation), /unauthorized locator/i);
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /exact registry identity/i);
  });

  it("rejects an unauthorized candidate override", () => {
    const bun = bunFixture();
    bun.overrides!.attacker = `file:${candidates[0].tarball}`;
    expectLockRejection(validateBunLock, () => validateBunLock(bun, expectation), /override.*unauthorized/i);
  });

  it("normalizes dependency paths without collapsing duplicate versions", () => {
    expect(normalizeDependencyTree([
      { path: "node_modules/parent-b/node_modules/shared", name: "shared", version: "2.0.0" },
      { path: "node_modules/parent-a", name: "parent-a", version: "1.0.0" },
      { path: "node_modules/parent-a/node_modules/shared", name: "shared", version: "1.0.0" },
      { path: "node_modules/parent-b", name: "parent-b", version: "1.0.0" },
    ])).toEqual([
      { path: "node_modules/parent-a", name: "parent-a", version: "1.0.0" },
      { path: "node_modules/parent-a/node_modules/shared", name: "shared", version: "1.0.0" },
      { path: "node_modules/parent-b", name: "parent-b", version: "1.0.0" },
      { path: "node_modules/parent-b/node_modules/shared", name: "shared", version: "2.0.0" },
    ]);
    expect(() => normalizeDependencyTree([])).toThrow(/inventory/i);
    expect(() =>
      normalizeDependencyTree([
        { path: "node_modules/shared", name: "shared", version: "1.0.0" },
        { path: "node_modules/shared", name: "shared", version: "2.0.0" },
      ])
    ).toThrow(/inventory/i);
  });

  it("compares lock bytes rather than parsed meaning", () => {
    const before = new TextEncoder().encode('{"lockfileVersion":3}\n');
    expect(() => assertLockUnchanged(before, before.slice())).not.toThrow();
    expect(() => assertLockUnchanged(before, new TextEncoder().encode('{ "lockfileVersion":3}\n')))
      .toThrow(/lock|byte|changed|mutation/i);
  });

  it("rejects candidate-byte mutation after consumer verification", () => {
    const bytes = new TextEncoder().encode("candidate bytes");
    const candidate = {
      name: "effect-build",
      bytes: bytes.byteLength,
      sha256: "732d058fadd90c70f22429227ab5d9c74919217099efe737aa46835ce3a60856",
      integrity: "sha512-zZax5IysOKtuWV8zVI9fS5ghpKTDVsKa1k/bdgOU5vqMG50iQpVc4Lkla2PAWXGygu5yqY8k0LgizgjfYqmgZQ==",
    };
    expect(() => assertCandidateBytesUnchanged(candidate, bytes)).not.toThrow();
    expect(() => assertCandidateBytesUnchanged(candidate, new TextEncoder().encode("mutated bytes")))
      .toThrow(/tarball bytes changed/i);
  });
});
