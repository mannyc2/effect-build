import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(modulePath), "../..");

const expectedDependencyBootstrap = Object.freeze({
  protocol: "effect-build/checkout-dependency-bootstrap@1",
  client: {
    executable: "bun",
    version: "1.3.14",
  },
  lockfile: {
    path: "bun.lock",
    format: "bun-text-lockfile-v1",
    nonWorkspaceIntegrityAlgorithm: "sha512",
    nonWorkspaceIntegrityPattern: "^sha512-[A-Za-z0-9+/]+={0,2}$",
    requirement: "every-non-workspace-package-exact-integrity-required",
  },
  command: {
    arguments: ["install", "--frozen-lockfile", "--ignore-scripts"],
    lifecycleScripts: "forbidden",
  },
  registries: {
    default: "https://registry.npmjs.org",
    scopes: {
      "@jsr": "https://npm.jsr.io",
    },
  },
  environment: {
    home: "fresh-empty-private",
    cache: "fresh-empty-private",
    temporary: "fresh-empty-private",
    configuration: "exact-auth-free-project-npmrc-empty-user-global-npmrc-and-exact-bunfig",
    configurationFiles: {
      projectNpmrc: {
        path: ".npmrc",
        digest: "sha256:82952390ba119c39e2e495c5afdd42a45129f8ce49918f219eca7bcd6549c7d9",
      },
      bunfig: {
        path: "scripts/release/bunfig.release-bootstrap.toml",
        digest: "sha256:e5de342dbde5ef6b7eadaf1bba167f865a6ecf0d35c8d1ffdd0dbb0726d836b3",
      },
    },
    forbidden: "auth-proxy-extra-ca-node-options-and-host-home-config",
  },
  network: "lockfile-resolved-dependency-bootstrap-only",
  evidence: "never-release-evidence",
});

