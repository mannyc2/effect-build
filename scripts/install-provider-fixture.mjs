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

const [name, version, output = process.env.RUNNER_TEMP ?? tmpdir(), ...extra] = process.argv.slice(2);
if (version === undefined || !/^\d+\.\d+\.\d+$/u.test(version) || extra.length > 0) {
  throw new Error("usage: node scripts/install-provider-fixture.mjs bun|deno x.y.z [output-directory]");
}
const { packageName, relativeExecutable } = packageCoordinates(name, process.platform, process.arch);
const metadata = await (await download(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${version}`)).json();
if (metadata.name !== packageName || metadata.version !== version) throw new Error("registry returned another package/version");
const integrity = /^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(metadata.dist?.integrity ?? "");
if (integrity === null) throw new Error(`missing SHA-512 registry integrity for ${packageName}@${version}`);
const archiveBytes = Buffer.from(await (await download(metadata.dist.tarball)).arrayBuffer());
if (createHash("sha512").update(archiveBytes).digest("base64") !== integrity[1]) {
  throw new Error(`archive checksum mismatch for ${packageName}@${version}`);
}
mkdirSync(resolve(output), { recursive: true });
const directory = mkdtempSync(join(resolve(output), `${name}-${version}-${process.platform}-${process.arch}-`));
try {
  const archive = join(directory, "package.tgz");
  writeFileSync(archive, archiveBytes);
  execFileSync("tar", ["-xzf", archive, "-C", directory], { stdio: "inherit" });
  rmSync(archive);
  const executable = realpathSync(join(directory, "package", relativeExecutable));
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  const banner = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10_000 }).trim();
  const observed = name === "deno" ? /^deno (\S+)/u.exec(banner)?.[1] : banner;
  if (observed !== version) throw new Error(`expected ${version}, received ${banner}`);
  console.log(executable);
} catch (error) {
  rmSync(directory, { recursive: true, force: true });
  throw error;
}
