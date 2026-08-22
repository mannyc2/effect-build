import { Cause, Config, Crypto, Effect, FileSystem, Option, Path, Stream } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import type { ContentIdentity, Definition } from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { inspectSelectedNodeExecutable } from "../SelectedNodeExecutable.js";
import {
  type CapabilityObservation,
  evaluateLaunch,
  evaluatePreflight,
  type IdentityIncomplete,
  identityIncomplete,
  type LaunchRefusal,
  type LayerRefusal,
  nodeSeaProbeFailed,
  nodeSeaToolNotFound,
  type PreflightRefusal,
  selectedCommandIndeterminate,
  type SelectedEvidence,
} from "./compatibility.js";

export interface CommandOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface CommandCompletion {
  readonly exitCode: number;
  readonly stdout: CommandOutput;
  readonly stderr: CommandOutput;
}

/** Internal distinction: reauthentication refusals remain compatibility errors, while spawn is provider execution. */
export interface CommandSpawnFailed {
  readonly _tag: "NodeSeaCommandSpawnFailed";
  readonly reason: string;
}

interface ProbeReport {
  readonly path: string;
  readonly version: string;
  readonly revision: string;
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly distribution: "ubuntu-24.04" | "not-applicable" | "unknown";
  readonly builtinSpecifiers: readonly string[];
}

export interface LayerOptions {
  readonly builderExecutable?: AbsolutePath;
  readonly baseExecutable?: AbsolutePath;
  readonly allowUntestedVersion?: boolean;
}

export interface AdmissionRequest {
  readonly allowUntestedVersion: boolean;
}

export interface SelectedNode {
  readonly evidence: SelectedEvidence;
  readonly definition: Definition<"node", AdmissionRequest, PreflightRefusal>;
  readonly builderPath: AbsolutePath;
  readonly basePath: AbsolutePath;
  readonly builtinSpecifiers: ReadonlySet<string>;
  readonly reauthenticate: () => Effect.Effect<void, LaunchRefusal>;
  readonly execute: (
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<CommandCompletion, LaunchRefusal | CommandSpawnFailed>;
}

const outputLimit = 1024 * 1024;

interface OutputAccumulator {
  readonly chunks: readonly Uint8Array[];
  readonly bytes: number;
  readonly truncated: boolean;
}

const collectOutput = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<CommandOutput, unknown> =>
  Stream.runFold(
    stream,
    (): OutputAccumulator => ({ chunks: [], bytes: 0, truncated: false }),
    (state, chunk) => {
      const remaining = outputLimit - state.bytes;
      if (remaining <= 0) return { ...state, truncated: true };
      const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
      return {
        chunks: [...state.chunks, retained],
        bytes: state.bytes + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const runCommand = (
  command: ChildProcess.Command,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
): Effect.Effect<CommandCompletion, unknown> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collectOutput(handle.stdout), collectOutput(handle.stderr), handle.exitCode] as const,
        { concurrency: "unbounded" },
      );
      return { exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const observeContent = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  file: string,
): Effect.Effect<ContentIdentity, string> =>
  Effect.gen(function*() {
    const information = yield* fileSystem.stat(file).pipe(
      Effect.mapError((error) => `stat:${error.reason._tag}`),
    );
    if (information.type !== "File") return yield* Effect.fail("not-regular-file");
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) return yield* Effect.fail("not-executable");
    if (information.size < 0n) return yield* Effect.fail("invalid-byte-count");
    const bytes = yield* fileSystem.readFile(file).pipe(
      Effect.mapError((error) => `read:${error.reason._tag}`),
    );
    if (BigInt(bytes.byteLength) !== information.size) return yield* Effect.fail("file-size-changed-during-read");
    const digest = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError(() => "sha256-digest-unavailable"),
    );
    return {
      digest: { algorithm: "sha256", value: hex(digest) as ContentIdentity["digest"]["value"] },
      bytes: String(information.size) as ContentIdentity["bytes"],
    };
  });

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.bytes === right.bytes
  && left.digest.algorithm === right.digest.algorithm
  && left.digest.value === right.digest.value;

const isNotFound = (error: { readonly reason: { readonly _tag: string } }): boolean => error.reason._tag === "NotFound";

