import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const coreSource = join(repository, "packages", "effect-build", "src");
const adapterFixture = join(here, "staged-external-author-adapter-fixture.ts");
const effectSource = resolve(repository, "node_modules", "effect");
const scratch = await mkdtemp(join(tmpdir(), "effect-build-plan039-adapter-"));
const candidateDirectory = (() => {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return undefined;
  if (argv.length !== 2 || argv[0] !== "--candidate-dir" || !resolve(argv[1]).startsWith("/")) {
    throw new Error("usage: staged-external-author-adapter.mjs [--candidate-dir <absolute-directory>]");
  }
  return resolve(argv[1]);
})();

const exactContracts = [
  "effect-build/Author/BorrowedOutput",
  "effect-build/Author/Executable",
  "effect-build/Author/Tool",
].sort();
const implementationFiles = [
  "Artifact.ts",
  "SystemTarget.ts",
  "Matrix.ts",
  "Author/Tool.ts",
  "Author/BorrowedOutput.ts",
  "Author/Executable.ts",
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = (executable, argv, options = {}) =>
  execFileAsync(executable, argv, {
    cwd: options.cwd ?? repository,
    env: { ...process.env, LC_ALL: "C", ...options.env },
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
  });

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const pack = async (directory, destination) => {
  const result = await run("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: directory,
    env: { npm_config_cache: join(scratch, "npm-cache") },
  });
  const receipt = JSON.parse(result.stdout)[0];
  assert(receipt !== undefined && typeof receipt.filename === "string", "npm pack returned no artifact");
  return { path: join(destination, receipt.filename), receipt };
};

const makeCore = async (directory, version) => {
  await mkdir(directory, { recursive: true });
  const tsc = join(repository, "node_modules", "typescript", "bin", "tsc");
  await run(process.execPath, [
    tsc,
    "--ignoreConfig",
    "--declaration",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ESNext",
    "--lib",
    "ESNext,DOM",
    "--rootDir",
    coreSource,
    "--outDir",
    directory,
    ...implementationFiles.map((file) => join(coreSource, file)),
  ]);
  await writeJson(join(directory, "package.json"), {
    name: "effect-build",
    version,
    type: "module",
    exports: Object.fromEntries(["Tool", "BorrowedOutput", "Executable"].map((name) => [
      `./Author/${name}`,
      { types: `./Author/${name}.d.ts`, default: `./Author/${name}.js` },
    ])),
    files: ["Artifact.d.ts", "Artifact.js", "SystemTarget.d.ts", "SystemTarget.js", "Author"],
  });
};

const unpackCandidateCore = async (directory) => {
  if (candidateDirectory === undefined) return false;
  const tarball = join(candidateDirectory, "effect-build-0.4.0.tgz");
  await access(tarball);
  const result = await run("tar", ["-xOf", tarball, "package/package.json"]);
  const manifest = JSON.parse(result.stdout);
  assert(manifest.name === "effect-build" && manifest.version === "0.4.0", "candidate core tarball identity changed");
  const extracted = join(scratch, "candidate-core-extracted");
  await mkdir(extracted, { recursive: true });
  await run("tar", ["-xzf", tarball, "-C", extracted]);
  await cp(join(extracted, "package"), directory, { recursive: true });
  return tarball;
};

const makeAdapter = async (directory, core) => {
  const workspace = join(scratch, "adapter-compile");
  const workspaceModules = join(workspace, "node_modules");
  await mkdir(workspaceModules, { recursive: true });
  await cp(core, join(workspaceModules, "effect-build"), { recursive: true });
  await symlink(effectSource, join(workspaceModules, "effect"));
  await cp(adapterFixture, join(workspace, "index.ts"));
  await writeJson(join(workspace, "package.json"), { private: true, type: "module" });

  const tsc = join(repository, "node_modules", "typescript", "bin", "tsc");
  await run(process.execPath, [
    tsc,
    "--ignoreConfig",
    "--declaration",
    "--strict",
    "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ESNext",
    "--lib",
    "ESNext,DOM",
    "--rootDir",
    workspace,
    "--outDir",
    directory,
    join(workspace, "index.ts"),
  ]);
  await writeJson(join(directory, "package.json"), {
    name: "@fixture/plan039-external-author-adapter",
    version: "0.7.0",
    type: "module",
    exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    files: ["index.d.ts", "index.js"],
    peerDependencies: { "effect-build": ">=0.4.0 <0.5.0" },
  });
};

