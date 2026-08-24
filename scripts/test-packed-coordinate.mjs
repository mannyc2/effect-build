import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execute = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const allowedPackages = [
  "effect-build",
  "effect-build-apple",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
  "effect-build-rolldown",
];
const allowedEffects = ["4.0.0-beta.104", "4.0.0-rc.108"];

const args = Object.create(null);
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || value === undefined) throw new Error("expected --name value arguments");
  args[name.slice(2)] = value;
}
const packageName = args.package;
const effectVersion = args.effect;
const certificationHost = args.host;
const receipt = args.receipt;
if (!allowedPackages.includes(packageName) || !allowedEffects.includes(effectVersion) || certificationHost === undefined) {
  throw new Error("package, effect, and host must identify one frozen packed-consumer coordinate");
}

const packedManifest = async (tarball) => {
  const archive = gunzipSync(await readFile(tarball));
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").replace(/\0.*$/u, "");
    const size = Number.parseInt(archive.subarray(offset + 124, offset + 136).toString("utf8").trim() || "0", 8);
    if (name === "package/package.json") {
      return JSON.parse(archive.subarray(offset + record, offset + record + size).toString("utf8"));
    }
    offset += Math.ceil(size / record) * record;
  }
  throw new Error(`package/package.json not found in ${tarball}`);
};

const work = await mkdtemp(join(tmpdir(), "effect-build-packed-coordinate-"));
try {
  const tarballRoot = join(work, "tarballs");
  await mkdir(tarballRoot);
  const names = packageName === "effect-build" ? [packageName] : ["effect-build", packageName];
  const tarballs = {};
  for (const name of names) {
    const packed = await execute("bun", ["pm", "pack", "--destination", tarballRoot], {
      cwd: join(root, "packages", name),
    });
    const filename = packed.stdout.split("\n").find((line) => line.trim().endsWith(".tgz"));
    if (filename === undefined) throw new Error(`bun pm pack returned no tarball for ${name}`);
    const tarball = join(tarballRoot, filename.trim().split(/[\\/]/u).at(-1));
    const manifest = await packedManifest(tarball);
    for (const [dependency, specifier] of Object.entries(manifest.dependencies ?? {})) {
      if (/^(?:workspace:|catalog:|file:|link:|portal:)/u.test(specifier)) {
        throw new Error(`${name} packed unresolved dependency ${dependency}: ${specifier}`);
      }
    }
    tarballs[name] = tarball;
  }
  const workspace = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(join(work, "package.json"), `${JSON.stringify({
    name: "effect-build-packed-coordinate",
    private: true,
    type: "module",
    dependencies: {
      effect: effectVersion,
      "effect-build": tarballs["effect-build"],
      ...(packageName === "effect-build" ? {} : { [packageName]: tarballs[packageName] }),
    },
    devDependencies: { typescript: workspace.devDependencies.typescript },
  }, null, 2)}\n`);
  await writeFile(join(work, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      target: "es2022",
      lib: ["esnext"],
      strict: true,
      noEmit: false,
      outDir: "dist",
      skipLibCheck: true,
    },
    include: ["main.ts"],
  }, null, 2)}\n`);
  await writeFile(
    join(work, "main.ts"),
    `import { Effect } from "effect";\nimport * as Candidate from "${packageName}";\nvoid Effect.succeed(undefined);\nvoid Candidate;\n`,
  );
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const options = {
    cwd: work,
    shell: process.platform === "win32",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  };
  await execute(npm, ["install", "--no-audit", "--no-fund", "--strict-peer-deps", "--install-strategy=nested"], options);
  await execute(npm, ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], options);
  await execute("node", [join(work, "dist", "main.js")], { cwd: work });
  const runtime = await execute(
    "node",
    ["--input-type=module", "-e", `import * as Candidate from "${packageName}"; process.stdout.write(JSON.stringify({ exports: Object.keys(Candidate).sort() }))`],
    { cwd: work },
  );
  const report = JSON.parse(runtime.stdout.trim());
  if (!Array.isArray(report.exports) || report.exports.length === 0) throw new Error("packed package root exports are empty");
  if (receipt !== undefined) {
    const destination = resolve(receipt);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify({ package: packageName, effect: effectVersion, certificationHost })}\n`, {
      flag: "wx",
    });
  }
  process.stdout.write(`packed coordinate passed: ${packageName} / Effect ${effectVersion} / ${certificationHost}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
