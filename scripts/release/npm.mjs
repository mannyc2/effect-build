import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

export const resolveNpm = () =>
  process.env.NPM_CLI ?? resolve(
    execFileSync("npm", ["root", "--global"], { encoding: "utf8", shell: process.platform === "win32" }).trim(),
    "npm/bin/npm-cli.js",
  );

export const runNpm = (cli, args, { cwd, env = process.env } = {}) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env,
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => done({ status: -1, stdout, stderr: error.message }));
    child.on("close", (status) => done({ status, stdout, stderr }));
  });

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// npm dry-run permits missing credentials and catches failed OIDC exchanges. Exit zero alone is
// not an authentication check. This marker comes from the pinned CLI after a successful exchange.
export const authenticatedPreflight = (result) =>
  result.status === 0
  && result.stderr.includes("npm verbose oidc Successfully retrieved and set token");

export const createNpmAdapter = (
  { cwd, cli = resolveNpm(), registry = "https://registry.npmjs.org", env = process.env },
) => {
  const require = createRequire(cli);
  if (require("../package.json").version !== "11.11.0") throw new Error("release requires npm 11.11.0");
  const semver = require("semver");
  const run = (args) =>
    runNpm(cli, [
      ...args,
      "--registry",
      registry,
      "--json",
      "--prefer-online",
      "--fetch-retries=0",
      "--fetch-timeout=30000",
    ], { cwd, env });
  // npm view selects a version before returning fields: missing or malformed latest can produce
  // empty output or a synthetic E404. Read public registry documents directly instead.
  const read = async (path) => {
    try {
      const response = await fetch(`${registry.replace(/\/$/u, "")}/${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return { status: "absent" };
      if (!response.ok) return { status: "unknown" };
      return { status: "present", value: await response.json() };
    } catch {
      return { status: "unknown" };
    }
  };
  return {
    newerThan: (left, right) => semver.valid(left) !== null && semver.gt(left, right),
    viewVersion: async (name, version) => {
      const result = await read(encodeURIComponent(name));
      if (result.status !== "present") return result;
      const document = result.value;
      if (!isRecord(document) || document.name !== name || !isRecord(document.versions)) return { status: "unknown" };
      if (!Object.hasOwn(document.versions, version)) return { status: "absent" };
      const value = document.versions[version];
      return value?.name === name && value?.version === version
          && /^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value?.dist?.integrity ?? "")
        ? { status: "present", integrity: value.dist.integrity }
        : { status: "unknown" };
    },
    latestTag: async (name) => {
      const result = await read(`-/package/${encodeURIComponent(name)}/dist-tags`);
      if (result.status !== "present") return result;
      if (!isRecord(result.value)) return { status: "unknown" };
      if (!Object.hasOwn(result.value, "latest")) return { status: "absent" };
      return typeof result.value.latest === "string" && semver.valid(result.value.latest)
        ? { status: "present", version: result.value.latest }
        : { status: "unknown" };
    },
    publish: async (entry, { dryRun }) => {
      const result = await run([
        "publish",
        entry.tarball,
        "--provenance",
        "--access",
        "public",
        "--tag",
        "latest",
        "--ignore-scripts",
        ...(dryRun ? ["--dry-run", "--loglevel=verbose"] : []),
      ]);
      return { ok: dryRun ? authenticatedPreflight(result) : result.status === 0 };
    },
  };
};