const inspectPathCandidate = <A>(
  effect: Effect.Effect<A, { readonly reason: { readonly _tag: string } }>,
): Effect.Effect<Option.Option<A>, string> =>
  Effect.matchCauseEffect(effect, {
    onSuccess: (value) => Effect.succeed(Option.some(value)),
    onFailure: (cause) => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1
        && reason !== undefined
        && Cause.isFailReason(reason)
        && isNotFound(reason.error)
      ) return Effect.succeed(Option.none());
      return Effect.fail("path-candidate-inspection-failed");
    },
  });

const resolvePathCommand = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<string, LayerRefusal> =>
  Effect.gen(function*() {
    const value = yield* Config.string("PATH").pipe(Effect.mapError(() => nodeSeaToolNotFound("node")));
    const names = path.sep === "\\" ? ["node", "node.exe"] : ["node"];
    for (const entry of value.split(path.sep === "\\" ? ";" : ":")) {
      if (entry.length === 0 || !path.isAbsolute(entry)) continue;
      for (const name of names) {
        const candidate = path.normalize(path.join(entry, name));
        const canonical = yield* inspectPathCandidate(fileSystem.realPath(candidate)).pipe(
          Effect.mapError(nodeSeaProbeFailed),
        );
        if (Option.isNone(canonical)) continue;
        const information = yield* inspectPathCandidate(fileSystem.stat(canonical.value)).pipe(
          Effect.mapError(nodeSeaProbeFailed),
        );
        if (Option.isNone(information) || information.value.type !== "File") continue;
        if (path.sep !== "\\" && (information.value.mode & 0o111) === 0) continue;
        return path.normalize(canonical.value);
      }
    }
    return yield* Effect.fail(nodeSeaToolNotFound("node"));
  });

const pathFromUrl = (url: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "file:") return undefined;
  const pathname = decodeURIComponent(parsed.pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
};

interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
}

const observeCoreContract = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  moduleUrl: string,
): Effect.Effect<SelectedEvidence["coreContract"], LayerRefusal> =>
  Effect.gen(function*() {
    const modulePath = pathFromUrl(moduleUrl);
    if (modulePath === undefined) return yield* Effect.fail(nodeSeaProbeFailed("module-url-is-not-a-file-path"));
    const readManifest = (file: string): Effect.Effect<PackageManifest, LayerRefusal> =>
      fileSystem.readFileString(file).pipe(
        Effect.mapError((error) => nodeSeaProbeFailed(`package-manifest-read:${error.reason._tag}`)),
        Effect.flatMap((source) =>
          Effect.try({
            try: () => JSON.parse(source) as PackageManifest,
            catch: () => nodeSeaProbeFailed("invalid-package-manifest"),
          })
        ),
      );
    const exists = (file: string): Effect.Effect<boolean, LayerRefusal> =>
      fileSystem.exists(file).pipe(
        Effect.mapError((error) => nodeSeaProbeFailed(`package-manifest-probe:${error.reason._tag}`)),
      );
    let ownDirectory = path.dirname(modulePath);
    let ownVersion: string | undefined;
    for (;;) {
      const manifestPath = path.join(ownDirectory, "package.json");
      if (yield* exists(manifestPath)) {
        const manifest = yield* readManifest(manifestPath);
        if (manifest.name === "effect-build-node-sea") {
          ownVersion = manifest.version;
          break;
        }
      }
      const parent = path.dirname(ownDirectory);
      if (parent === ownDirectory) break;
      ownDirectory = parent;
    }
    if (ownVersion === undefined) return yield* Effect.fail(identityIncomplete("own-package-version-missing"));
    let directory = ownDirectory;
    let coreManifest: PackageManifest | undefined;
    for (;;) {
      const candidate = path.join(directory, "node_modules", "effect-build", "package.json");
      if (yield* exists(candidate)) {
        coreManifest = yield* readManifest(candidate);
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    if (coreManifest === undefined) {
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: `effect-build:unresolved|provider@${ownVersion}`,
        state: "Indeterminate",
        reason: "core-package-not-resolved",
      };
    }
    if (coreManifest.name !== "effect-build" || typeof coreManifest.version !== "string") {
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: `effect-build:invalid|provider@${ownVersion}`,
        state: "Indeterminate",
        reason: "core-package-manifest-invalid",
      };
    }
    const lockstep = coreManifest.version === ownVersion;
    return {
      id: "effect-build-core",
      kind: "provider-core-peer",
      inputsKey: `effect-build@${coreManifest.version}|provider@${ownVersion}`,
      state: lockstep ? "Compatible" : "Incompatible",
      reason: lockstep ? "core-and-provider-versions-are-lockstep" : "core-and-provider-versions-differ",
    };
  });

const parseProbe = (completion: CommandCompletion): Effect.Effect<ProbeReport, IdentityIncomplete | LayerRefusal> =>
  Effect.gen(function*() {
    if (completion.exitCode !== 0) {
      return yield* Effect.fail(nodeSeaProbeFailed(
        completion.stderr.text || `identity-probe-exited:${completion.exitCode}`,
      ));
    }
    if (completion.stdout.truncated || completion.stderr.truncated) {
      return yield* Effect.fail(identityIncomplete("identity-probe-output-truncated"));
    }
    const raw = yield* Effect.try({
      try: () => JSON.parse(completion.stdout.text.trim()) as unknown,
      catch: () => identityIncomplete("identity-probe-returned-invalid-json"),
    });
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return yield* Effect.fail(identityIncomplete("identity-probe-returned-non-object"));
    }
    const value = raw as Readonly<Record<string, unknown>>;
    const os = value.os === "darwin" ? "macos" : value.os === "win32" ? "windows" : value.os;
    const architecture = value.architecture === "arm64" ? "aarch64" : value.architecture;
    const distribution = value.distribution;
    if (
      Reflect.ownKeys(value).some((key) =>
        typeof key !== "string"
        || !["path", "version", "revision", "os", "architecture", "distribution", "builtinSpecifiers"].includes(key)
      )
      || typeof value.path !== "string"
      || value.path.length === 0
      || typeof value.version !== "string"
      || value.version.length === 0
      || typeof value.revision !== "string"
      || value.revision.length === 0
      || (os !== "macos" && os !== "linux" && os !== "windows")
      || (architecture !== "x64" && architecture !== "aarch64")
      || (distribution !== "ubuntu-24.04" && distribution !== "not-applicable" && distribution !== "unknown")
      || !Array.isArray(value.builtinSpecifiers)
      || value.builtinSpecifiers.some((specifier) => typeof specifier !== "string")
    ) return yield* Effect.fail(identityIncomplete("identity-probe-fields-are-incomplete"));
    const builtinSpecifiers = value.builtinSpecifiers as readonly string[];
    if (
      builtinSpecifiers.length === 0
      || new Set(builtinSpecifiers).size !== builtinSpecifiers.length
      || builtinSpecifiers.some((specifier, index) => index > 0 && builtinSpecifiers[index - 1]! >= specifier)
    ) return yield* Effect.fail(identityIncomplete("identity-probe-builtin-set-is-invalid"));
    return {
      path: value.path,
      version: value.version,
      revision: value.revision,
      os,
      architecture,
      distribution,
      builtinSpecifiers,
    };
  });

const probeSource = [
  "import { readFileSync } from 'node:fs';",
  "import { builtinModules, isBuiltin } from 'node:module';",
  "let release = ''; try { release = readFileSync('/etc/os-release', 'utf8'); } catch {}",
  'const id = /^ID=(?:"([^"]+)"|([^\\n]+))$/m.exec(release)?.slice(1).find(Boolean);',
  'const versionId = /^VERSION_ID=(?:"([^"]+)"|([^\\n]+))$/m.exec(release)?.slice(1).find(Boolean);',
  "const distribution = process.platform !== 'linux' ? 'not-applicable' : id === 'ubuntu' && versionId === '24.04' ? 'ubuntu-24.04' : 'unknown';",
  "const names = new Set();",
  "for (const listed of builtinModules) { const bare = listed.startsWith('node:') ? listed.slice(5) : listed; for (const candidate of [bare, `node:${bare}`]) if (isBuiltin(candidate)) names.add(candidate); }",
  "process.stdout.write(JSON.stringify({ path: process.execPath, version: process.versions.node, revision: process.versions.v8, os: process.platform, architecture: process.arch, distribution, builtinSpecifiers: [...names].sort() }));",
] as const;

