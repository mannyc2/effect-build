import { Context, Crypto, Effect, FileSystem, Path, type Scope } from "effect";
import type { Digest } from "../Artifact.js";
import { ArtifactInvalid, PortableRejected, PortableUnsupported, ProviderFailed } from "../BuildError.js";
import * as BorrowedContent from "./BorrowedContent.js";

export const protocol = "effect-build/sealed-node-main@1" as const;
export const profile = "effect-build/profile/node-main@1" as const;
export const producedProtocol = "effect-build/produced-node-main@1" as const;

export type Format = "commonjs" | "module";

export interface ProviderIdentity {
  readonly package: string;
  readonly version: string;
  readonly engine: string;
  readonly engineVersion: string;
}

export interface Request {
  readonly protocol: typeof profile;
  readonly entrypoint: string;
  readonly format: Format;
}

export interface ProducedNodeMain {
  readonly protocol: typeof producedProtocol;
  readonly format: Format;
  readonly path: string;
  readonly inputs: readonly string[];
  readonly runtimeImports: readonly string[];
}

export type ProduceError = ProviderFailed | PortableUnsupported;

interface Service {
  readonly identity: ProviderIdentity;
  readonly produce: (
    request: Request,
    staging: string,
  ) => Effect.Effect<ProducedNodeMain, ProduceError>;
}

export class Producer extends Context.Service<Producer, Service>()("effect-build/Author/NodeMain/Producer") {}

export interface SealedNodeMain {
  readonly protocol: typeof protocol;
  readonly profile: typeof profile;
  readonly format: Format;
  readonly path: string;
  readonly bytes: number;
  readonly digest: Digest;
  readonly producer: ProviderIdentity;
}

export type SealError = ArtifactInvalid | PortableRejected | ProduceError;

const builtins = new Set([
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const isBuiltin = (specifier: string): boolean =>
  specifier.startsWith("node:") ? builtins.has(specifier.slice(5)) : builtins.has(specifier);

const reject = (phase: "request" | "analysis", reason: string): PortableRejected =>
  new PortableRejected({ profile, phase, reason });

const validateRequest = (request: Request): Effect.Effect<void, PortableRejected> => {
  if ((request as { readonly protocol?: unknown }).protocol !== profile) {
    return Effect.fail(reject("request", "unknown protocol major"));
  }
  if (request.entrypoint.length === 0) return Effect.fail(reject("request", "entrypoint is empty"));
  if (request.format !== "commonjs" && request.format !== "module") {
    return Effect.fail(reject("request", "format must be commonjs or module"));
  }
  return Effect.void;
};

const validateSource = (source: string): string | undefined => {
  if (/\bimport\s*\(/u.test(source)) return "dynamic import is forbidden";
  if (/\bcreateRequire\b/u.test(source)) return "createRequire is forbidden";
  if (/\bprocess\s*\.\s*dlopen\b/u.test(source)) return "process.dlopen is forbidden";
  if (/\beval\s*\(|\bnew\s+Function\b/u.test(source)) return "runtime code loading is forbidden";
  if (/\brequire\s*\(\s*[^"']/u.test(source)) return "computed require is forbidden";
  return undefined;
};

export const seal = (
  request: Request,
): Effect.Effect<
  SealedNodeMain,
  SealError,
  Producer | Scope.Scope | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function*() {
    yield* validateRequest(request);
    const producer = yield* Producer;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staging = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-node-main-" }).pipe(
      Effect.mapError(() =>
        new ArtifactInvalid({ path: request.entrypoint, reason: "unable to allocate private staging" })
      ),
    );
    const produced = yield* producer.produce(request, staging);
    if (produced.protocol !== producedProtocol) return yield* reject("analysis", "unknown producer protocol major");
    if (produced.format !== request.format) return yield* reject("analysis", "producer changed the requested format");
    if (produced.inputs.length !== 1 || produced.inputs[0] !== request.entrypoint) {
      return yield* reject("analysis", "portable main must contain exactly the requested input");
    }
    const inadmissible = produced.runtimeImports.filter((specifier) => !isBuiltin(specifier));
    if (inadmissible.length > 0) {
      return yield* reject("analysis", `inadmissible runtime imports: ${inadmissible.join(", ")}`);
    }
    const expectedName = request.format === "module" ? "main.mjs" : "main.cjs";
    const expectedPath = path.normalize(path.join(staging, expectedName));
    if (path.normalize(produced.path) !== expectedPath) {
      return yield* reject("analysis", `producer output must be exactly ${expectedName}`);
    }
    const borrowed = yield* BorrowedContent.observeFile(produced.path);
    if (borrowed.bytes === 0) return yield* reject("analysis", "portable main is empty");
    const bytes = yield* fileSystem.readFile(produced.path).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: produced.path, reason: "unable to read produced main" })),
    );
    const sourceProblem = validateSource(new TextDecoder().decode(bytes));
    if (sourceProblem !== undefined) return yield* reject("analysis", sourceProblem);
    yield* BorrowedContent.revalidate(borrowed);
    return Object.freeze({
      protocol,
      profile,
      format: request.format,
      path: borrowed.path,
      bytes: borrowed.bytes,
      digest: borrowed.digest,
      producer: producer.identity,
    });
  });
