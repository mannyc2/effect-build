import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { builtinModules, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { conclusion, infrastructure } from "./receipt.mjs";
import { requiredPath } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 300_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      code: typeof error.code === "number" ? error.code : null,
      signal: error.signal ?? null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const canonicalBuiltin = (specifier) => {
  if (!isBuiltin(specifier)) return undefined;
  return specifier.startsWith("node:") ? specifier : `node:${specifier}`;
};
const builtinSet = new Set(
  builtinModules.flatMap((value) => {
    const bare = value.startsWith("node:") ? value.slice(5) : value;
    return [bare, `node:${bare}`];
  }),
);

const classifyMetafile = (metafile) => {
  const observations = [];
  const seen = new Set();
  const add = (kind, specifier, disposition) => {
    const key = `${kind}:${specifier ?? "<dynamic>"}:${disposition}`;
    if (seen.has(key)) return;
    seen.add(key);
    observations.push({ kind, specifier, disposition });
  };
  const classify = (imported) => {
    const kind = imported.kind === "dynamic-import"
      ? "dynamic-import"
      : imported.kind === "require-call"
        ? "require"
        : imported.path?.endsWith(".json")
          ? "json"
          : "static-import";
    const specifier = typeof imported.path === "string" ? imported.path : null;
    const builtin = specifier === null ? undefined : canonicalBuiltin(specifier);
    if (imported.external === true) {
      if (specifier?.endsWith(".node") === true) {
        add(kind, specifier, "native-addon");
        return;
      }
      if (builtin !== undefined || (specifier !== null && builtinSet.has(specifier))) {
        add(kind, builtin ?? specifier, "builtin");
      } else if (specifier !== null && (specifier.startsWith(".") || specifier.startsWith("/"))) {
        add(kind, specifier, "unresolved-external");
      } else {
        add(kind, specifier, "package-external");
      }
      return;
    }
    add(kind, specifier, kind === "json" ? "json-bundled" : "bundled");
  };
  for (const input of Object.values(metafile.inputs ?? {})) {
    for (const imported of input.imports ?? []) classify(imported);
  }
  for (const output of Object.values(metafile.outputs ?? {})) {
    for (const imported of output.imports ?? []) classify(imported);
  }
  for (const inputPath of Object.keys(metafile.inputs ?? {})) {
    if (inputPath.endsWith(".json")) add("json", inputPath, "json-bundled");
  }
  return observations.sort((left, right) =>
    `${left.kind}:${left.specifier}:${left.disposition}`.localeCompare(
      `${right.kind}:${right.specifier}:${right.disposition}`,
    )
  );
};

const makeSource = async (root, format, inadmissible = false) => {
  const source = join(root, `${inadmissible ? "external" : "main"}-${format}.${format === "esm" ? "mts" : "cts"}`);
  if (inadmissible) {
    const body = format === "esm"
      ? `import packageValue from "fixture-package";
import missing from "./missing.js";
import addon from "./fixture.node";
const dynamicValue = await import("fixture-dynamic");
console.log(packageValue, missing, addon, dynamicValue);
`
      : `import packageValue from "fixture-package";
import missing from "./missing.js";
import addon from "./fixture.node";
void import("fixture-dynamic");
console.log(packageValue, missing, addon);
`;
    await writeFile(source, body);
    return source;
  }
  await writeFile(join(root, "data.json"), JSON.stringify({ value: "json" }));
  await writeFile(join(root, `chunk-${format}.ts`), `export const dynamicValue = "dynamic";\n`);
  const body = format === "esm"
    ? `import { basename } from "node:path";
import data from "./data.json";
const chunk = await import("./chunk-esm.ts");
await Promise.resolve();
console.log(JSON.stringify({ format: "esm", basename: basename("/a/b"), json: data.value, dynamic: chunk.dynamicValue, node: process.versions.node }));
`
    : `import { basename } from "node:path";
import data from "./data.json";
void import("./chunk-commonjs.ts").then((chunk) => {
  console.log(JSON.stringify({ format: "commonjs", basename: basename("/a/b"), json: data.value, dynamic: chunk.dynamicValue, node: process.versions.node }));
});
`;
  await writeFile(source, body);
  return source;
};

const buildBun = async ({ executable, source, output, format, inadmissible }) => {
  const metafilePath = `${output}.meta.json`;
  const result = await run(executable, [
    "build",
    source,
    "--target=node",
    `--format=${format === "esm" ? "esm" : "cjs"}`,
    "--packages=bundle",
    `--outfile=${output}`,
    `--metafile=${metafilePath}`,
    ...(inadmissible
      ? [
        "--external=fixture-package",
        "--external=fixture-dynamic",
        "--external=./missing.js",
        "--external=./fixture.node",
      ]
      : []),
  ], { cwd: dirname(source) });
  infrastructure(result.ok, `Bun Node-main build failed: ${result.stderr || result.message}`);
  return JSON.parse(await readFile(metafilePath, "utf8"));
};

const buildEsbuild = async ({ source, output, format, nodeVersion, inadmissible }) => {
  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    entryPoints: [source],
    bundle: true,
    platform: "node",
    format: format === "esm" ? "esm" : "cjs",
    target: `node${nodeVersion.split(".")[0]}`,
    outfile: output,
    metafile: true,
    packages: "bundle",
    external: inadmissible ? ["fixture-package", "fixture-dynamic", "./missing.js", "./fixture.node"] : [],
    write: true,
    logLevel: "silent",
  });
  return result.metafile;
};

