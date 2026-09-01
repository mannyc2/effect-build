import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error The credential-free consumer helper is an intentionally unprotected Node script module.
import * as credentialFreeConsumer from "../../scripts/release/credential-free-consumer.mjs";

const {
  assertCredentialFreeEffectiveNpmConfig,
  buildCredentialFreeChildEnvironment,
  credentialFreeConsumerPaths,
} = credentialFreeConsumer;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const registry = "https://registry.npmjs.org";

const fixture = () => {
  const consumerRoot = mkdtempSync(join(tmpdir(), "effect-build-consumer-config-test-"));
  const consumerHome = join(consumerRoot, "home");
  const cacheRoot = join(consumerRoot, "cache");
  const paths = credentialFreeConsumerPaths({ consumerRoot, consumerHome, cacheRoot });
  for (const directory of [consumerHome, cacheRoot, paths.prefixRoot]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  for (const file of [paths.projectConfig, paths.userConfig, paths.globalConfig, paths.bunConfig]) {
    writeFileSync(file, "", { mode: 0o600 });
  }
  const environment = buildCredentialFreeChildEnvironment({
    sourceEnvironment: {
      PATH: process.env.PATH,
      HOME: "/hostile/home",
      HTTPS_PROXY: "https://attacker.invalid:4443",
      NODE_EXTRA_CA_CERTS: "/hostile/extra-ca.pem",
      npm_config_color: "always",
    },
    forbiddenNames: ["NPM_TOKEN", "NODE_AUTH_TOKEN"],
    consumerHome,
    paths,
    registry,
    runtime: "node",
  });
  return { consumerRoot, consumerHome, paths, environment };
};

const effectiveNpmConfig = ({ consumerRoot, environment }: ReturnType<typeof fixture>) => {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["config", "list", "--json"], {
    cwd: consumerRoot,
    encoding: "utf8",
    env: environment,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error("fixture npm config audit failed");
  return JSON.parse(result.stdout);
};

describe("credential-free registry consumer", () => {
  it("isolates every npm config layer and ignores ambient home, proxy, and CA state", () => {
    const input = fixture();
    try {
      expect(input.environment).not.toHaveProperty("HTTPS_PROXY");
      expect(input.environment).not.toHaveProperty("NODE_EXTRA_CA_CERTS");
      expect(input.environment).not.toHaveProperty("npm_config_color");
      expect(input.environment.HOME).toBe(input.consumerHome);
      expect(input.environment.npm_config_userconfig).toBe(input.paths.userConfig);
      expect(input.environment.npm_config_globalconfig).toBe(input.paths.globalConfig);
      expect(input.environment.npm_config_prefix).toBe(input.paths.prefixRoot);
      expect(input.environment.npm_config_registry).toBe(registry);
      const config = effectiveNpmConfig(input);
      expect(() =>
        assertCredentialFreeEffectiveNpmConfig(config, {
          registry,
          userConfig: input.paths.userConfig,
          globalConfig: input.paths.globalConfig,
          cacheRoot: input.paths.cacheRoot,
          prefixRoot: input.paths.prefixRoot,
        })
      ).not.toThrow();
    } finally {
      rmSync(input.consumerRoot, { recursive: true, force: true });
    }
  });

  it("rejects preexisting credential environment variables before constructing a child", () => {
    const input = fixture();
    try {
      for (
        const sourceEnvironment of [
          { PATH: process.env.PATH, NPM_TOKEN: "fixture" },
          { PATH: process.env.PATH, npm_config_auth_token: "fixture" },
          { PATH: process.env.PATH, BUN_CONFIG_TOKEN: "fixture" },
          { PATH: process.env.PATH, npm_config_registry: "https://fixture@registry.npmjs.org" },
        ]
      ) {
        expect(() =>
          buildCredentialFreeChildEnvironment({
            sourceEnvironment,
            forbiddenNames: ["NPM_TOKEN"],
            consumerHome: input.consumerHome,
            paths: input.paths,
            registry,
            runtime: "node",
          })
        ).toThrow();
      }
    } finally {
      rmSync(input.consumerRoot, { recursive: true, force: true });
    }
  });

  it("rejects scoped credentials and transport overrides found by the effective-config audit", () => {
    const input = fixture();
    const expected = {
      registry,
      userConfig: input.paths.userConfig,
      globalConfig: input.paths.globalConfig,
      cacheRoot: input.paths.cacheRoot,
      prefixRoot: input.paths.prefixRoot,
    };
    try {
      const base = effectiveNpmConfig(input);
      for (
        const mutate of [
          (value: Record<string, unknown>) => value["//registry.npmjs.org/:_authToken"] = "(protected)",
          (value: Record<string, unknown>) => value.proxy = "https://proxy.invalid",
          (value: Record<string, unknown>) => value.cafile = "/tmp/hostile-ca.pem",
          (value: Record<string, unknown>) => value.registry = "https://fixture@registry.npmjs.org",
          (value: Record<string, unknown>) => value.globalconfig = "/etc/npmrc",
        ]
      ) {
        const changed = structuredClone(base);
        mutate(changed);
        expect(() => assertCredentialFreeEffectiveNpmConfig(changed, expected)).toThrow();
      }
    } finally {
      rmSync(input.consumerRoot, { recursive: true, force: true });
    }
  });

  it("audits immediately before and after both exact installer paths", () => {
    const source = readFileSync(resolve(root, "scripts/test-built-consumer.mjs"), "utf8");
    expect([...source.matchAll(/await auditNpmConfig\(\);/gu)]).toHaveLength(2);
    expect(source).toContain('"--globalconfig",\n        paths.globalConfig');
    expect(source).toContain('"--config",\n        paths.bunConfig');
    expect(source).toContain('"--ignore-scripts"');
    expect(source).toContain("consumer configuration mutated during install");
  });
});
