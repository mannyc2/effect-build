import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Effect, Layer } from "effect";
import * as BunCommand from "effect-build-bun/Command";
import * as EsbuildApi from "effect-build-esbuild/Api";
import * as NodeMain from "../../packages/effect-build/dist/Author/NodeMain.js";
import * as Executable from "effect-build/Author/Executable";
// Rolldown's host API remains a conditional, package-private evidence candidate.
// Import its built implementation directly so this private matrix cannot turn
// successful execution into a public Api admission.
import * as RolldownBuildCandidate from "../../packages/effect-build-rolldown/dist/Api/Build.js";
import {
  inspectNativeExecutable,
  sha256,
} from "./common.mjs";

const executeFile = promisify(execFile);

const identity = (producerGroup) => Object.freeze(
  producerGroup === "bun-cli"
    ? { package: "effect-build-bun", version: "0.5.0", engine: "bun", engineVersion: "1.3.14" }
    : producerGroup === "esbuild-api"
    ? { package: "effect-build-esbuild", version: "0.5.0", engine: "esbuild", engineVersion: "0.28.2" }
    : { package: "effect-build-rolldown", version: "0.5.0", engine: "rolldown", engineVersion: "1.2.5" },
);

const failed = (provider, operation, cause) =>
  new NodeMain.ProviderFailed({ provider, operation, cause });

const writeCanonicalMain = (ownedRoot, format, contents, provider) =>
  Effect.tryPromise({
    try: async () => {
      const output = join(ownedRoot, format === "module" ? "main.mjs" : "main.cjs");
      await writeFile(output, contents, { flag: "wx" });
      return output;
    },
    catch: (cause) => failed(provider, "write-sealed-main", cause),
  });

const canonicalBuiltins = (imports, provider) => {
  const builtins = [];
  for (const imported of imports) {
    if (typeof imported !== "string" || !imported.startsWith("node:")) {
      return Effect.fail(new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: `unbundled non-builtin runtime load ${String(imported)}`,
      }));
    }
    builtins.push(imported);
  }
  const canonical = [...new Set(builtins)].sort((left, right) => left.localeCompare(right));
  return canonical.length === builtins.length
    ? Effect.succeed(Object.freeze(canonical))
    : Effect.fail(new NodeMain.PortableUnsupported({
      profile: NodeMain.profile,
      provider,
      reason: "provider reported duplicate runtime loads",
    }));
};

const resolveBunOutput = (ownedRoot, metadataPath) => {
  const normalized = metadataPath.split("\\").join("/");
  const crossDrive = /^(?:\.\.\/)+([A-Za-z]:\/.*)$/u.exec(normalized);
  const output = crossDrive !== null
    ? crossDrive[1]
    : !isAbsolute(metadataPath) && !normalized.startsWith("../")
    ? join(ownedRoot, ...normalized.replace(/^\.\//u, "").split("/"))
    : resolve(metadataPath);
  const binding = relative(ownedRoot, output);
  if (binding.length === 0 || binding === ".." || binding.startsWith(`..${sep}`) || isAbsolute(binding)) {
    throw new Error(`Bun output escapes private root: ${metadataPath}`);
  }
  return output;
};

const produceBun = (request, offer, ownedRoot, provider) =>
  Effect.gen(function*() {
    const metadataPath = join(ownedRoot, "provider-metafile.json");
    yield* BunCommand.Build.buildToDirectory({
      entrypoints: [request.entrypoint],
      outdir: ownedRoot,
      target: "node",
      format: request.format === "module" ? "esm" : "cjs",
      sourcemap: "none",
      splitting: false,
      metafile: metadataPath,
    }).pipe(Effect.mapError((cause) => failed(provider, "produce-node-main", cause)));
    const prepared = yield* Effect.tryPromise({
      try: async () => {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
        const outputs = Object.entries(metadata.outputs ?? {}).filter(([, value]) => value?.entryPoint !== undefined);
        if (outputs.length !== 1) throw new Error(`expected one Bun entry output, observed ${outputs.length}`);
        const [outputPath, output] = outputs[0];
        const contents = await readFile(resolveBunOutput(ownedRoot, outputPath));
        const imports = (output.imports ?? []).filter(({ external }) => external !== false).map(({ path }) => path);
        await rm(ownedRoot, { recursive: true, force: true });
        await mkdir(ownedRoot, { recursive: true });
        return { contents, imports };
      },
      catch: (cause) => failed(provider, "read-bun-node-main", cause),
    });
    const builtins = yield* canonicalBuiltins(prepared.imports, provider);
    const path = yield* writeCanonicalMain(ownedRoot, request.format, prepared.contents, provider);
    return Object.freeze({
      protocol: NodeMain.producedProtocol,
      agreementId: offer.agreementId,
      format: request.format,
      path,
      builtins,
      sideOutputs: Object.freeze([]),
      producer: identity("bun-cli"),
      evidence: Object.freeze([{ source: "bun-command-metafile", tool: "bun@1.3.14" }]),
    });
  });

const produceEsbuild = (request, offer, ownedRoot, provider) =>
  Effect.gen(function*() {
    const output = join(ownedRoot, request.format === "module" ? "main.mjs" : "main.cjs");
    const result = yield* EsbuildApi.Build.build({
      entryPoints: [request.entrypoint],
      bundle: true,
      platform: "node",
      format: request.format === "module" ? "esm" : "cjs",
      outfile: output,
      metafile: true,
      logLevel: "silent",
      write: false,
    }).pipe(Effect.mapError((cause) => failed(provider, "produce-node-main", cause)));
    if (result.outputFiles.length !== 1) {
      return yield* new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: `expected one esbuild output, observed ${result.outputFiles.length}`,
      });
    }
    const metadata = Object.values(result.metafile.outputs).find(({ entryPoint }) => entryPoint !== undefined);
    if (metadata === undefined) {
      return yield* new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: "esbuild returned no entry output metadata",
      });
    }
    const builtins = yield* canonicalBuiltins(
      metadata.imports.filter(({ external }) => external).map(({ path }) => path),
      provider,
    );
    const path = yield* writeCanonicalMain(ownedRoot, request.format, result.outputFiles[0].contents, provider);
    return Object.freeze({
      protocol: NodeMain.producedProtocol,
      agreementId: offer.agreementId,
      format: request.format,
      path,
      builtins,
      sideOutputs: Object.freeze([]),
      producer: identity("esbuild-api"),
      evidence: Object.freeze([{ source: "esbuild-api-metafile", tool: "esbuild@0.28.2" }]),
    });
  });

