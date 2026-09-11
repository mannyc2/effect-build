import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Download native packages directly: launcher packages need install scripts.
const packageCoordinates = (name, platform, arch) => {
  if (!["bun", "deno"].includes(name)) throw new Error(`unknown provider: ${name}`);
  if (!["darwin", "linux", "win32"].includes(platform) || !["x64", "arm64"].includes(arch)) {
    throw new Error(`no fixture package for ${platform}-${arch}`);
  }
  const suffix = platform === "win32" ? ".exe" : "";
  return name === "bun"
    ? {
      packageName: `@oven/bun-${platform === "win32" ? "windows" : platform}-${arch === "arm64" ? "aarch64" : arch}`,
      relativeExecutable: `bin/bun${suffix}`,
    }
    : {
      packageName: `@deno/${platform}-${arch}${platform === "linux" ? "-glibc" : ""}`,
      relativeExecutable: `deno${suffix}`,
    };
};

const download = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`download failed: ${response.status} ${url}`);
  return response;
};

// Official source-release digests: https://www.kernel.org/pub/software/scm/git/sha256sums.asc
const gitChecksums = {
  "2.40.0": "ab37c343c0ad097282fd311ab9ca521ab3da836e5c4ed2093994f1b7f8575b09",
  "2.55.0": "0842dc384a23ac33ba3e570c4f3a8ded85963ee4713b1cd21153c3db41813d1e",
};
const fixtureArchive = async (name, version) => {
  if (name === "git") {
    if (!["linux", "darwin"].includes(process.platform)) throw new Error("Git source fixtures require Linux or macOS");
    const digest = gitChecksums[version];
    if (digest === undefined) throw new Error(`no pinned Git source checksum for ${version}`);
    const bytes = Buffer.from(await (await download(`https://www.kernel.org/pub/software/scm/git/git-${version}.tar.gz`)).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error(`Git ${version} source checksum mismatch`);
    return { bytes, relativeExecutable: `git-${version}/git` };
  }
  const { packageName, relativeExecutable } = packageCoordinates(name, process.platform, process.arch);
  const metadata = await (await download(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${version}`)).json();
  if (metadata.name !== packageName || metadata.version !== version) throw new Error("registry returned another package/version");
  const integrity = /^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(metadata.dist?.integrity ?? "");
  if (integrity === null) throw new Error(`missing SHA-512 registry integrity for ${packageName}@${version}`);
  const bytes = Buffer.from(await (await download(metadata.dist.tarball)).arrayBuffer());
  if (createHash("sha512").update(bytes).digest("base64") !== integrity[1]) throw new Error(`archive checksum mismatch for ${packageName}@${version}`);
  return { bytes, relativeExecutable: `package/${relativeExecutable}` };
};

const [name, version, output = process.env.RUNNER_TEMP ?? tmpdir(), ...extra] = process.argv.slice(2);
if (version === undefined || !/^\d+\.\d+\.\d+$/u.test(version) || extra.length > 0) {
  throw new Error("usage: node scripts/install-provider-fixture.mjs bun|deno|git x.y.z [output-directory]");
}
const { bytes, relativeExecutable } = await fixtureArchive(name, version);
mkdirSync(resolve(output), { recursive: true });
const directory = mkdtempSync(join(resolve(output), `${name}-${version}-${process.platform}-${process.arch}-`));
try {
  const archive = join(directory, "package.tgz");
  writeFileSync(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "-C", directory], { stdio: "inherit" });
  rmSync(archive);
  if (name === "git") {
    // Only local repository built-ins are needed; omit network, GUI, and documentation dependencies.
    execFileSync("make", ["-j4", "git", "NO_CURL=YesPlease", "NO_EXPAT=YesPlease", "NO_GETTEXT=YesPlease", "NO_TCLTK=YesPlease", "NO_PERL=YesPlease", "NO_PYTHON=YesPlease", "NO_OPENSSL=YesPlease", "NO_RUST=YesPlease"], {
      cwd: join(directory, `git-${version}`), stdio: ["ignore", 2, 2], timeout: 600_000,
    });
  }
  const executable = realpathSync(join(directory, relativeExecutable));
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  const banner = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10_000 }).trim();
  const observed = name === "deno" ? /^deno (\S+)/u.exec(banner)?.[1] : name === "git" ? /^git version (\S+)/u.exec(banner)?.[1] : banner;
  if (observed !== version) throw new Error(`expected ${version}, received ${banner}`);
  console.log(executable);
} catch (error) {
  rmSync(directory, { recursive: true, force: true });
  throw error;
}