const parseCapabilities = (completion: CommandCompletion): readonly [CapabilityObservation, CapabilityObservation] => {
  if (completion.exitCode !== 0 || completion.stdout.truncated || completion.stderr.truncated) {
    const reason = completion.exitCode !== 0
      ? `help-probe-exited:${completion.exitCode}`
      : "help-probe-output-truncated";
    return [
      { _tag: "Indeterminate", id: "build-sea", reason },
      { _tag: "Indeterminate", id: "lief", reason },
    ];
  }
  const text = `${completion.stdout.text}\n${completion.stderr.text}`;
  if (!/(?:^|\s)--build-sea(?:[=\s]|$)/m.test(text)) {
    return [
      { _tag: "Missing", id: "build-sea", reason: "node-help-omits-build-sea" },
      { _tag: "Missing", id: "lief", reason: "node-build-sea-is-unavailable" },
    ];
  }
  return [
    { _tag: "Present", id: "build-sea", evidence: "node-help-lists-build-sea" },
    {
      _tag: "Present",
      id: "lief",
      evidence: "node-help-lists-the-direct-build-sea-lief-backed-assembly-path",
    },
  ];
};

const participant = (
  role: "builder" | "base",
  commandPath: AbsolutePath,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto.Crypto,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
): Effect.Effect<
  {
    readonly evidence: SelectedEvidence["builder"];
    readonly capabilities: readonly [CapabilityObservation, CapabilityObservation];
    readonly builtinSpecifiers: readonly string[];
  },
  LayerRefusal
> =>
  Effect.gen(function*() {
    const before = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
      Effect.mapError(nodeSeaProbeFailed),
    );
    const information = yield* fileSystem.stat(commandPath).pipe(
      Effect.mapError((error) => nodeSeaProbeFailed(`selected-stat:${error.reason._tag}`)),
    );
    if (information.type !== "File" || information.size < 0n) {
      return yield* Effect.fail(identityIncomplete("selected-command-is-not-a-regular-file"));
    }
    yield* inspectSelectedNodeExecutable(fileSystem, commandPath, information.size).pipe(
      Effect.mapError((error) => nodeSeaProbeFailed(`selected-native-inspection:${error.reason}`)),
    );
    const inspected = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
      Effect.mapError(nodeSeaProbeFailed),
    );
    if (!sameContent(before, inspected)) {
      return yield* Effect.fail(identityIncomplete("selected-command-changed-during-native-inspection"));
    }
    const rawRun = (argv: readonly string[]) =>
      mapFailureCause(
        runCommand(ChildProcess.make(commandPath, argv, { shell: false, forceKillAfter: "2 seconds" }), spawner),
        () => nodeSeaProbeFailed("selected-command-probe-launch-failed"),
      );
    const report = yield* rawRun(["--input-type=module", "--eval", probeSource.join("\n")]).pipe(
      Effect.flatMap(parseProbe),
    );
    const reportedCanonical = yield* fileSystem.realPath(report.path).pipe(
      Effect.mapError((error) => nodeSeaProbeFailed(`reported-realpath:${error.reason._tag}`)),
    );
    if (path.normalize(reportedCanonical) !== commandPath) {
      return yield* Effect.fail(identityIncomplete("probe-reported-different-selected-command"));
    }
    const help = yield* rawRun(["--help"]);
    const after = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
      Effect.mapError(nodeSeaProbeFailed),
    );
    if (!sameContent(before, after)) {
      return yield* Effect.fail(identityIncomplete("selected-command-changed-during-acquisition"));
    }
    return {
      evidence: Object.freeze({
        role,
        path: commandPath,
        version: report.version,
        revision: report.revision,
        host: { os: report.os, architecture: report.architecture, distribution: report.distribution },
        content: after,
      }),
      capabilities: parseCapabilities(help),
      builtinSpecifiers: report.builtinSpecifiers,
    };
  });

const canonicalExecutable = (
  selected: string,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<AbsolutePath, LayerRefusal> =>
  fileSystem.realPath(selected).pipe(
    Effect.mapError((error) =>
      isNotFound(error) ? nodeSeaToolNotFound(selected) : nodeSeaProbeFailed(`selected-realpath:${error.reason._tag}`)
    ),
    Effect.flatMap((real) => {
      const normalized = path.normalize(real);
      return path.isAbsolute(normalized)
        ? Effect.succeed(normalized as AbsolutePath)
        : Effect.fail(identityIncomplete("selected-realpath-is-not-absolute"));
    }),
  );

const validLayerOptions = (value: unknown): value is LayerOptions => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Reflect.ownKeys(record).some((key) =>
      typeof key !== "string" || !["builderExecutable", "baseExecutable", "allowUntestedVersion"].includes(key)
    )
  ) return false;
  return (record.builderExecutable === undefined || typeof record.builderExecutable === "string")
    && (record.baseExecutable === undefined || typeof record.baseExecutable === "string")
    && (record.allowUntestedVersion === undefined || typeof record.allowUntestedVersion === "boolean");
};

