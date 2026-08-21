import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { conclusion, infrastructure } from "./receipt.mjs";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const adapterSource = join(here, "fixtures", "external-author-adapter");
const root = await mkdtemp(join(tmpdir(), "effect-build-author-adapter-"));

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
    env: { npm_config_cache: join(root, "npm-cache") },
  });
  const receipt = JSON.parse(result.stdout)[0];
  infrastructure(receipt !== undefined && typeof receipt.filename === "string", "npm pack returned no artifact");
  return { path: join(destination, receipt.filename), receipt };
};

const packageCopies = async (rootDirectory, name) => {
  const output = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name === name && directory.endsWith("node_modules")) {
        const metadata = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
        output.push({ path, version: metadata.version });
      }
      await visit(path);
    }
  };
  await visit(rootDirectory);
  return output.sort((left, right) => left.path.localeCompare(right.path));
};

const makeCore = async (directory, version) => {
  const author = join(directory, "Author");
  await mkdir(author, { recursive: true });
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
    join(here, "author"),
    "--outDir",
    author,
    join(here, "author", "Tool.ts"),
    join(here, "author", "BorrowedOutput.ts"),
    join(here, "author", "Executable.ts"),
  ]);
  const exports = Object.fromEntries(["Tool", "BorrowedOutput", "Executable"].map((name) => [
    `./Author/${name}`,
    { types: `./Author/${name}.d.ts`, default: `./Author/${name}.js` },
  ]));
  await writeJson(join(directory, "package.json"), {
    name: "effect-build",
    version,
    type: "module",
    exports,
    files: ["Author"],
  });
};

const makeEffectTypeStub = async (application) => {
  const directory = join(application, "node_modules", "effect");
  await mkdir(join(directory, "unstable"), { recursive: true });
  await writeJson(join(directory, "package.json"), {
    name: "effect",
    version: "4.0.0-fixture",
    type: "module",
    exports: {
      ".": { types: "./index.d.ts" },
      "./unstable/process": { types: "./unstable/process.d.ts" },
    },
  });
  await writeFile(join(directory, "index.d.ts"), [
    "export namespace Effect { export interface Effect<A, E = never, R = never> { readonly _A?: A; readonly _E?: E; readonly _R?: R } }",
    "export namespace Scope { export interface Scope { readonly Scope: unique symbol } }",
    "",
  ].join("\n"));
  await writeFile(join(directory, "unstable", "process.d.ts"), [
    "export namespace ChildProcess {",
    "  export interface CommandOptions { readonly cwd?: string }",
    "  export interface Command { readonly _tag?: string }",
    "}",
    "",
  ].join("\n"));
};

