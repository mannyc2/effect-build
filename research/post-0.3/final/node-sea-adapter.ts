import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Effect, Layer } from "effect";
import {
  ExternalImportUnsupported,
  NodeMainAssemblyFailed,
  NodeMainAuthenticationFailed,
  NodeMainExecutable,
  NodeMainExecutableProtocol,
  NodeTargetUnsupported,
  ProfileProtocolUnsupported,
  type BuildStepObservation,
  type ContentIdentity,
  type Digest,
  type ModuleFormat,
  type NodeExecutableArtifact,
  type NodeMain,
  type NodeMainExecutableRequest,
  type NodeMainExecutableService,
  type NodeMainLease,
  type NodeTarget,
  type ProfileAdapterObservation,
  type ToolObservation,
} from "./contracts.js";
import {
  CompatibilityEvaluator,
  CompatibilityReporter,
  requireCompatibility,
  type CompatibilityFailure,
} from "./compatibility.js";
import { digestBytes, identityOf } from "./node-main.js";

export interface NodeSeaAdapterOptions {
  readonly builderExecutable: string;
  readonly baseExecutable: string;
  readonly providerPackageVersion?: string;
  readonly afterAcquire?: (main: NodeMain, lease: NodeMainLease) => Effect.Effect<void>;
  readonly afterCommit?: (artifact: NodeExecutableArtifact) => Effect.Effect<void>;
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

const runInterruptible = (
  executable: string,
  argv: readonly string[],
  cwd?: string,
): Effect.Effect<CommandResult, NodeMainAssemblyFailed> =>
  Effect.async<CommandResult, NodeMainAssemblyFailed>((resume) => {
    const child = spawn(executable, [...argv], {
      ...(cwd === undefined ? {} : { cwd }),
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => {
      resume(Effect.fail(new NodeMainAssemblyFailed("effect-build-node-sea", "failed to spawn Node", error)));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) resume(Effect.succeed({ stdout, stderr }));
      else resume(Effect.fail(new NodeMainAssemblyFailed(
        "effect-build-node-sea",
        `Node exited with code ${String(code)} signal ${String(signal)}: ${stderr || stdout}`,
      )));
    });
    return Effect.sync(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 2_000);
        timer.unref();
      }
    });
  });

const tryPromise = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, NodeMainAssemblyFailed> => Effect.tryPromise({
  try: run,
  catch: (error) => new NodeMainAssemblyFailed(
    "effect-build-node-sea",
    operation,
    error,
  ),
});

const executableIdentity = (path: string): Effect.Effect<ContentIdentity, NodeMainAssemblyFailed> =>
  tryPromise("failed to authenticate Node executable", async () => identityOf(await readFile(path)));

const versionOf = (path: string): Effect.Effect<string, NodeMainAssemblyFailed> =>
  Effect.map(runInterruptible(path, ["--version"]), ({ stdout }) => stdout.trim().replace(/^v/, ""));

const systemTargetOf = (path: string): Effect.Effect<string, NodeMainAssemblyFailed> =>
  Effect.map(
    runInterruptible(path, [
      "-p",
      "`${process.platform}-${process.arch}-${process.platform === 'linux' ? (process.report?.getReport()?.header?.glibcVersionRuntime ? 'gnu' : 'musl') : ''}`.replace(/-$/, '')",
    ]),
    ({ stdout }) => stdout.trim().replace("x64", "x64").replace("arm64", "aarch64"),
  );

const hasBuildSea = (path: string): Effect.Effect<boolean, NodeMainAssemblyFailed> =>
  Effect.map(runInterruptible(path, ["--help"]), ({ stdout, stderr }) => /--build-sea/.test(`${stdout}\n${stderr}`));

const observation = (version: string): ProfileAdapterObservation => ({
  providerPackage: "effect-build-node-sea",
  providerPackageVersion: "0.3.0",
  profile: "NodeMainExecutable",
  profileProtocol: NodeMainExecutableProtocol,
  adapterProtocol: `effect-build-node-sea/NodeMainExecutableAdapter@2+node-${version}`,
});

const authenticateLease = (
  main: NodeMain,
  lease: NodeMainLease,
): Effect.Effect<void, NodeMainAuthenticationFailed> => {
  const observed = lease.identity;
  return observed.digest === main.identity.digest && observed.bytes === main.identity.bytes
    ? Effect.void
    : Effect.fail(new NodeMainAuthenticationFailed(main.identity, observed));
};