const sha256Digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const regularFileBytes = (path, label) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not one regular file`);
  return readFileSync(path);
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactPackageLocator =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const exactWorkspacePath = /^(?:examples|packages)\/[a-z0-9][a-z0-9._-]*$/u;

export const validateDependencyBootstrapPolicy = (contract) => {
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !sameJson(contract?.releaseCertification?.dependencyBootstrap, expectedDependencyBootstrap)
  ) throw new Error("combined contract dependency bootstrap is not the canonical hard cut");
  return contract.releaseCertification.dependencyBootstrap;
};

export const parseBunLockfilePackageRecords = (lockText) => {
  const lines = lockText.split("\n");
  const start = lines.indexOf('  "packages": {');
  const end = lines.indexOf("  }", start + 1);
  if (
    start < 0
    || end < 0
    || end !== lines.length - 3
    || lines[end + 1] !== "}"
    || lines.at(-1) !== ""
  ) {
    throw new Error("Bun lockfile packages table framing changed");
  }
  const records = [];
  for (const line of lines.slice(start + 1, end)) {
    if (line === "") continue;
    if (!/^    "(?:[^"\\]|\\.)+": \[.*\],$/u.test(line)) {
      throw new Error("Bun lockfile package record is not one canonical line");
    }
    let record;
    try {
      record = JSON.parse(`{${line.trim().slice(0, -1)}}`);
    } catch {
      throw new Error("Bun lockfile package record is not JSON-decodable");
    }
    const entries = Object.entries(record);
    if (entries.length !== 1 || !Array.isArray(entries[0][1])) {
      throw new Error("Bun lockfile package record shape changed");
    }
    records.push(entries[0]);
  }
  if (records.length === 0) throw new Error("Bun lockfile contains no package records");
  return records;
};

export const validateLockfileIntegrity = (lockText, policy = expectedDependencyBootstrap) => {
  if (typeof lockText !== "string" || !sameJson(policy, expectedDependencyBootstrap)) {
    throw new Error("Bun lockfile integrity policy is not canonical");
  }
  const integrityPattern = new RegExp(policy.lockfile.nonWorkspaceIntegrityPattern, "u");
  let nonWorkspaceCount = 0;
  const names = new Set();
  for (const [name, value] of parseBunLockfilePackageRecords(lockText)) {
    if (
      names.has(name)
      || !/^[A-Za-z0-9@._-]+(?:\/[A-Za-z0-9@._-]+)*$/u.test(name)
      || name.split("/").includes("..")
    ) throw new Error("Bun lockfile package identity is duplicated or noncanonical");
    names.add(name);
    const locator = value[0];
    if (typeof locator !== "string" || locator.length === 0) {
      throw new Error(`Bun lockfile package ${name} has no exact locator`);
    }
    const workspaceMarker = `${name}@workspace:`;
    if (locator.startsWith(workspaceMarker)) {
      const workspacePath = locator.slice(workspaceMarker.length);
      if (value.length !== 1 || !exactWorkspacePath.test(workspacePath)) {
        throw new Error(`workspace package ${name} has unexpected lock authority`);
      }
      continue;
    }
    if (
      !exactPackageLocator.test(locator)
      || value[2] === null
      || typeof value[2] !== "object"
      || Array.isArray(value[2])
    ) throw new Error(`Bun lockfile package ${name} has a non-registry locator or record shape`);
    nonWorkspaceCount += 1;
    const integrity = value.at(-1);
    if (typeof integrity !== "string" || !integrityPattern.test(integrity)) {
      throw new Error(`Bun lockfile package ${name} has no exact SHA-512 integrity`);
    }
    const encoded = integrity.slice("sha512-".length);
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.byteLength !== 64 || decoded.toString("base64") !== encoded) {
      throw new Error(`Bun lockfile package ${name} has noncanonical SHA-512 integrity`);
    }
    if (value.length !== 4) throw new Error(`Bun lockfile package ${name} has a noncanonical record shape`);
    const explicitUrl = value[1];
    if (explicitUrl !== "") {
      let parsed;
      try {
        parsed = new URL(explicitUrl);
      } catch {
        throw new Error(`Bun lockfile package ${name} has an invalid explicit URL`);
      }
      if (
        parsed.origin !== policy.registries.scopes["@jsr"]
        || parsed.username !== ""
        || parsed.password !== ""
        || parsed.port !== ""
        || parsed.search !== ""
        || parsed.hash !== ""
        || !parsed.pathname.startsWith("/~/11/@jsr/")
        || !parsed.pathname.endsWith(".tgz")
      ) throw new Error(`Bun lockfile package ${name} escapes the exact registry allowlist`);
    }
  }
  if (nonWorkspaceCount === 0) throw new Error("Bun lockfile has no integrity-bound external packages");
  return Object.freeze({ nonWorkspaceCount });
};

const manifestPaths = (repositoryRoot) => {
  const paths = ["package.json", "bun.lock", ".npmrc", "scripts/release/bunfig.release-bootstrap.toml"];
  for (const parent of ["packages", "examples"]) {
    const root = resolve(repositoryRoot, parent);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relative = `${parent}/${entry.name}/package.json`;
      if (existsSync(resolve(repositoryRoot, relative))) paths.push(relative);
    }
  }
  return paths.sort();
};

const authoritySnapshot = (repositoryRoot) => new Map(
  manifestPaths(repositoryRoot).map((path) => [
    path,
    sha256Digest(regularFileBytes(resolve(repositoryRoot, path), `dependency authority ${path}`)),
  ]),
);

const assertSameSnapshot = (repositoryRoot, before) => {
  const after = authoritySnapshot(repositoryRoot);
  if (!sameJson([...before], [...after])) throw new Error("dependency bootstrap changed source-controlled authority bytes");
};

const readContract = (repositoryRoot) => {
  try {
    return JSON.parse(readFileSync(resolve(repositoryRoot, "tooling/effect-build-contract.json"), "utf8"));
  } catch {
    throw new Error("generated combined contract is absent or invalid");
  }
};

const validateConfiguration = (repositoryRoot, policy) => {
  for (const [name, projection] of Object.entries(policy.environment.configurationFiles)) {
    const bytes = regularFileBytes(resolve(repositoryRoot, projection.path), `dependency configuration ${name}`);
    if (sha256Digest(bytes) !== projection.digest) {
      throw new Error(`dependency configuration ${name} bytes changed`);
    }
  }
  for (const forbidden of ["bunfig.toml", ".bunfig.toml"]) {
    if (existsSync(resolve(repositoryRoot, forbidden))) {
      throw new Error(`unadmitted project configuration ${forbidden} is present`);
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  } catch {
    throw new Error("workspace package manifest is invalid");
  }
  if (manifest?.packageManager !== `${policy.client.executable}@${policy.client.version}`) {
    throw new Error("workspace package manager declaration changed");
  }
};

const privateEnvironment = ({ environment, root, userNpmrc, globalNpmrc }) => Object.freeze({
  BUN_INSTALL_CACHE_DIR: resolve(root, "cache/bun"),
  CI: "true",
  HOME: resolve(root, "home"),
  LANG: "C.UTF-8",
  NPM_CONFIG_GLOBALCONFIG: globalNpmrc,
  NPM_CONFIG_USERCONFIG: userNpmrc,
  PATH: environment.PATH ?? "",
  TMPDIR: resolve(root, "temporary"),
  XDG_CACHE_HOME: resolve(root, "cache/xdg"),
  XDG_CONFIG_HOME: resolve(root, "configuration"),
});

export const runFrozenReleaseDependencyBootstrap = ({
  repositoryRoot = defaultRepositoryRoot,
  environment = process.env,
  spawn = spawnSync,
} = {}) => {
  const exactRoot = resolve(repositoryRoot);
  const contract = readContract(exactRoot);
  const policy = validateDependencyBootstrapPolicy(contract);
  validateConfiguration(exactRoot, policy);
  const lockText = readFileSync(resolve(exactRoot, policy.lockfile.path), "utf8");
  validateLockfileIntegrity(lockText, expectedDependencyBootstrap);
  const before = authoritySnapshot(exactRoot);
  const privateRoot = mkdtempSync(join(tmpdir(), "effect-build-dependency-bootstrap-"));
  try {
    for (const path of ["cache/bun", "cache/xdg", "configuration", "home", "temporary"]) {
      mkdirSync(resolve(privateRoot, path), { mode: 0o700, recursive: true });
    }
    const userNpmrc = resolve(privateRoot, "configuration/user.npmrc");
    const globalNpmrc = resolve(privateRoot, "configuration/global.npmrc");
    writeFileSync(userNpmrc, "", { encoding: "utf8", mode: 0o600 });
    writeFileSync(globalNpmrc, "", { encoding: "utf8", mode: 0o600 });
    const childEnvironment = privateEnvironment({
      environment,
      root: privateRoot,
      userNpmrc,
      globalNpmrc,
    });
    const version = spawn(policy.client.executable, ["--version"], {
      cwd: exactRoot,
      encoding: "utf8",
      env: childEnvironment,
      maxBuffer: 64 * 1024,
      shell: false,
      windowsHide: true,
    });
    if (
      version.error !== undefined
      || version.status !== 0
      || version.stderr !== ""
      || version.stdout !== `${policy.client.version}\n`
    ) throw new Error("exact Bun dependency-bootstrap client is unavailable");
    const install = spawn(policy.client.executable, [
      ...policy.command.arguments,
      `--config=${resolve(exactRoot, policy.environment.configurationFiles.bunfig.path)}`,
    ], {
      cwd: exactRoot,
      env: childEnvironment,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    if (install.error !== undefined || install.status !== 0 || install.signal !== null) {
      throw new Error("frozen dependency bootstrap failed");
    }
    assertSameSnapshot(exactRoot, before);
  } finally {
    rmSync(privateRoot, { force: true, recursive: true });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error("dependency bootstrap accepts no arguments");
  runFrozenReleaseDependencyBootstrap();
}
