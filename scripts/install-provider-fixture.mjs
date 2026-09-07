import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

// These are native platform packages, never the JavaScript launcher packages.
export const packageCoordinates = (name, platform, arch) => {
  if (!["bun", "deno", "esbuild"].includes(name)) throw new Error(`unknown native provider: ${name}`);
  if (!["darwin", "linux", "win32"].includes(platform) || !["x64", "arm64"].includes(arch)) {
    throw new Error(`no fixture package mapping for ${platform}-${arch}`);
  }
  const suffix = platform === "win32" ? ".exe" : "";
  const packageName = name === "bun"
    ? `@oven/bun-${platform === "win32" ? "windows" : platform}-${arch === "arm64" ? "aarch64" : arch}`
    : `@${name}/${platform}-${arch}${name === "deno" && platform === "linux" ? "-glibc" : ""}`;
  const relativeExecutable = name === "deno" || (name === "esbuild" && platform === "win32")
    ? `${name}${suffix}`
    : `bin/${name}${suffix}`;
  return { packageName, relativeExecutable };
};

// Deno publishes sha256sum output on Unix and Get-FileHash Format-List output on Windows.
export const parseDenortChecksum = (text, filename) => {
  const input = text.trim();
  const unix = /^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)$/u.exec(input);
  if (unix !== null && unix[2] === filename) return unix[1].toLowerCase();
  const windows =
    /^Algorithm[ \t]*:[ \t]*SHA256\r?\nHash[ \t]*:[ \t]*([a-fA-F0-9]{64})\r?\nPath[ \t]*:[ \t]*([^\r\n]+)$/u.exec(
      input,
    );
  if (windows !== null && win32.isAbsolute(windows[2]) && win32.basename(windows[2]) === filename) {
    return windows[1].toLowerCase();
  }
  throw new Error(`invalid official SHA256 checksum or archive filename for ${filename}`);
};

const main = async () => {
  const id = process.argv[2];
  const options = process.argv.slice(3);
  if (options.some((option) => option !== "--denort")) throw new Error("unknown provider fixture installer option");
  const contract = JSON.parse(readFileSync(new URL("../tooling/effect-build-contract.json", import.meta.url), "utf8"));
  const row = contract.exactToolEvidenceRegister.tools.find((candidate) => candidate.id === id);
  if (row === undefined || !["bun", "deno", "esbuild"].includes(row.name)) {
    throw new Error(`unknown native provider fixture: ${id}`);
  }
  const { platform, arch } = process;
  const suffix = platform === "win32" ? ".exe" : "";
  const { packageName, relativeExecutable } = packageCoordinates(row.name, platform, arch);
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), `${id}-`));
  // Install one exact native package without package lifecycle scripts or workspace mutations.
  execFileSync(process.execPath, [
    resolve("node_modules/npm/bin/npm-cli.js"),
    "install",
    "--prefix",
    directory,
    "--ignore-scripts",
    "--package-lock=false",
    "--no-audit",
    "--no-fund",
    `${packageName}@${row.version}`,
  ], { stdio: "inherit" });
  const executable = realpathSync(join(directory, "node_modules", packageName, relativeExecutable));
  const banner = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10_000 }).trim();
  const observed = row.name === "deno" ? /^deno (\S+)(?: |$)/u.exec(banner.split("\n")[0])?.[1] : banner;
  if (observed !== row.version) throw new Error(`${id} expected ${row.version}, received ${banner}`);
  const bindings = [
    `EFFECT_BUILD_TOOL_FIXTURE=${id}`,
    ...row.executableBindings.map((binding) => `${binding}=${executable}`),
  ];
  if (options.includes("--denort")) {
    if (
      row.name !== "deno" || row.denortFixtures?.matched === undefined || row.denortFixtures?.mismatched === undefined
    ) {
      throw new Error(`${id} has no reviewed denort pair fixtures`);
    }
    const target = `${arch === "arm64" ? "aarch64" : "x86_64"}-${
      platform === "darwin" ? "apple-darwin" : platform === "win32" ? "pc-windows-msvc" : "unknown-linux-gnu"
    }`;
    for (const [role, runtimeId] of Object.entries(row.denortFixtures)) {
      const runtime = contract.exactToolEvidenceRegister.tools.find((candidate) => candidate.id === runtimeId);
      if (runtime?.name !== "deno") throw new Error(`${runtimeId} is not an exact Deno runtime fixture`);
      const filename = `denort-${target}.zip`;
      const url = `https://github.com/denoland/deno/releases/download/v${runtime.version}/${filename}`;
      const checksumResponse = await fetch(`${url}.sha256sum`, { signal: AbortSignal.timeout(120_000) });
      if (!checksumResponse.ok) throw new Error(`denort checksum download failed: ${checksumResponse.status} ${url}`);
      const checksum = parseDenortChecksum(await checksumResponse.text(), filename);
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`denort archive download failed: ${response.status} ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
        throw new Error(`official denort archive checksum mismatch for ${runtimeId}`);
      }
      const runtimeDirectory = join(directory, runtimeId);
      mkdirSync(runtimeDirectory);
      const archive = join(runtimeDirectory, filename);
      writeFileSync(archive, bytes);
      if (platform === "win32") {
        execFileSync("pwsh", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Expand-Archive -LiteralPath $env:EFFECT_BUILD_DENORT_ARCHIVE -DestinationPath $env:EFFECT_BUILD_DENORT_DESTINATION",
        ], {
          env: {
            ...process.env,
            EFFECT_BUILD_DENORT_ARCHIVE: archive,
            EFFECT_BUILD_DENORT_DESTINATION: runtimeDirectory,
          },
          stdio: "inherit",
        });
      } else {
        execFileSync("unzip", ["-q", archive, "-d", runtimeDirectory], { stdio: "inherit" });
      }
      const runtimeExecutable = realpathSync(join(runtimeDirectory, `denort${suffix}`));
      if (platform !== "win32") chmodSync(runtimeExecutable, 0o755);
      // An unassembled denort cannot answer --version; the integration checks its assembled runtime identity.
      bindings.push(`EFFECT_BUILD_DENORT_${role.toUpperCase()}=${runtimeExecutable}`);
      console.log(JSON.stringify({
        fixture: runtimeId,
        url,
        archiveSha256: checksum,
        executableSha256: createHash("sha256").update(readFileSync(runtimeExecutable)).digest("hex"),
      }));
    }
  }
  if (process.env.GITHUB_ENV !== undefined) appendFileSync(process.env.GITHUB_ENV, `${bindings.join("\n")}\n`);
  console.log(bindings.join("\n"));
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