const materializeLease = (
  lease: NodeMainLease,
  format: ModuleFormat,
  root: string,
): Effect.Effect<string, NodeMainAssemblyFailed | NodeMainAuthenticationFailed> => {
  const mainPath = join(root, format === "esm" ? "main.mjs" : "main.cjs");
  if (lease._tag === "Bytes") {
    return tryPromise("failed to materialize NodeMain bytes", async () => {
      await writeFile(mainPath, lease.bytes, { flag: "wx" });
      const observed = identityOf(await readFile(mainPath));
      if (observed.digest !== lease.identity.digest || observed.bytes !== lease.identity.bytes) {
        throw new NodeMainAuthenticationFailed(lease.identity, observed);
      }
      return mainPath;
    }).pipe(
      Effect.mapError((error) => error.providerError instanceof NodeMainAuthenticationFailed
        ? error.providerError
        : error),
    );
  }
  return tryPromise("failed to materialize NodeMain file", async () => {
    await copyFile(lease.path, mainPath);
    const observed = identityOf(await readFile(mainPath));
    if (observed.digest !== lease.identity.digest || observed.bytes !== lease.identity.bytes) {
      throw new NodeMainAuthenticationFailed(lease.identity, observed);
    }
    return mainPath;
  }).pipe(
    Effect.mapError((error) => error.providerError instanceof NodeMainAuthenticationFailed
      ? error.providerError
      : error),
  );
};

interface AssemblyInput {
  readonly mainPath: string;
  readonly format: ModuleFormat;
  readonly outfile: string;
  readonly digest?: boolean;
  readonly target: NodeTarget;
  readonly builderExecutable: string;
  readonly provider: ProfileAdapterObservation;
  readonly producer?: ProfileAdapterObservation;
  readonly producerSteps?: readonly BuildStepObservation[];
  readonly afterCommit?: (artifact: NodeExecutableArtifact) => Effect.Effect<void>;
}

const assemblePrivateMain = (input: AssemblyInput): Effect.Effect<NodeExecutableArtifact, NodeMainAssemblyFailed> =>
  Effect.acquireUseRelease(
    tryPromise("failed to allocate Node SEA staging", async () => {
      const destination = resolve(input.outfile);
      await mkdir(dirname(destination), { recursive: true });
      const root = await mkdtemp(join(dirname(destination), `.${basename(destination)}.sea-`));
      return {
        root,
        destination,
        staging: join(root, `candidate-${randomUUID()}`),
        config: join(root, "sea-config.json"),
      };
    }),
    ({ root, destination, staging, config }) => Effect.gen(function*() {
      yield* tryPromise("failed to write Node SEA configuration", async () => {
        await writeFile(config, JSON.stringify({
          main: input.mainPath,
          mainFormat: input.format === "esm" ? "module" : "commonjs",
          executable: input.target.executable,
          output: staging,
          disableExperimentalSEAWarning: true,
          useSnapshot: false,
          useCodeCache: false,
        }));
      });
      yield* runInterruptible(input.builderExecutable, ["--build-sea", config], root);
      const candidate = yield* tryPromise("failed to validate Node SEA candidate", async () => {
        const info = await stat(staging);
        if (!info.isFile() || info.size === 0) throw new Error("Node SEA candidate is not a non-empty regular file");
        await chmod(staging, 0o755);
        return { bytes: info.size, digest: input.digest === true ? digestBytes(await readFile(staging)) : undefined };
      });
      const tool: ToolObservation = {
        name: "node",
        version: input.target.version,
        path: input.builderExecutable,
        compatibility: "matrix-tested",
      };
      const assemblerStep: BuildStepObservation = { operation: "assemble-node-sea", tool };
      const provider = input.provider;
      const profiles: readonly [ProfileAdapterObservation, ProfileAdapterObservation] = [
        input.producer ?? provider,
        provider,
      ];
      const artifact = yield* Effect.uninterruptible(
        tryPromise("failed to commit Node SEA executable", async () => {
          await rename(staging, destination);
          const committedInfo = await lstat(destination);
          if (!committedInfo.isFile()) throw new Error("committed output is not a regular file");
          const value: NodeExecutableArtifact = {
            path: destination,
            bytes: committedInfo.size,
            ...(candidate.digest === undefined ? {} : { digest: candidate.digest }),
            runtime: { name: "node", version: input.target.version },
            systemTarget: input.target.systemTarget,
            profiles,
            steps: [...(input.producerSteps ?? []), assemblerStep],
            committed: true,
          };
          return value;
        }),
      );
      if (input.afterCommit !== undefined) yield* input.afterCommit(artifact);
      return artifact;
    }),
    ({ root }) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );

const makeService = (
  options: NodeSeaAdapterOptions,
  target: NodeTarget,
  provider: ProfileAdapterObservation,
): NodeMainExecutableService<NodeMainAssemblyFailed> => ({
  protocol: NodeMainExecutableProtocol,
  supportedProtocols: [NodeMainExecutableProtocol],
  provider,
  plan: (consumerProtocol, request) => {
    if (consumerProtocol !== NodeMainExecutableProtocol) {
      return Effect.fail(new ProfileProtocolUnsupported(
        provider.providerPackage,
        "NodeMainExecutable",
        consumerProtocol,
        [NodeMainExecutableProtocol],
      ));
    }
    return Effect.succeed({
      target,
      provider,
      assemble: (main) => {
        if (main.protocol !== "effect-build/NodeMain@2") {
          return Effect.fail(new ProfileProtocolUnsupported(
            provider.providerPackage,
            "NodeMain",
            main.protocol,
            ["effect-build/NodeMain@2"],
          ));
        }
        if (main.node.syntaxVersion !== target.version) {
          return Effect.fail(new NodeTargetUnsupported(
            provider.providerPackage,
            main.node.syntaxVersion,
            [target.version],
          ));
        }
        const inadmissible = main.imports.filter((item) => item.classification !== "builtin");
        if (inadmissible.length > 0) {
          return Effect.fail(new ExternalImportUnsupported(provider.providerPackage, inadmissible));
        }
        return Effect.scoped(Effect.gen(function*() {
          const lease = yield* main.acquire;
          yield* authenticateLease(main, lease);
          if (options.afterAcquire !== undefined) yield* options.afterAcquire(main, lease);
          const root = yield* tryPromise("failed to allocate assembler main directory", () =>
            mkdtemp(join(tmpdir(), "effect-build-node-sea-main-"))
          );
          try {
            const mainPath = yield* materializeLease(lease, main.format, root);
            return yield* assemblePrivateMain({
              mainPath,
              format: main.format,
              outfile: request.outfile,
              ...(request.digest === undefined ? {} : { digest: request.digest }),
              target,
              builderExecutable: options.builderExecutable,
              provider,
              producer: main.producer,
              producerSteps: main.steps,
              ...(options.afterCommit === undefined ? {} : { afterCommit: options.afterCommit }),
            });
          } finally {
            yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
          }
        }));
      },
    });
  },
});

export const nodeSeaExecutableLayer = (
  options: NodeSeaAdapterOptions,
): Layer.Layer<
  NodeMainExecutable,
  NodeMainAssemblyFailed | CompatibilityFailure,
  CompatibilityEvaluator | CompatibilityReporter
> => Layer.effect(
  NodeMainExecutable,
  Effect.gen(function*() {
    const [builderVersion, baseVersion, builderIdentity, baseIdentity, systemTarget, capability] = yield* Effect.all([
      versionOf(options.builderExecutable),
      versionOf(options.baseExecutable),
      executableIdentity(options.builderExecutable),
      executableIdentity(options.baseExecutable),
      systemTargetOf(options.baseExecutable),
      hasBuildSea(options.builderExecutable),
    ] as const);
    const compatibility = yield* requireCompatibility({
      providerPackage: "effect-build-node-sea",
      lane: "selected-command",
      operation: "assemble-node-main",
      selected: {
        name: "node",
        version: builderVersion,
        path: options.builderExecutable,
        digest: builderIdentity.digest,
      },
      matrixTestedVersions: ["25.5.0", "26.7.0"],
      supported: { _tag: "ExactVersions", versions: ["25.5.0", "26.7.0"] },
      observedCapabilities: new Set(capability ? ["build-sea"] : []),
      requiredCapabilities: ["build-sea"],
      relations: [{
        _tag: "EqualVersion",
        name: "builder-base-node-version",
        left: { label: "builder", version: builderVersion },
        right: { label: "base", version: baseVersion },
      }],
    });
    const target: NodeTarget = {
      runtime: "node",
      version: baseVersion,
      executable: options.baseExecutable,
      executableDigest: baseIdentity.digest,
      systemTarget,
    };
    const provider = observation(builderVersion);
    void compatibility;
    return makeService(options, target, provider);
  }),
);

export interface RawNodeSeaRequest {
  readonly main: { readonly _tag: "File"; readonly path: string } | { readonly _tag: "Bytes"; readonly bytes: Uint8Array };
  readonly format: ModuleFormat;
  readonly outfile: string;
  readonly digest?: boolean;
}

export const assembleRawNodeSea = (
  options: NodeSeaAdapterOptions,
  request: RawNodeSeaRequest,
): Effect.Effect<NodeExecutableArtifact, NodeMainAssemblyFailed> =>
  Effect.acquireUseRelease(
    tryPromise("failed to allocate raw Node SEA input", () => mkdtemp(join(tmpdir(), "effect-build-raw-node-sea-"))),
    (root) => Effect.gen(function*() {
      const mainPath = join(root, request.format === "esm" ? "main.mjs" : "main.cjs");
      if (request.main._tag === "File") yield* tryPromise("failed to copy raw Node SEA file", () => copyFile(request.main.path, mainPath));
      else yield* tryPromise("failed to write raw Node SEA bytes", () => writeFile(mainPath, request.main.bytes));
      const [builderVersion, baseVersion, identity, systemTarget] = yield* Effect.all([
        versionOf(options.builderExecutable),
        versionOf(options.baseExecutable),
        executableIdentity(options.baseExecutable),
        systemTargetOf(options.baseExecutable),
      ] as const);
      if (builderVersion !== baseVersion) {
        return yield* Effect.fail(new NodeMainAssemblyFailed("effect-build-node-sea", "builder and base Node versions differ"));
      }
      const provider = observation(builderVersion);
      return yield* assemblePrivateMain({
        mainPath,
        format: request.format,
        outfile: request.outfile,
        ...(request.digest === undefined ? {} : { digest: request.digest }),
        target: {
          runtime: "node",
          version: baseVersion,
          executable: options.baseExecutable,
          executableDigest: identity.digest,
          systemTarget,
        },
        builderExecutable: options.builderExecutable,
        provider,
      });
    }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );
