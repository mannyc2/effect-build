import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { builtinModules, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import {
  NodeMainAcquisitionFailed,
  NodeMainChanged,
  NodeMainExpired,
  NodeMainProductionFailed,
  NodeMainProtocol,
  type BuildStepObservation,
  type ContentIdentity,
  type Digest,
  type ModuleFormat,
  type NodeMain,
  type NodeMainLease,
  type NodeMainTransport,
  type NodeRuntimeImport,
  type NodeTarget,
  type ProfileAdapterObservation,
  type ToolObservation,
} from "./contracts.js";

const execFileAsync = promisify(execFile);
const builtinSet = new Set(builtinModules.flatMap((name) => {
  const bare = name.startsWith("node:") ? name.slice(5) : name;
  return [bare, `node:${bare}`];
}));

export const digestBytes = (bytes: Uint8Array): Digest =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const identityOf = (bytes: Uint8Array): ContentIdentity => ({
  algorithm: "sha256",
  digest: digestBytes(bytes),
  bytes: bytes.byteLength,
});

export const observeFileIdentity = (
  path: string,
): Effect.Effect<ContentIdentity, NodeMainAcquisitionFailed> =>
  Effect.tryPromise({
    try: async () => identityOf(await readFile(path)),
    catch: (error) =>
      new NodeMainAcquisitionFailed("read-identity", error instanceof Error ? error.message : String(error)),
  });

const classifySpecifier = (specifier: string): NodeRuntimeImport["classification"] => {
  if (builtinSet.has(specifier) || isBuiltin(specifier)) return "builtin";
  if (
    specifier.startsWith("./")
    || specifier.startsWith("../")
    || specifier.startsWith("/")
    || specifier.startsWith("file:")
  ) return "unresolved";
  return "package";
};

const addImport = (
  output: Map<string, NodeRuntimeImport>,
  specifier: string,
  kind: NodeRuntimeImport["kind"],
): void => {
  if (specifier.length === 0) return;
  const key = `${kind}:${specifier}`;
  if (output.has(key)) return;
  output.set(key, { specifier, kind, classification: classifySpecifier(specifier) });
};

export const classifyRuntimeImports = (
  bytes: Uint8Array,
  providerObserved: readonly string[],
): readonly NodeRuntimeImport[] => {
  const source = new TextDecoder().decode(bytes);
  const output = new Map<string, NodeRuntimeImport>();
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier !== undefined) addImport(output, specifier, "dynamic-import");
  }
  for (const match of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier !== undefined) addImport(output, specifier, "require");
  }
  for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier !== undefined) addImport(output, specifier, "static-import");
  }
  const parsedSpecifiers = new Set([...output.values()].map((item) => item.specifier));
  for (const specifier of providerObserved) {
    if (!parsedSpecifiers.has(specifier)) addImport(output, specifier, "provider-observed");
  }
  return [...output.values()].sort((left, right) =>
    left.specifier.localeCompare(right.specifier) || left.kind.localeCompare(right.kind)
  );
};

const readAuthenticated = (
  path: string,
  expected: ContentIdentity,
  producerPackage: string,
  active: () => boolean,
): Effect.Effect<Uint8Array, NodeMainExpired | NodeMainChanged | NodeMainAcquisitionFailed> =>
  Effect.suspend(
    (): Effect.Effect<Uint8Array, NodeMainExpired | NodeMainChanged | NodeMainAcquisitionFailed> => {
      if (!active()) return Effect.fail(new NodeMainExpired(producerPackage));
      return Effect.tryPromise({
        try: async () => Uint8Array.from(await readFile(path)),
        catch: (error) =>
          new NodeMainAcquisitionFailed("read-main", error instanceof Error ? error.message : String(error)),
      }).pipe(
        Effect.flatMap((bytes) => {
          const observed = identityOf(bytes);
          return observed.digest === expected.digest && observed.bytes === expected.bytes
            ? Effect.succeed(bytes)
            : Effect.fail(new NodeMainChanged(expected, observed));
        }),
      );
    },
  );

const acquireLease = (
  path: string,
  expected: ContentIdentity,
  transport: NodeMainTransport,
  format: ModuleFormat,
  producerPackage: string,
  active: () => boolean,
): NodeMain["acquire"] => {
  const authenticated = readAuthenticated(path, expected, producerPackage, active);
  if (transport === "bytes") {
    return Effect.map(authenticated, (bytes): NodeMainLease => ({
      _tag: "Bytes",
      identity: expected,
      bytes,
    }));
  }
  return Effect.acquireRelease(
    Effect.flatMap(authenticated, (bytes) =>
      Effect.tryPromise({
        try: async () => {
          const root = await mkdtemp(join(tmpdir(), "effect-build-node-main-lease-"));
          const privatePath = join(root, format === "esm" ? "main.mjs" : "main.cjs");
          await writeFile(privatePath, bytes, { flag: "wx" });
          const observed = identityOf(await readFile(privatePath));
          if (observed.digest !== expected.digest || observed.bytes !== expected.bytes) {
            await rm(root, { recursive: true, force: true });
            throw new NodeMainChanged(expected, observed);
          }
          return { root, lease: { _tag: "File", identity: expected, path: privatePath } as const };
        },
        catch: (error) =>
          error instanceof NodeMainChanged
            ? error
            : new NodeMainAcquisitionFailed("copy-main", error instanceof Error ? error.message : String(error)),
      })
    ),
    ({ root }) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  ).pipe(Effect.map(({ lease }) => lease));
};

export interface BorrowedNodeMainInput {
  readonly path: string;
  readonly format: ModuleFormat;
  readonly transport: NodeMainTransport;
  readonly target: NodeTarget;
  readonly providerObservedImports: readonly string[];
  readonly producer: ProfileAdapterObservation;
  readonly steps: readonly BuildStepObservation[];
  readonly expectedIdentity: ContentIdentity;
}

export interface BorrowedNodeMainCapability {
  readonly main: NodeMain;
  readonly expire: () => void;
}

export const makeBorrowedNodeMain = (
  input: BorrowedNodeMainInput,
  bytes: Uint8Array,
): BorrowedNodeMainCapability => {
  let active = true;
  const syntaxTool: ToolObservation = {
    name: "node",
    version: input.target.version,
    path: input.target.executable,
    digest: input.target.executableDigest,
    compatibility: "matrix-tested",
  };
  const main: NodeMain = {
    protocol: NodeMainProtocol,
    format: input.format,
    node: {
      runtime: "node",
      syntaxVersion: input.target.version,
      syntaxCheckedBy: syntaxTool,
    },
    imports: classifyRuntimeImports(bytes, input.providerObservedImports),
    identity: input.expectedIdentity,
    producer: input.producer,
    steps: [...input.steps, { operation: "check-node-syntax", tool: syntaxTool }],
    transport: input.transport,
    acquire: acquireLease(
      input.path,
      input.expectedIdentity,
      input.transport,
      input.format,
      input.producer.providerPackage,
      () => active,
    ),
  };
  return { main, expire: () => { active = false; } };
};

export const checkNodeSyntax = (
  target: NodeTarget,
  format: ModuleFormat,
  bytes: Uint8Array,
): Effect.Effect<void, NodeMainProductionFailed> =>
  Effect.tryPromise({
    try: async () => {
      const root = await mkdtemp(join(tmpdir(), "effect-build-node-syntax-"));
      try {
        const path = join(root, format === "esm" ? "main.mjs" : "main.cjs");
        await writeFile(path, bytes);
        await execFileAsync(target.executable, ["--check", path], {
          maxBuffer: 16 * 1024 * 1024,
          timeout: 60_000,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    catch: (error) =>
      new NodeMainProductionFailed(
        "effect-build",
        `Node ${target.version} syntax check failed`,
        error,
      ),
  });
