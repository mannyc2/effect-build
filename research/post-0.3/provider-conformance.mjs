import { NodeServices } from "@effect/platform-node";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import * as BunProvider from "effect-build-bun";
import * as DenoProvider from "effect-build-deno";
import * as EsbuildProvider from "effect-build-esbuild";

const execFileAsync = promisify(execFile);
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = {};

const requiredExecutable = async (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0 || !isAbsolute(value)) {
    throw new Error(`${name} must be an absolute executable path`);
  }
  await access(value);
  return value;
};

const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 120_000,
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

const filesRecursively = async (root) => {
  const output = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  };
  await visit(root);
  return output.sort();
};

const manifest = async (root) => Promise.all(
  (await filesRecursively(root)).map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: relative(root, path).replaceAll("\\", "/"),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  }),
);

const outputReferencesExist = async (root) => {
  const htmlFiles = (await filesRecursively(root)).filter((path) => path.endsWith(".html"));
  if (htmlFiles.length === 0) return false;
  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    const references = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((match) => match[1]);
    for (const reference of references) {
      if (/^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
      const candidate = reference.startsWith("/")
        ? resolve(root, reference.slice(1))
        : resolve(dirname(htmlPath), reference);
      try {
        const information = await stat(candidate);
        if (!information.isFile()) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
};

const executeJson = async (nodeExecutable, path, imported = false) => {
  const result = imported
    ? await run(nodeExecutable, ["-e", "import(process.argv[1])", path])
    : await run(nodeExecutable, [path]);
  if (!result.ok) throw new Error(`Node execution failed: ${result.stderr || result.message}`);
  return JSON.parse(result.stdout.trim());
};

const compareNodeMainProfile = async ({ root, selectedBun, nodeExecutable }) => {
  const entrypoint = join(root, "node-main-entry.mjs");
  const dependency = join(root, "node-main-dependency.cjs");
  await writeFile(dependency, 'module.exports = { value: "shared" };\n');
  await writeFile(
    entrypoint,
    'import dependency from "./node-main-dependency.cjs"; console.log(JSON.stringify({ role: import.meta.main ? "main" : "imported", value: dependency.value }));\n',
  );

  const observe = (provider) => {
    let escapedPath = "";
    const operation = provider === "bun"
      ? BunProvider.withJavaScriptBundle(
        { entrypoint, format: "esm", cwd: root },
        (program) => Effect.promise(async () => {
          escapedPath = program.path;
          return {
            direct: await executeJson(nodeExecutable, program.path),
            imported: await executeJson(nodeExecutable, program.path, true),
            metadata: {
              format: program.format,
              resolutionTarget: program.resolutionTarget,
              externalImports: program.observedExternalImports,
            },
          };
        }),
      ).pipe(
        Effect.provide(BunProvider.layer({ executable: selectedBun })),
        Effect.provide(NodeServices.layer),
      )
      : EsbuildProvider.withJavaScriptBundle(
        { entrypoint, format: "esm", cwd: root },
        (program) => Effect.promise(async () => {
          escapedPath = program.path;
          return {
            direct: await executeJson(nodeExecutable, program.path),
            imported: await executeJson(nodeExecutable, program.path, true),
            metadata: {
              format: program.format,
              resolutionTarget: program.resolutionTarget,
              externalImports: program.observedExternalImports,
            },
          };
        }),
      ).pipe(
        Effect.provide(EsbuildProvider.layer),
        Effect.provide(NodeServices.layer),
      );

    return Effect.runPromise(operation).then(async (value) => {
      let removed = false;
      try {
        await access(escapedPath);
      } catch {
        removed = true;
      }
      return { ...value, removedAfterCallback: removed };
    });
  };

  const bun = await observe("bun");
  const esbuild = await observe("esbuild");
  return {
    candidate: "NodeMainProgram",
    directMainConforms: JSON.stringify(bun.direct) === JSON.stringify(esbuild.direct),
    importableModuleConforms: JSON.stringify(bun.imported) === JSON.stringify(esbuild.imported),
    bun,
    esbuild,
    conclusion:
      JSON.stringify(bun.direct) === JSON.stringify(esbuild.direct)
      && JSON.stringify(bun.imported) !== JSON.stringify(esbuild.imported)
        ? "narrow-main-role-valid-broad-importable-role-falsified"
        : "unexpected-result",
  };
};

const compareRuntimeExecutables = async ({ root, selectedBun, selectedDeno }) => {
  const entrypoint = join(root, "runtime-executable.ts");
  await writeFile(
    entrypoint,
    'const runtime = typeof Bun !== "undefined" ? "bun" : typeof Deno !== "undefined" ? "deno" : "node"; console.log(JSON.stringify({ runtime }));\n',
  );
  const bunOut = join(root, "runtime-bun");
  const denoOut = join(root, "runtime-deno");

  const bunArtifact = await Effect.runPromise(
    BunProvider.compileExecutable({ entrypoint, outfile: bunOut }).pipe(
      Effect.provide(BunProvider.layer({ executable: selectedBun })),
      Effect.provide(NodeServices.layer),
    ),
  );
  const denoArtifact = await Effect.runPromise(
    DenoProvider.compileExecutable({ entrypoint, outfile: denoOut }).pipe(
      Effect.provide(DenoProvider.layer({ executable: selectedDeno })),
      Effect.provide(NodeServices.layer),
    ),
  );

  const bunRun = await run(bunArtifact.path, []);
  const denoRun = await run(denoArtifact.path, []);
  if (!bunRun.ok || !denoRun.ok) {
    throw new Error(`runtime executable probe failed: ${bunRun.stderr} ${denoRun.stderr}`);
  }
  const bunObservation = JSON.parse(bunRun.stdout.trim());
  const denoObservation = JSON.parse(denoRun.stdout.trim());
  return {
    candidate: "RuntimeExecutable",
    commonDurableObservation: [bunArtifact, denoArtifact].every((artifact) =>
      typeof artifact.path === "string" && typeof artifact.bytes === "number" && typeof artifact.target === "string"
    ),
    runtimeIdentitySubstitutable: bunObservation.runtime === denoObservation.runtime,
    bun: { artifact: bunArtifact, run: bunObservation },
    deno: { artifact: denoArtifact, run: denoObservation },
    conclusion: bunObservation.runtime !== denoObservation.runtime
      ? "universal-runtime-executable-profile-falsified-runtime-named-roles-required"
      : "unexpected-result",
  };
};

const compareStaticWebApplications = async ({ root, selectedBun, selectedDeno }) => {
  const source = join(root, "static-web-source");
  const bunOut = join(root, "static-web-bun");
  const denoOut = join(root, "static-web-deno");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><script type="module" src="./app.ts"></script></body></html>\n',
  );
  await writeFile(join(source, "app.ts"), 'document.body.dataset.message = "portable-static-web";\n');
  await writeFile(join(source, "style.css"), 'body { font-family: sans-serif; }\n');

  await mkdir(bunOut, { recursive: true });
  await mkdir(denoOut, { recursive: true });
  const bun = await run(
    selectedBun,
    ["build", "index.html", "--outdir", bunOut, "--target=browser", "--minify"],
    { cwd: source },
  );
  const deno = await run(
    selectedDeno,
    ["bundle", "--outdir", denoOut, "--platform=browser", "--minify", "index.html"],
    { cwd: source },
  );
  if (!bun.ok || !deno.ok) {
    throw new Error(`static web commands failed: bun=${bun.stderr || bun.message}; deno=${deno.stderr || deno.message}`);
  }

  const bunManifest = await manifest(bunOut);
  const denoManifest = await manifest(denoOut);
  const bunValid = await outputReferencesExist(bunOut);
  const denoValid = await outputReferencesExist(denoOut);
  const roleConforms = bunValid && denoValid
    && bunManifest.some((file) => file.path.endsWith(".html"))
    && denoManifest.some((file) => file.path.endsWith(".html"));

  return {
    candidate: "StaticWebApplication",
    roleConforms,
    durableAtomicReplacementEstablished: false,
    bun: { manifest: bunManifest, stdout: bun.stdout.slice(0, 4_096), stderr: bun.stderr.slice(0, 4_096) },
    deno: { manifest: denoManifest, stdout: deno.stdout.slice(0, 4_096), stderr: deno.stderr.slice(0, 4_096) },
    conclusion: roleConforms
      ? "borrowed-static-web-role-supported-durable-directory-publication-unproven"
      : "static-web-role-falsified",
  };
};

const compareDeclarationSets = async ({ root, selectedDeno }) => {
  const source = join(root, "declaration-source");
  const denoOut = join(root, "declaration-deno");
  const tscOut = join(root, "declaration-tsc");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "model.ts"), "export interface Model { readonly value: string }\n");
  await writeFile(
    join(source, "index.ts"),
    'import type { Model } from "./model.ts"; export const make = (value: string): Model => ({ value });\n',
  );
  const deno = await run(
    selectedDeno,
    ["bundle", "--outdir", denoOut, "--declaration", "index.ts"],
    { cwd: source },
  );
  const tscExecutable = resolve("node_modules/.bin/tsc");
  const tsc = await run(
    tscExecutable,
    [
      "--declaration",
      "--emitDeclarationOnly",
      "--outDir",
      tscOut,
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--allowImportingTsExtensions",
      "index.ts",
      "model.ts",
    ],
    { cwd: source },
  );
  if (!deno.ok || !tsc.ok) {
    throw new Error(`declaration commands failed: deno=${deno.stderr || deno.message}; tsc=${tsc.stderr || tsc.message}`);
  }
  const denoFiles = (await manifest(denoOut)).filter((file) => file.path.endsWith(".d.ts"));
  const tscFiles = (await manifest(tscOut)).filter((file) => file.path.endsWith(".d.ts"));
  return {
    candidate: "DeclarationOutputSet",
    denoFiles,
    tscFiles,
    topologyEquivalent: JSON.stringify(denoFiles.map((file) => file.path)) === JSON.stringify(tscFiles.map((file) => file.path)),
    conclusion: denoFiles.length !== tscFiles.length
      ? "broad-declaration-set-profile-falsified-rolled-up-vs-module-tree"
      : "requires-content-comparison",
  };
};

const waitFor = async (predicate, label, timeout = 45_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await predicate();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const firstJavaScriptFile = async (root) => {
  try {
    return (await filesRecursively(root)).find((path) => /\.(?:m?js|cjs)$/.test(path));
  } catch {
    return undefined;
  }
};

const watchOne = async ({ provider, executable, source, output }) => {
  await mkdir(output, { recursive: true });
  const argv = provider === "bun"
    ? ["build", source, "--outdir", output, "--target=node", "--watch"]
    : ["bundle", "--watch", "--outdir", output, source];
  const child = spawn(executable, argv, {
    cwd: dirname(source),
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    if (stdout.length < 64 * 1024) stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 64 * 1024) stderr += chunk.toString("utf8");
  });
  const exit = new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal })));

  const firstPath = await waitFor(async () => firstJavaScriptFile(output), `${provider} initial output`);
  const firstContents = await readFile(firstPath, "utf8");
  await writeFile(source, 'console.log("watch-v2")\n');
  await waitFor(async () => {
    const currentPath = await firstJavaScriptFile(output);
    if (currentPath === undefined) return false;
    const contents = await readFile(currentPath, "utf8");
    return contents.includes("watch-v2") ? currentPath : false;
  }, `${provider} rebuilt output`);

  child.kill("SIGTERM");
  const completed = await Promise.race([exit, sleep(5_000).then(() => undefined)]);
  if (completed === undefined) child.kill("SIGKILL");
  const finalExit = completed ?? await exit;
  const help = provider === "bun"
    ? await run(executable, ["build", "--help"])
    : await run(executable, ["bundle", "--help"]);
  const helpText = `${help.stdout}\n${help.stderr}`;
  const machineEventFlag = helpText.split("\n").some((line) =>
    /watch/i.test(line) && /(?:json|machine|event)/i.test(line)
  );
  return {
    provider,
    initialOutputObserved: firstContents.length > 0,
    rebuildObserved: true,
    exit: finalExit,
    stdout: stdout.slice(0, 8_192),
    stderr: stderr.slice(0, 8_192),
    machineReadableWatchEventFlag: machineEventFlag,
  };
};

const compareCommandWatch = async ({ root, selectedBun, selectedDeno }) => {
  const bunSource = join(root, "watch-bun.ts");
  const denoSource = join(root, "watch-deno.ts");
  await writeFile(bunSource, 'console.log("watch-v1")\n');
  await writeFile(denoSource, 'console.log("watch-v1")\n');
  const bun = await watchOne({ provider: "bun", executable: selectedBun, source: bunSource, output: join(root, "watch-bun") });
  const deno = await watchOne({
    provider: "deno",
    executable: selectedDeno,
    source: denoSource,
    output: join(root, "watch-deno"),
  });
  return {
    candidate: "TypedCommandWatchEvents",
    rawScopedProcessConforms: bun.rebuildObserved && deno.rebuildObserved,
    stableTypedEventsConform: bun.machineReadableWatchEventFlag && deno.machineReadableWatchEventFlag,
    bun,
    deno,
    conclusion: !bun.machineReadableWatchEventFlag && !deno.machineReadableWatchEventFlag
      ? "typed-cross-provider-watch-event-protocol-rejected-opaque-provider-session-only"
      : "requires-parser-conformance",
  };
};

const compiledDenoBundleUnavailable = async ({ root, selectedDeno, selectedDenort }) => {
  const source = join(root, "compiled-deno-bundle.ts");
  const executable = join(root, "compiled-deno-bundle");
  await writeFile(
    source,
    'try { await Deno.bundle({ entrypoints: ["./missing.ts"], write: false }); console.log("unexpected-available"); } catch (error) { console.log(String(error)); }\n',
  );
  const compiled = await run(
    selectedDeno,
    ["compile", "--no-check", "--output", executable, source],
    { env: { DENORT_BIN: selectedDenort } },
  );
  if (!compiled.ok) throw new Error(`Deno compiled API probe did not compile: ${compiled.stderr || compiled.message}`);
  const observation = await run(executable, []);
  if (!observation.ok) throw new Error(`Deno compiled API probe failed to execute: ${observation.stderr || observation.message}`);
  return {
    output: observation.stdout.trim(),
    unavailable: /not available in compiled binaries/i.test(observation.stdout),
  };
};

const versionFacts = async ({ selectedBun, selectedDeno, nodeExecutable }) => {
  const [bunVersion, denoVersion, nodeVersion] = await Promise.all([
    run(selectedBun, ["--version"]),
    run(selectedDeno, ["--version"]),
    run(nodeExecutable, ["--version"]),
  ]);
  const nodeHelp = await run(nodeExecutable, ["--help"]);
  return {
    bun: bunVersion.stdout.trim(),
    deno: denoVersion.stdout.trim(),
    node: nodeVersion.stdout.trim().replace(/^v/, ""),
    nodeBuildSeaCapability: /--build-sea/.test(`${nodeHelp.stdout}\n${nodeHelp.stderr}`),
  };
};

const main = async () => {
  const selectedBun = await requiredExecutable("EFFECT_BUILD_BUN_BIN");
  const selectedDeno = await requiredExecutable("EFFECT_BUILD_DENO_BIN");
  const selectedDenort = await requiredExecutable("EFFECT_BUILD_DENORT_BIN");
  const nodeExecutable = await requiredExecutable("EFFECT_BUILD_NODE_SEA_BIN");
  const root = await mkdtemp(join(tmpdir(), "effect-build-post-0.3-research-"));
  try {
    receipt.versions = await versionFacts({ selectedBun, selectedDeno, nodeExecutable });
    receipt.nodeMainProgram = await compareNodeMainProfile({ root, selectedBun, nodeExecutable });
    receipt.runtimeExecutables = await compareRuntimeExecutables({ root, selectedBun, selectedDeno });
    receipt.staticWebApplication = await compareStaticWebApplications({ root, selectedBun, selectedDeno });
    receipt.declarationSets = await compareDeclarationSets({ root, selectedDeno });
    receipt.commandWatch = await compareCommandWatch({ root, selectedBun, selectedDeno });
    receipt.denoCompiledBundleApi = await compiledDenoBundleUnavailable({ root, selectedDeno, selectedDenort });
    console.log(`EFFECT_BUILD_RESEARCH_RECEIPT=${JSON.stringify(receipt)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

await main();