const buildRolldown = async ({ source, output, format, inadmissible }) => {
  const externalRoot = await requiredPath("RESEARCH_EXTERNAL_NODE_MODULES");
  const rolldownPath = resolve(externalRoot, "rolldown/dist/index.mjs");
  const { rolldown } = await import(pathToFileURL(rolldownPath).href);
  const external = (specifier) =>
    builtinSet.has(specifier)
    || specifier === "fixture-package"
    || specifier === "fixture-dynamic"
    || specifier === "./missing.js"
    || specifier.endsWith("/missing.js")
    || specifier === "./fixture.node"
    || specifier.endsWith("/fixture.node");
  const parsedModules = new Map();
  const build = await rolldown({
    input: source,
    external,
    plugins: [{
      name: "effect-build-node-main-observer",
      moduleParsed(information) {
        parsedModules.set(information.id, {
          importedIds: [...information.importedIds],
          dynamicallyImportedIds: [...information.dynamicallyImportedIds],
        });
      },
    }],
  });
  try {
    const inputs = {};
    const observeInputs = () => {
      for (const [id, information] of parsedModules) {
      inputs[id] = {
        imports: [
          ...information.importedIds.map((specifier) => ({
            path: specifier,
            kind: "import-statement",
            external: external(specifier),
          })),
          ...information.dynamicallyImportedIds.map((specifier) => ({
            path: specifier,
            kind: "dynamic-import",
            external: external(specifier),
          })),
        ],
      };
      }
    };
    const generated = await build.write({
      file: output,
      format: format === "esm" ? "es" : "cjs",
      codeSplitting: false,
    });
    observeInputs();
    return {
      inputs,
      outputs: Object.fromEntries(
        generated.output
          .filter((item) => item.type === "chunk")
          .map((item) => [item.fileName, {
            imports: [
              ...item.imports.map((specifier) => ({
                path: specifier,
                kind: "import-statement",
                external: external(specifier),
              })),
              ...item.dynamicImports.map((specifier) => ({
                path: specifier,
                kind: "dynamic-import",
                external: external(specifier),
              })),
            ],
          }]),
      ),
    };
  } finally {
    await build.close();
  }
};

const buildProvider = (provider, input) => {
  switch (provider) {
    case "bun":
      return buildBun({ executable: selectedBun, ...input });
    case "esbuild":
      return buildEsbuild(input);
    case "rolldown":
      return buildRolldown(input);
    default:
      throw new Error(`unknown Node-main provider: ${provider}`);
  }
};

const observeFile = async (path) => {
  const bytes = await readFile(path);
  return { algorithm: "sha256", digest: sha256(bytes), bytes: bytes.byteLength, contents: bytes };
};

