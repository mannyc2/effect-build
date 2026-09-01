import { join } from "node:path";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const credentialKey = (key) => {
  const normalized = key.toLowerCase().replaceAll("_", "-");
  if (normalized === "auth-type") return false;
  return normalized.startsWith("//")
    || /(?:^|[:/.-])(?:-?auth(?:-?token)?|token|password|username|otp|cert|key)(?:$|[:/.-])/u.test(normalized);
};

const meaningful = (value) => value !== null
  && value !== undefined
  && value !== false
  && value !== ""
  && (!Array.isArray(value) || value.length !== 0);

const assertNoUrlUserinfo = (value, label) => {
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/https?:\/\/[^\s"']+/gu)) {
    let parsed;
    try {
      parsed = new URL(match[0]);
    } catch {
      throw new Error(`${label} contains a malformed registry URL`);
    }
    if (parsed.username !== "" || parsed.password !== "") {
      throw new Error(`${label} contains registry URL userinfo`);
    }
  }
};

const inspectConfig = (value, path = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectConfig(entry, [...path, `${index}`]));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (credentialKey(key) && meaningful(entry)) {
        throw new Error(`effective npm config contains registry credentials at ${[...path, key].join(".")}`);
      }
      inspectConfig(entry, [...path, key]);
    }
    return;
  }
  assertNoUrlUserinfo(value, `effective npm config ${path.join(".")}`);
};

export const assertCredentialFreeEffectiveNpmConfig = (config, expected) => {
  if (!isRecord(config) || !isRecord(expected)) throw new Error("effective npm config audit input is invalid");
  const exact = {
    registry: expected.registry,
    userconfig: expected.userConfig,
    globalconfig: expected.globalConfig,
    cache: expected.cacheRoot,
    prefix: expected.prefixRoot,
    "strict-ssl": true,
    proxy: null,
    "https-proxy": null,
    ca: null,
    cafile: null,
    cert: null,
    key: null,
    "node-options": null,
  };
  for (const [key, value] of Object.entries(exact)) {
    if (config[key] !== value) throw new Error(`effective npm config changed at ${key}`);
  }
  inspectConfig(config);
  return config;
};

export const credentialFreeConsumerPaths = ({ consumerRoot, consumerHome, cacheRoot }) => ({
  bunConfig: join(consumerRoot, "bunfig.toml"),
  cacheRoot,
  globalConfig: join(consumerRoot, "global.npmrc"),
  prefixRoot: join(consumerRoot, "prefix"),
  projectConfig: join(consumerRoot, ".npmrc"),
  userConfig: join(consumerHome, ".npmrc"),
});

export const buildCredentialFreeChildEnvironment = ({
  sourceEnvironment,
  forbiddenNames,
  consumerHome,
  paths,
  registry,
  runtime,
}) => {
  if (!isRecord(sourceEnvironment) || !Array.isArray(forbiddenNames)) {
    throw new Error("consumer environment policy is invalid");
  }
  if (runtime !== "node" && runtime !== "bun") throw new Error("consumer runtime is invalid");
  for (const name of forbiddenNames) {
    if (typeof sourceEnvironment[name] === "string") throw new Error(`consumer refuses ${name}`);
  }
  for (const [name, value] of Object.entries(sourceEnvironment)) {
    if (
      typeof value === "string"
      && (/^(?:npm_config_.*(?:auth|token|password|username|otp|cert|key)|bun_(?:auth_token|config_(?:token|username|password)))$/iu.test(name)
        || (/^(?:npm_config_registry|bun_config_registry)$/iu.test(name) && /https?:\/\/[^/\s]+@/u.test(value)))
    ) throw new Error(`consumer refuses preexisting registry authentication: ${name}`);
  }
  const environment = Object.fromEntries([
    "PATH",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "TZ",
  ].flatMap((name) => typeof sourceEnvironment[name] === "string" ? [[name, sourceEnvironment[name]]] : []));
  return {
    ...environment,
    CI: "true",
    HOME: consumerHome,
    NO_COLOR: "1",
    XDG_CONFIG_HOME: join(consumerHome, ".config"),
    npm_config_audit: "false",
    npm_config_cache: paths.cacheRoot,
    npm_config_fund: "false",
    npm_config_globalconfig: paths.globalConfig,
    npm_config_ignore_scripts: "true",
    npm_config_prefix: paths.prefixRoot,
    npm_config_progress: "false",
    npm_config_provenance: "false",
    npm_config_registry: registry,
    npm_config_strict_ssl: "true",
    npm_config_update_notifier: "false",
    npm_config_userconfig: paths.userConfig,
    ...(runtime === "bun" ? { BUN_INSTALL_CACHE_DIR: paths.cacheRoot } : {}),
  };
};
