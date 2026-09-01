import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The dependency bootstrap is an intentionally unprotected Node script module.
import * as frozenReleaseDependencyBootstrap from "../../scripts/release/install-frozen-release-dependencies.mjs";

const {
  runFrozenReleaseDependencyBootstrap,
  validateDependencyBootstrapPolicy,
  validateLockfileIntegrity,
} = frozenReleaseDependencyBootstrap;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "tooling/effect-build-contract.json"), "utf8"));
const policy = contract.releaseCertification.dependencyBootstrap;

describe("frozen release dependency bootstrap", () => {
  it("accepts only the generated bootstrap policy and integrity-binds every external lock entry", () => {
    expect(validateDependencyBootstrapPolicy(contract)).toEqual(policy);
    const result = validateLockfileIntegrity(readFileSync(resolve(repositoryRoot, "bun.lock"), "utf8"), policy);
    expect(result.nonWorkspaceCount).toBeGreaterThan(100);
    expect(() =>
      validateDependencyBootstrapPolicy({
        ...contract,
        releaseCertification: {
          ...contract.releaseCertification,
          dependencyBootstrap: {
            ...policy,
            evidence: "release-evidence",
          },
        },
      })
    ).toThrow("canonical hard cut");
  });

  it("rejects missing integrity, noncanonical integrity, and a lock URL outside the exact JSR origin", () => {
    const source = readFileSync(resolve(repositoryRoot, "bun.lock"), "utf8");
    expect(() => validateLockfileIntegrity(source.replace(/, "sha512-[^"]+"\],/u, "],"), policy)).toThrow(
      "exact SHA-512 integrity",
    );
    expect(() => validateLockfileIntegrity(source.replace(/sha512-[A-Za-z0-9+/]+={0,2}/u, "sha512-AA=="), policy))
      .toThrow(
        "noncanonical SHA-512 integrity",
      );
    expect(() =>
      validateLockfileIntegrity(
        source.replace("https://npm.jsr.io/", "https://attacker.invalid/"),
        policy,
      )
    ).toThrow("registry allowlist");
    expect(() =>
      validateLockfileIntegrity(
        source.replace('"effect@4.0.0-rc.108"', '"github:effect-ts/effect#main"'),
        policy,
      )
    ).toThrow("non-registry locator");
    expect(() =>
      validateLockfileIntegrity(
        source.replace(
          '"effect-build@workspace:packages/effect-build"',
          '"effect-build@workspace:../../outside"',
        ),
        policy,
      )
    ).toThrow("unexpected lock authority");
  });

  it("executes exact Bun under a closed auth-free environment and empty user/global npm configuration", () => {
    const calls: Array<{
      args: readonly string[];
      command: string;
      environment: Readonly<Record<string, string>>;
      globalNpmrc: string;
      userNpmrc: string;
    }> = [];
    const spawn = vi.fn((command: string, args: readonly string[], options: {
      env: Readonly<Record<string, string>>;
    }) => {
      const environment = options.env;
      calls.push({
        args,
        command,
        environment,
        globalNpmrc: readFileSync(environment.NPM_CONFIG_GLOBALCONFIG!, "utf8"),
        userNpmrc: readFileSync(environment.NPM_CONFIG_USERCONFIG!, "utf8"),
      });
      if (args[0] === "--version") {
        return { error: undefined, signal: null, status: 0, stderr: "", stdout: "1.3.14\n" };
      }
      return { error: undefined, signal: null, status: 0 };
    });
    runFrozenReleaseDependencyBootstrap({
      repositoryRoot,
      environment: {
        HOME: "/hostile/home",
        HTTPS_PROXY: "https://attacker.invalid",
        NODE_AUTH_TOKEN: "secret",
        NODE_EXTRA_CA_CERTS: "/hostile/ca.pem",
        NODE_OPTIONS: "--require=/hostile/module.cjs",
        NPM_TOKEN: "secret",
        PATH: process.env.PATH,
      },
      spawn,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ command: "bun", args: ["--version"] });
    expect(calls[1]?.args).toEqual([
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      `--config=${resolve(repositoryRoot, "scripts/release/bunfig.release-bootstrap.toml")}`,
    ]);
    expect(Object.keys(calls[1]?.environment ?? {}).sort()).toEqual([
      "BUN_INSTALL_CACHE_DIR",
      "CI",
      "HOME",
      "LANG",
      "NPM_CONFIG_GLOBALCONFIG",
      "NPM_CONFIG_USERCONFIG",
      "PATH",
      "TMPDIR",
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
    ]);
    expect(calls[1]?.userNpmrc).toBe("");
    expect(calls[1]?.globalNpmrc).toBe("");
    expect(JSON.stringify(calls[1]?.environment)).not.toMatch(/secret|hostile|auth|proxy|extra_ca|node_options/iu);
  });

  it("fails closed if installation changes any source-controlled dependency authority", () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), "effect-build-bootstrap-test-"));
    try {
      for (const path of ["examples/example", "packages/example", "scripts/release", "tooling"]) {
        mkdirSync(resolve(temporaryRoot, path), { recursive: true });
      }
      writeFileSync(resolve(temporaryRoot, ".npmrc"), readFileSync(resolve(repositoryRoot, ".npmrc")));
      writeFileSync(
        resolve(temporaryRoot, "scripts/release/bunfig.release-bootstrap.toml"),
        readFileSync(resolve(repositoryRoot, "scripts/release/bunfig.release-bootstrap.toml")),
      );
      writeFileSync(resolve(temporaryRoot, "package.json"), '{"packageManager":"bun@1.3.14"}\n');
      writeFileSync(resolve(temporaryRoot, "packages/example/package.json"), "{}\n");
      writeFileSync(resolve(temporaryRoot, "examples/example/package.json"), "{}\n");
      writeFileSync(
        resolve(temporaryRoot, "tooling/effect-build-contract.json"),
        JSON.stringify({
          schema: "effect-build/combined-contract@1",
          releaseCertification: { dependencyBootstrap: policy },
        }),
      );
      const integrity = Buffer.alloc(64).toString("base64");
      const lockPath = resolve(temporaryRoot, "bun.lock");
      writeFileSync(
        lockPath,
        `{\n  "lockfileVersion": 1,\n  "packages": {\n    "fixture": ["fixture@1.0.0", "", {}, "sha512-${integrity}"],\n  }\n}\n`,
      );
      let invocation = 0;
      const spawn = vi.fn(() => {
        invocation += 1;
        if (invocation === 1) {
          return { error: undefined, signal: null, status: 0, stderr: "", stdout: "1.3.14\n" };
        }
        writeFileSync(lockPath, `${readFileSync(lockPath, "utf8")} `);
        return { error: undefined, signal: null, status: 0 };
      });
      expect(() =>
        runFrozenReleaseDependencyBootstrap({
          repositoryRoot: temporaryRoot,
          environment: { PATH: process.env.PATH },
          spawn,
        })
      ).toThrow("changed source-controlled authority bytes");
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it("is the only dependency-install entrypoint in every checkout-capable release workflow", () => {
    const workflows = [
      "apple-certification.yml",
      "release-certification.yml",
      "release-evidence-ingress.yml",
      "release-readiness.yml",
      "release-verification.yml",
      "release.yml",
    ];
    for (const workflow of workflows) {
      const source = readFileSync(resolve(repositoryRoot, `.github/workflows/${workflow}`), "utf8");
      expect(source.match(/node scripts\/release\/install-frozen-release-dependencies\.mjs/gu)).toHaveLength(1);
      expect(source).not.toContain("bun install --frozen-lockfile");
    }
  });
});