const makeCanonicalMain = async ({ provider, output, format, nodeVersion, imports, acquisition }) => {
  const initial = await observeFile(output);
  const acquire = acquisition === "bytes"
    ? async () => ({ ...initial, contents: Uint8Array.from(initial.contents) })
    : async () => observeFile(output);
  return {
    protocol: "effect-build/profile/node-main-program@1",
    provider,
    moduleFormat: format,
    runtimeTarget: { runtime: "node", version: nodeVersion, moduleResolution: "node" },
    syntaxCompatibility: {
      minimumNodeVersion: nodeVersion,
      testedNodeVersions: [nodeVersion],
      topLevelAwait: format === "esm" ? "supported" : "not-applicable",
      dynamicImport: "supported",
      jsonModules: format === "esm" ? "bundled" : "commonjs-require",
    },
    imports,
    identity: { algorithm: initial.algorithm, digest: initial.digest, bytes: initial.bytes },
    acquire,
    observations: [{ operation: "bundle-node-main", provider, protocol: "effect-build/profile/node-main-program@1" }],
  };
};

const inadmissibleImports = (main) => main.imports.filter((item) =>
  item.disposition === "package-external"
  || item.disposition === "unresolved-external"
  || item.disposition === "native-addon"
);

const assemble = async ({ nodeExecutable, main, destination, runtimeTarget, acquisition, interruptAt }) => {
  if (main.protocol !== "effect-build/profile/node-main-program@1") {
    return { ok: false, error: { _tag: "ProfileProtocolUnsupported" } };
  }
  if (
    main.runtimeTarget.runtime !== runtimeTarget.runtime
    || main.runtimeTarget.version !== runtimeTarget.version
  ) {
    return { ok: false, error: { _tag: "NodeTargetMismatch" } };
  }
  const external = inadmissibleImports(main);
  if (external.length > 0) return { ok: false, error: { _tag: "NodeExternalImportUnsupported", imports: external } };

  const snapshot = await main.acquire();
  if (snapshot.digest !== main.identity.digest || snapshot.bytes !== main.identity.bytes) {
    return {
      ok: false,
      error: {
        _tag: "NodeMainIdentityMismatch",
        expected: main.identity,
        observed: { algorithm: snapshot.algorithm, digest: snapshot.digest, bytes: snapshot.bytes },
      },
    };
  }
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const work = await mkdtemp(join(parent, ".effect-build-node-main-"));
  const privateMain = join(work, main.moduleFormat === "esm" ? "main.mjs" : "main.cjs");
  const staged = join(work, "executable");
  try {
    if (acquisition === "bytes") {
      await writeFile(privateMain, snapshot.contents);
    } else {
      await writeFile(privateMain, snapshot.contents);
    }
    const consumed = await observeFile(privateMain);
    if (consumed.digest !== main.identity.digest || consumed.bytes !== main.identity.bytes) {
      return { ok: false, error: { _tag: "NodeMainIdentityMismatch", expected: main.identity, observed: consumed } };
    }
    const config = join(work, "sea-config.json");
    await writeFile(config, `${JSON.stringify({
      main: privateMain,
      output: staged,
      mainFormat: main.moduleFormat === "esm" ? "module" : "commonjs",
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    }, null, 2)}\n`);
    const built = await run(nodeExecutable, ["--build-sea", config], { cwd: work, timeout: 600_000 });
    infrastructure(built.ok, `Node SEA assembly failed: ${built.stderr || built.message}`);
    if (process.platform === "darwin") {
      const repaired = await run("/usr/bin/codesign", ["--sign", "-", "--force", staged], { cwd: work });
      infrastructure(repaired.ok, `Node SEA ad-hoc correctness repair failed: ${repaired.stderr || repaired.message}`);
    }
    await chmod(staged, 0o755);
    if (interruptAt === "before-commit") {
      return { ok: false, error: { _tag: "PublicationInterruptedBeforeCommit", destination } };
    }
    await rename(staged, destination);
    const information = await stat(destination);
    const artifact = {
      path: destination,
      bytes: Number(information.size),
      runtime: runtimeTarget,
      observations: [
        ...main.observations,
        { operation: "assemble-node-main", provider: "effect-build-node-sea", protocol: "effect-build/profile/node-main-executable@1" },
      ],
      publication: { commitPoint: "atomic-file-replacement", committed: true },
    };
    if (interruptAt === "after-commit") {
      return { ok: false, error: { _tag: "PublicationInterruptedAfterCommit", artifact } };
    }
    return { ok: true, artifact };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
};

const executeArtifact = async (nodeVersion, path) => {
  const result = await run(path, [], { timeout: 120_000 });
  infrastructure(result.ok, `assembled executable failed: ${result.stderr || result.message}`);
  const value = JSON.parse(result.stdout.trim());
  conclusion(value.node === nodeVersion, `assembled executable used Node ${value.node}, expected ${nodeVersion}`);
  conclusion(value.basename === "b" && value.json === "json" && value.dynamic === "dynamic", "assembled Node main behavior changed");
  return value;
};

const selectedBun = await requiredPath("EFFECT_BUILD_BUN_BIN");
const node25 = await requiredPath("EFFECT_BUILD_NODE_25_BIN");
const node26 = await requiredPath("EFFECT_BUILD_NODE_26_BIN");
const nodes = [
  { version: "25.5.0", executable: node25, formats: ["commonjs"] },
  { version: "26.7.0", executable: node26, formats: ["esm", "commonjs"] },
];
const root = await mkdtemp(join(tmpdir(), "effect-build-node-main-canon-"));
export let nodeMainCanonResult;
try {
  const matrix = [];
  for (const provider of ["bun", "esbuild", "rolldown"]) {
    for (const format of ["esm", "commonjs"]) {
      const source = await makeSource(root, format, false);
      for (const node of nodes) {
        if (!node.formats.includes(format)) continue;
        const output = join(root, `${provider}-${format}-${node.version}.${format === "esm" ? "mjs" : "cjs"}`);
        const metafile = await buildProvider(provider, {
          source,
          output,
          format,
          nodeVersion: node.version,
          inadmissible: false,
        });
        const imports = classifyMetafile(metafile);
        conclusion(imports.some((item) => item.disposition === "builtin"), `${provider} ${format} did not classify a builtin`);
        conclusion(imports.some((item) => item.kind === "dynamic-import" && item.disposition === "bundled"), `${provider} ${format} did not classify bundled dynamic import`);
        conclusion(imports.some((item) => item.disposition === "json-bundled"), `${provider} ${format} did not classify bundled JSON`);
        for (const acquisition of ["bytes", "private-file"]) {
          const main = await makeCanonicalMain({
            provider: `effect-build-${provider}`,
            output,
            format,
            nodeVersion: node.version,
            imports,
            acquisition,
          });
          const destination = join(root, `app-${provider}-${format}-${node.version}-${acquisition}`);
          const assembled = await assemble({
            nodeExecutable: node.executable,
            main,
            destination,
            runtimeTarget: main.runtimeTarget,
            acquisition,
          });
          conclusion(
            assembled.ok === true,
            `${provider} ${format} ${node.version} ${acquisition} did not assemble: ${JSON.stringify(assembled.error)}`,
          );
          const execution = await executeArtifact(node.version, destination);
          conclusion(assembled.artifact.observations.length === 2, "producer and assembler observations were not concatenated");
          matrix.push({ provider, format, nodeVersion: node.version, acquisition, imports, execution });
        }
      }
    }
  }

  const externalRejections = [];
  for (const provider of ["bun", "esbuild", "rolldown"]) {
    for (const format of ["esm", "commonjs"]) {
      const source = await makeSource(root, format, true);
      const output = join(root, `external-${provider}-${format}.${format === "esm" ? "mjs" : "cjs"}`);
      const metafile = await buildProvider(provider, {
        source,
        output,
        format,
        nodeVersion: "26.7.0",
        inadmissible: true,
      });
      const imports = classifyMetafile(metafile);
      conclusion(imports.some((item) => item.disposition === "package-external"), `${provider} did not classify package external`);
      conclusion(imports.some((item) => item.disposition === "unresolved-external"), `${provider} did not classify unresolved external`);
      conclusion(imports.some((item) => item.disposition === "native-addon"), `${provider} did not classify native addon`);
      conclusion(imports.some((item) => item.kind === "dynamic-import" && item.disposition === "package-external"), `${provider} did not classify dynamic package external`);
      const main = await makeCanonicalMain({
        provider: `effect-build-${provider}`,
        output,
        format,
        nodeVersion: "26.7.0",
        imports,
        acquisition: "bytes",
      });
      const destination = join(root, `rejected-${provider}-${format}`);
      const rejected = await assemble({
        nodeExecutable: node26,
        main,
        destination,
        runtimeTarget: main.runtimeTarget,
        acquisition: "bytes",
      });
      conclusion(rejected.ok === false && rejected.error._tag === "NodeExternalImportUnsupported", `${provider} inadmissible external was accepted`);
      try {
        await access(destination);
        throw new Error("inadmissible external mutated output");
      } catch (error) {
        if (error instanceof Error && error.message === "inadmissible external mutated output") throw error;
      }
      externalRejections.push({ provider, format, imports, error: rejected.error });
    }
  }

  const mutationSource = await makeSource(root, "commonjs", false);
  const mutationOutput = join(root, "mutation-main.cjs");
  const mutationMetafile = await buildBun({
    executable: selectedBun,
    source: mutationSource,
    output: mutationOutput,
    format: "commonjs",
    inadmissible: false,
  });
  const borrowed = await makeCanonicalMain({
    provider: "effect-build-bun",
    output: mutationOutput,
    format: "commonjs",
    nodeVersion: "26.7.0",
    imports: classifyMetafile(mutationMetafile),
    acquisition: "private-file",
  });
  const captured = await makeCanonicalMain({
    provider: "effect-build-bun",
    output: mutationOutput,
    format: "commonjs",
    nodeVersion: "26.7.0",
    imports: classifyMetafile(mutationMetafile),
    acquisition: "bytes",
  });
  await writeFile(mutationOutput, "console.log('mutated')\n");
  const mutationDestination = join(root, "mutation-rejected");
  const mutationRejected = await assemble({
    nodeExecutable: node26,
    main: borrowed,
    destination: mutationDestination,
    runtimeTarget: borrowed.runtimeTarget,
    acquisition: "private-file",
  });
  conclusion(mutationRejected.ok === false && mutationRejected.error._tag === "NodeMainIdentityMismatch", "borrowed mutation was not authenticated");
  const capturedDestination = join(root, "captured-bytes-app");
  const capturedAssembled = await assemble({
    nodeExecutable: node26,
    main: captured,
    destination: capturedDestination,
    runtimeTarget: captured.runtimeTarget,
    acquisition: "bytes",
  });
  conclusion(capturedAssembled.ok === true, "atomic byte acquisition did not survive source mutation");
  await executeArtifact("26.7.0", capturedDestination);

  const targetDestination = join(root, "target-mismatch");
  const targetRejected = await assemble({
    nodeExecutable: node26,
    main: captured,
    destination: targetDestination,
    runtimeTarget: { runtime: "node", version: "25.5.0", moduleResolution: "node" },
    acquisition: "bytes",
  });
  conclusion(targetRejected.ok === false && targetRejected.error._tag === "NodeTargetMismatch", "Node target mismatch was accepted");

  const beforeDestination = join(root, "interrupted-before");
  const interruptedBefore = await assemble({
    nodeExecutable: node26,
    main: captured,
    destination: beforeDestination,
    runtimeTarget: captured.runtimeTarget,
    acquisition: "bytes",
    interruptAt: "before-commit",
  });
  conclusion(interruptedBefore.ok === false && interruptedBefore.error._tag === "PublicationInterruptedBeforeCommit", "before-commit interruption classification changed");
  let beforeExists = true;
  try {
    await access(beforeDestination);
  } catch {
    beforeExists = false;
  }
  conclusion(beforeExists === false, "before-commit interruption left a destination");

  const afterDestination = join(root, "interrupted-after");
  const interruptedAfter = await assemble({
    nodeExecutable: node26,
    main: captured,
    destination: afterDestination,
    runtimeTarget: captured.runtimeTarget,
    acquisition: "bytes",
    interruptAt: "after-commit",
  });
  conclusion(interruptedAfter.ok === false && interruptedAfter.error._tag === "PublicationInterruptedAfterCommit", "after-commit interruption classification changed");
  await executeArtifact("26.7.0", afterDestination);

  nodeMainCanonResult = {
    protocol: "effect-build/profile/node-main-program@1",
    executableProtocol: "effect-build/profile/node-main-executable@1",
    matrix,
    unsupportedCells: ["bun", "esbuild", "rolldown"].map((provider) => ({
      provider,
      format: "esm",
      nodeVersion: "25.5.0",
      reason: "Node 25.5 direct SEA predates module-format main support",
    })),
    externalRejections,
    mutation: {
      borrowed: mutationRejected.error,
      capturedBytesAssembled: capturedAssembled.ok,
    },
    targetMismatch: targetRejected.error,
    interruption: {
      beforeCommit: interruptedBefore.error,
      afterCommit: interruptedAfter.error,
    },
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