export const selectNode = (
  options: LayerOptions,
  moduleUrl: string,
): Effect.Effect<
  SelectedNode,
  LayerRefusal,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    if (!validLayerOptions(options)) return yield* Effect.fail(nodeSeaProbeFailed("invalid-layer-options"));
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const checkExplicit = (candidate: string | undefined, name: string): Effect.Effect<void, LayerRefusal> =>
      candidate === undefined || (path.isAbsolute(candidate) && path.normalize(candidate) === candidate)
        ? Effect.void
        : Effect.fail(nodeSeaProbeFailed(`${name}-must-be-normalized-and-absolute`));
    yield* checkExplicit(options.builderExecutable, "builder-executable");
    yield* checkExplicit(options.baseExecutable, "base-executable");
    const builderSelected = options.builderExecutable ?? (yield* resolvePathCommand(fileSystem, path));
    const builderPath = yield* canonicalExecutable(builderSelected, fileSystem, path);
    const builder = yield* participant("builder", builderPath, fileSystem, path, crypto, spawner);
    const basePath = options.baseExecutable === undefined
      ? builderPath
      : yield* canonicalExecutable(options.baseExecutable, fileSystem, path);
    const base = basePath === builderPath
      ? { ...builder, evidence: { ...builder.evidence, role: "base" as const } }
      : yield* participant("base", basePath, fileSystem, path, crypto, spawner);
    if (basePath === builderPath) {
      // An omitted base is the same participant by contract; no second probe may reselect it.
      Object.freeze(base.evidence);
    }
    const coreContract = yield* observeCoreContract(fileSystem, path, moduleUrl);
    const evidence: SelectedEvidence = Object.freeze({
      builder: builder.evidence,
      base: base.evidence,
      capabilities: builder.capabilities,
      coreContract,
    });
    const definition: Definition<"node", AdmissionRequest, PreflightRefusal> = Object.freeze({
      observation: {
        name: "node" as const,
        participants: [
          {
            role: "builder",
            name: "node",
            version: evidence.builder.version,
            revision: evidence.builder.revision,
            channel: "selected-command",
            content: evidence.builder.content,
          },
          {
            role: "base",
            name: "node",
            version: evidence.base.version,
            revision: evidence.base.revision,
            channel: "selected-base",
            content: evidence.base.content,
          },
        ] as const,
        capabilities: evidence.capabilities,
      },
      evaluate: (request: AdmissionRequest) => {
        const result = evaluatePreflight({ evidence, ...request });
        return result._tag === "Refused" ? Effect.fail(result.refusal) : Effect.succeed(result.admission);
      },
      command: (argv: readonly string[], commandOptions?: ChildProcess.CommandOptions) =>
        ChildProcess.make(builderPath, argv, commandOptions),
    });
    const authenticate = (role: "builder" | "base") =>
      observeContent(fileSystem, crypto, path, evidence[role].path).pipe(
        Effect.mapError((reason) => selectedCommandIndeterminate(role, reason)),
        Effect.flatMap((launch) => {
          const result = evaluateLaunch(evidence, role, launch);
          return result._tag === "Refused" ? Effect.fail(result.refusal) : Effect.void;
        }),
      );
    const execute: SelectedNode["execute"] = (argv, cwd) =>
      Effect.gen(function*() {
        yield* reauthenticate();
        return yield* mapFailureCause(
          runCommand(
            definition.command(argv, {
              ...(cwd === undefined ? {} : { cwd }),
              shell: false,
              forceKillAfter: "2 seconds",
            }),
            spawner,
          ),
          () => ({
            _tag: "NodeSeaCommandSpawnFailed" as const,
            reason: "selected-command-launch-failed-after-reauthentication",
          }),
        );
      });
    const reauthenticate: SelectedNode["reauthenticate"] = () =>
      Effect.gen(function*() {
        yield* authenticate("builder");
        yield* authenticate("base");
      });
    return Object.freeze({
      evidence,
      definition,
      builderPath,
      basePath,
      builtinSpecifiers: new Set(builder.builtinSpecifiers),
      reauthenticate,
      execute,
    });
  });