const produceRolldown = (request, offer, ownedRoot, provider) =>
  Effect.gen(function*() {
    const result = yield* RolldownBuildCandidate.generate(
      { input: request.entrypoint, platform: "node" },
      { format: request.format === "module" ? "esm" : "cjs" },
    ).pipe(Effect.mapError((cause) => failed(provider, "produce-node-main", cause)));
    const chunks = result.output.filter((item) => item.type === "chunk");
    if (chunks.length !== 1 || result.output.length !== 1) {
      return yield* new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: `expected one Rolldown chunk, observed ${result.output.length} outputs`,
      });
    }
    const chunk = chunks[0];
    const builtins = yield* canonicalBuiltins([...chunk.imports, ...chunk.dynamicImports], provider);
    const path = yield* writeCanonicalMain(ownedRoot, request.format, new TextEncoder().encode(chunk.code), provider);
    return Object.freeze({
      protocol: NodeMain.producedProtocol,
      agreementId: offer.agreementId,
      format: request.format,
      path,
      builtins,
      sideOutputs: Object.freeze([]),
      producer: identity("rolldown-api"),
      evidence: Object.freeze([{ source: "rolldown-api-output-graph", tool: "rolldown@1.2.5" }]),
    });
  });

export const makeProducerLayer = ({ producerGroup, bunExecutable }) => {
  if (!["bun-cli", "esbuild-api", "rolldown-api"].includes(producerGroup)) {
    throw new Error(`unsupported Node-main producer group ${producerGroup}`);
  }
  const providerIdentity = identity(producerGroup);
  const producer = Layer.succeed(NodeMain.Producer, {
    produce: (request, offer, ownedRoot) =>
      producerGroup === "bun-cli"
        ? produceBun(request, offer, ownedRoot, providerIdentity.package)
        : producerGroup === "esbuild-api"
        ? produceEsbuild(request, offer, ownedRoot, providerIdentity.package)
        : produceRolldown(request, offer, ownedRoot, providerIdentity.package),
  });
  return producerGroup === "bun-cli"
    ? Layer.merge(producer, BunCommand.layer({ executable: bunExecutable }))
    : producer;
};

const authenticateDescriptor = (descriptor, label) =>
  Effect.tryPromise({
    try: async () => {
      const contents = await readFile(descriptor.executable);
      if (String(contents.length) !== descriptor.executableBytes || sha256(contents) !== descriptor.executableSha256) {
        throw new Error(`${label} executable content identity changed`);
      }
      inspectNativeExecutable(contents, descriptor.target);
      return contents;
    },
    catch: (cause) => failed("effect-build-node-target-finalizer", `authenticate-${label}`, cause),
  });

const runBuilder = (builder, operation, args, cwd, timeout = 120_000) =>
  Effect.tryPromise({
    try: (signal) => executeFile(builder.executable, args, {
      cwd,
      signal,
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: "buffer",
      windowsHide: true,
    }),
    catch: (cause) => failed("effect-build-node-target-finalizer", operation, cause),
  });

const probeBuilder = (builder) =>
  Effect.gen(function*() {
    yield* authenticateDescriptor(builder, "builder");
    const version = yield* runBuilder(builder, "probe-builder-version", ["--version"], dirname(builder.executable));
    if (Buffer.from(version.stdout).toString("utf8").trim() !== "v26.7.0") {
      return yield* new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider: "effect-build-node-target-finalizer",
        reason: "authenticated builder did not report exact Node 26.7.0",
      });
    }
    yield* authenticateDescriptor(builder, "builder");
    const help = yield* runBuilder(builder, "probe-builder-capability", ["--help"], dirname(builder.executable));
    const helpText = `${Buffer.from(help.stdout).toString("utf8")}\n${Buffer.from(help.stderr).toString("utf8")}`;
    if (!/(?:^|\s)--build-sea(?:[=\s]|$)/mu.test(helpText)) {
      return yield* new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider: "effect-build-node-target-finalizer",
        reason: "authenticated builder does not expose --build-sea",
      });
    }
  });

export const makePrivateAssemblerLayer = ({ builder, base, target, captureMain }) => {
  const agreementId = `node@26.7.0:${target}:${base.executableSha256}:sea-default-loader`;
  const offer = Object.freeze({
    protocol: NodeMain.offerProtocol,
    agreementId,
    nodeVersion: "26.7.0",
    target,
    formats: Object.freeze(["commonjs", "module"]),
    builtins: Object.freeze([]),
    loader: "sea-default",
    assets: "none",
    snapshot: false,
    codeCache: false,
    dynamicImport: "bundled-only",
  });

  return Layer.succeed(NodeMain.Assembler, {
    offer: () =>
      Effect.gen(function*() {
        yield* probeBuilder(builder);
        yield* authenticateDescriptor(base, "base");
        return offer;
      }),
    assemble: ({ outfile, main }) =>
      Effect.gen(function*() {
        if (
          main.agreementId !== agreementId
          || main.nodeVersion !== "26.7.0"
          || main.target !== target
          || main.builtins.length !== 0
        ) {
          return yield* new NodeMain.PortableRejected({
            profile: NodeMain.profile,
            phase: "analysis",
            reason: "sealed main does not match the private target-finalizer offer",
          });
        }
        const acquired = yield* NodeMain.acquire(main);
        captureMain(main);
        return yield* Executable.publish(
          { destination: outfile, observation: "hashed" },
          (privateCandidate) =>
            Effect.acquireUseRelease(
              Effect.tryPromise({
                try: () => mkdtemp(join(dirname(privateCandidate), ".effect-build-node-finalizer-inputs-")),
                catch: (cause) => failed("effect-build-node-target-finalizer", "allocate-private-inputs", cause),
              }),
              (inputs) =>
                Effect.gen(function*() {
                  const mainPath = join(inputs, acquired.format === "module" ? "main.mjs" : "main.cjs");
                  const configPath = join(inputs, "sea-config.json");
                  yield* Effect.tryPromise({
                    try: async () => {
                      await writeFile(mainPath, acquired.contents, { flag: "wx" });
                      await writeFile(configPath, `${JSON.stringify({
                        main: mainPath,
                        mainFormat: acquired.format,
                        executable: base.executable,
                        output: privateCandidate,
                        disableExperimentalSEAWarning: true,
                        useSnapshot: false,
                        useCodeCache: false,
                      }, null, 2)}\n`, { flag: "wx" });
                    },
                    catch: (cause) => failed("effect-build-node-target-finalizer", "write-private-inputs", cause),
                  });
                  yield* authenticateDescriptor(builder, "builder");
                  yield* runBuilder(builder, "check-sealed-main", ["--check", mainPath], inputs);
                  yield* authenticateDescriptor(base, "base");
                  yield* authenticateDescriptor(builder, "builder");
                  yield* runBuilder(
                    builder,
                    "assemble-private-target",
                    ["--build-sea", configPath],
                    inputs,
                    600_000,
                  );
                  yield* authenticateDescriptor(base, "base");
                  yield* authenticateDescriptor(builder, "builder");
                  yield* Effect.tryPromise({
                    try: () => chmod(privateCandidate, 0o755),
                    catch: (cause) => failed("effect-build-node-target-finalizer", "repair-candidate-mode", cause),
                  });
                }),
              (inputs) => Effect.promise(() => rm(inputs, { recursive: true, force: true })),
            ),
          (candidate) =>
            Effect.tryPromise({
              try: async () => {
                const contents = await readFile(candidate.path);
                const inspection = inspectNativeExecutable(contents, target);
                return {
                  nativeFormat: inspection.nativeFormat,
                  runtime: { name: "node", version: "26.7.0" },
                  target,
                };
              },
              catch: (cause) => failed("effect-build-node-target-finalizer", "inspect-private-candidate", cause),
            }),
        );
      }),
  });
};