try {
  const adapterRuntime = await readFile(join(adapterSource, "index.js"), "utf8");
  const importSpecifiers = [...adapterRuntime.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  const exactContracts = [
    "effect-build/Author/Tool",
    "effect-build/Author/BorrowedOutput",
    "effect-build/Author/Executable",
  ].sort();
  conclusion([...new Set(importSpecifiers)].sort().join("\n") === exactContracts.join("\n"), "adapter imported outside the three Author contracts");
  conclusion(!adapterRuntime.includes("/internal") && !adapterRuntime.includes("packages/"), "adapter imported a first-party internal path");

  const core040 = join(root, "core-0.4.0");
  const core041 = join(root, "core-0.4.1");
  await makeCore(core040, "0.4.0");
  await cp(core040, core041, { recursive: true });
  const core041Json = JSON.parse(await readFile(join(core041, "package.json"), "utf8"));
  await writeJson(join(core041, "package.json"), { ...core041Json, version: "0.4.1" });

  const packed = join(root, "packed");
  await mkdir(packed, { recursive: true });
  const core040Packed = await pack(core040, packed);
  const core041Packed = await pack(core041, packed);
  const adapterPacked = await pack(adapterSource, packed);
  const packedAdapterFiles = adapterPacked.receipt.files.map((file) => file.path).sort();
  conclusion(packedAdapterFiles.join(",") === "index.d.ts,index.js,package.json", "adapter pack contents changed");

  const wrapper = join(root, "wrapper");
  await mkdir(wrapper);
  await writeJson(join(wrapper, "package.json"), {
    name: "@fixture/author-adapter-wrapper",
    version: "1.0.0",
    type: "module",
    exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    dependencies: {
      "effect-build": `file:${core041Packed.path}`,
      "@fixture/external-author-adapter": `file:${adapterPacked.path}`,
    },
  });
  await writeFile(join(wrapper, "index.js"), 'export { externalAdapter } from "@fixture/external-author-adapter";\n');
  await writeFile(join(wrapper, "index.d.ts"), 'export * from "@fixture/external-author-adapter";\n');
  const wrapperPacked = await pack(wrapper, packed);

  const application = join(root, "consumer");
  await mkdir(application);
  await writeJson(join(application, "package.json"), {
    name: "author-adapter-consumer",
    private: true,
    type: "module",
    dependencies: {
      "effect-build": `file:${core040Packed.path}`,
      "@fixture/author-adapter-wrapper": `file:${wrapperPacked.path}`,
    },
  });
  const runtimeConsumer = [
    'import { externalAdapter } from "@fixture/author-adapter-wrapper";',
    'import { define } from "effect-build/Author/Tool";',
    "const result = {",
    "  sameObjectAcrossCoreCopies: define(externalAdapter.tool) === externalAdapter.tool,",
    "  admission: externalAdapter.tool.evaluate({ operation: \"archive-tree\" }),",
    "  refusal: externalAdapter.tool.evaluate({ operation: \"unknown\" }),",
    "  contracts: externalAdapter.contractSubpaths,",
    "  participant: externalAdapter.tool.observation.participants[0],",
    "};",
    "console.log(JSON.stringify(result));",
    "",
  ].join("\n");
  await writeFile(join(application, "index.mjs"), runtimeConsumer);
  await writeFile(join(application, "typecheck.mts"), [
    'import { externalAdapter, type FixtureRefusal } from "@fixture/author-adapter-wrapper";',
    'import type { Author as Borrowed } from "effect-build/Author/BorrowedOutput";',
    'import type { Author as Executable } from "effect-build/Author/Executable";',
    'import type { Definition } from "effect-build/Author/Tool";',
    'const tool: Definition<"fixture-archive-tool", { readonly operation: string }, unknown> = externalAdapter.tool;',
    "const borrowed: Borrowed<FixtureRefusal> = externalAdapter.borrowedOutput;",
    "const executable: Executable<FixtureRefusal> = externalAdapter.executable;",
    "void [tool, borrowed, executable];",
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
  ], {
    cwd: application,
    env: { npm_config_cache: join(root, "npm-cache") },
  });
  await makeEffectTypeStub(application);
  const coreCopies = await packageCopies(join(application, "node_modules"), "effect-build");
  conclusion(coreCopies.length === 2, `expected two independently installed core copies, received ${coreCopies.length}`);
  conclusion(coreCopies.map((copy) => copy.version).sort().join(",") === "0.4.0,0.4.1", "core skew fixture versions changed");

  const runtime = JSON.parse((await run(process.execPath, [join(application, "index.mjs")], { cwd: application })).stdout);
  conclusion(runtime.sameObjectAcrossCoreCopies === true, "root core rejected the nested adapter object by nominal identity");
  conclusion(runtime.admission._tag === "ReviewedAdmission", "external adapter admission changed");
  conclusion(runtime.refusal._tag === "FixtureOperationRefused", "external adapter refusal changed");
  conclusion(runtime.contracts.slice().sort().join("\n") === exactContracts.join("\n"), "adapter runtime contract list changed");

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
    join(application, "typecheck.mts"),
  ], { cwd: application });

  console.log(`EFFECT_BUILD_EXTERNAL_AUTHOR_ADAPTER=${JSON.stringify({
    adapter: "@fixture/external-author-adapter@0.7.0",
    imports: exactContracts,
    packedFiles: packedAdapterFiles,
    coreCopies,
    typecheck: "passed",
    runtime,
  })}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