const packageCopies = async (rootDirectory, name) => {
  const copies = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name === name && directory.endsWith("node_modules")) {
        const metadata = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
        copies.push({ path, version: metadata.version });
      }
      await visit(path);
    }
  };
  await visit(rootDirectory);
  return copies.sort((left, right) => left.path.localeCompare(right.path));
};

try {
  const adapterFixtureSource = await readFile(adapterFixture, "utf8");
  const imports = [...adapterFixtureSource.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)]
    .map((match) => match[2])
    .filter((specifier) => specifier.startsWith("effect-build"));
  assert(
    [...new Set(imports)].sort().join("\n") === exactContracts.join("\n"),
    "adapter must import exactly the three Author contracts",
  );
  assert(!adapterFixtureSource.includes("/internal"), "adapter imported an internal path");

  const core040 = join(scratch, "core-0.4.0");
  const core041 = join(scratch, "core-0.4.1");
  const candidateCoreTarball = await unpackCandidateCore(core040);
  if (candidateCoreTarball === false) await makeCore(core040, "0.4.0");
  await cp(core040, core041, { recursive: true });
  const core041Manifest = JSON.parse(await readFile(join(core041, "package.json"), "utf8"));
  await writeJson(join(core041, "package.json"), { ...core041Manifest, version: "0.4.1" });

  const adapter = join(scratch, "adapter");
  await makeAdapter(adapter, core041);

  const packed = join(scratch, "packed");
  await mkdir(packed);
  const core040Packed = candidateCoreTarball === false
    ? await pack(core040, packed)
    : { path: candidateCoreTarball, receipt: undefined };
  const core041Packed = await pack(core041, packed);
  const adapterPacked = await pack(adapter, packed);
  assert(
    adapterPacked.receipt.files.map((file) => file.path).sort().join(",") === "index.d.ts,index.js,package.json",
    "adapter package contents changed",
  );

  const wrapper = join(scratch, "wrapper");
  await mkdir(wrapper);
  await writeJson(join(wrapper, "package.json"), {
    name: "@fixture/author-adapter-wrapper",
    version: "1.0.0",
    type: "module",
    exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    dependencies: {
      "effect-build": `file:${core041Packed.path}`,
      "@fixture/plan039-external-author-adapter": `file:${adapterPacked.path}`,
    },
  });
  await writeFile(
    join(wrapper, "index.js"),
    'export { externalAdapter } from "@fixture/plan039-external-author-adapter";\n',
  );
  await writeFile(join(wrapper, "index.d.ts"), 'export * from "@fixture/plan039-external-author-adapter";\n');
  const wrapperPacked = await pack(wrapper, packed);

  const consumer = join(scratch, "consumer");
  await mkdir(consumer);
  await writeJson(join(consumer, "package.json"), {
    name: "plan039-author-adapter-consumer",
    private: true,
    type: "module",
    dependencies: {
      effect: `file:${effectSource}`,
      "effect-build": `file:${core040Packed.path}`,
      "@fixture/author-adapter-wrapper": `file:${wrapperPacked.path}`,
    },
  });
  await writeFile(join(consumer, "index.mjs"), [
    'import { Effect } from "effect";',
    'import { ChildProcess } from "effect/unstable/process";',
    'import { externalAdapter } from "@fixture/author-adapter-wrapper";',
    'import { define } from "effect-build/Author/Tool";',
    "const command = externalAdapter.tool.command(['archive', 'tree'], { cwd: '/fixture/project' });",
    "console.log(JSON.stringify({",
    "  sameObjectAcrossCoreCopies: define(externalAdapter.tool) === externalAdapter.tool,",
    "  admission: Effect.runSync(externalAdapter.tool.evaluate({ operation: 'archive-tree' })),",
    "  refusal: Effect.runSync(Effect.match(externalAdapter.tool.evaluate({ operation: 'unknown' }), {",
    "    onFailure: (failure) => failure,",
    "    onSuccess: () => ({ _tag: 'UnexpectedSuccess' }),",
    "  })),",
    "  standardCommand: ChildProcess.isStandardCommand(command),",
    "  command: ChildProcess.isStandardCommand(command)",
    "    ? { executable: command.command, argv: command.args, cwd: command.options.cwd }",
    "    : null,",
    "  contracts: externalAdapter.contractSubpaths,",
    "}));",
    "",
  ].join("\n"));
  await writeFile(join(consumer, "typecheck.mts"), [
    'import type { Effect } from "effect";',
    'import type { ChildProcess } from "effect/unstable/process";',
    'import { externalAdapter, type FixtureRefusal } from "@fixture/author-adapter-wrapper";',
    'import type { Author as Borrowed } from "effect-build/Author/BorrowedOutput";',
    'import type { Author as Executable } from "effect-build/Author/Executable";',
    'import type { Admission, Definition } from "effect-build/Author/Tool";',
    'const tool: Definition<"fixture-archive-tool", { readonly operation: string }, FixtureRefusal> = externalAdapter.tool;',
    "const borrowed: Borrowed<FixtureRefusal> = externalAdapter.borrowedOutput;",
    "const executable: Executable<FixtureRefusal> = externalAdapter.executable;",
    'const evaluation: Effect.Effect<Admission, FixtureRefusal> = tool.evaluate({ operation: "archive-tree" });',
    'const command: ChildProcess.Command = tool.command(["archive", "tree"]);',
    "void [tool, borrowed, executable, evaluation, command];",
    "",
  ].join("\n"));
  await run("npm", [
    "install",
    "--offline",
    "--strict-peer-deps",
    "--install-strategy=nested",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ], { cwd: consumer, env: { npm_config_cache: join(scratch, "npm-cache") } });
  const effectManifest = JSON.parse(await readFile(join(consumer, "node_modules", "effect", "package.json"), "utf8"));
  assert(effectManifest.version === "4.0.0-rc.108", "adapter did not run against the pinned real Effect version");

  const copies = await packageCopies(join(consumer, "node_modules"), "effect-build");
  assert(copies.length === 2, `expected two core copies, received ${copies.length}`);
  assert(copies.map((copy) => copy.version).sort().join(",") === "0.4.0,0.4.1", "core skew versions changed");

  const runtime = JSON.parse((await run(process.execPath, [join(consumer, "index.mjs")], { cwd: consumer })).stdout);
  assert(runtime.sameObjectAcrossCoreCopies === true, "staged core used nominal object identity");
  assert(runtime.admission._tag === "ReviewedAdmission", "adapter admission changed");
  assert(runtime.refusal._tag === "FixtureOperationRefused", "adapter refusal changed");
  assert(runtime.standardCommand === true, "adapter did not return an official ChildProcess.Command");
  assert(runtime.command.executable === "/fixture/bin/archive", "adapter command executable changed");
  assert(runtime.command.argv.join(",") === "archive,tree", "adapter command arguments changed");
  assert(runtime.command.cwd === "/fixture/project", "adapter command options changed");
  assert(runtime.contracts.slice().sort().join("\n") === exactContracts.join("\n"), "adapter contract list changed");

  const tsc = join(repository, "node_modules", "typescript", "bin", "tsc");
  await run(process.execPath, [
    tsc,
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ESNext",
    join(consumer, "typecheck.mts"),
  ], { cwd: consumer });

  console.log(`EFFECT_BUILD_PLAN044_EXTERNAL_ADAPTER=${JSON.stringify({
    candidateCore: candidateCoreTarball !== false,
    coreCopies: copies.map(({ version }) => version),
    effect: effectManifest.version,
    imports: exactContracts,
    runtime: "passed",
    typecheck: "passed",
  })}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
