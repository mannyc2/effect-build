import { Cause, Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { ArtifactInvalid } from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import type {
  SelectedToolChanged,
  ToolNotFound,
  ToolSelectionAmbiguous,
  ToolSelectionInvalid,
} from "effect-build/Author/Tool";
import { type ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  NodeSeaCommandFailed,
  NodeSeaInputInvalid,
  NodeSeaRelationRejected,
  NodeSeaTransportFailed,
  NodeSeaUnsupported,
  type Operation,
} from "./Error.js";

export interface LayerOptions {
  readonly builderExecutable?: Artifact.AbsolutePath;
  readonly baseExecutable?: Artifact.AbsolutePath;
  readonly allowUntestedVersion?: boolean;
  readonly outputLimitBytes?: number;
}

export interface CapturedOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly truncated: boolean;
}

interface Completion {
  readonly exitCode: number;
  readonly stdout: CapturedOutput;
  readonly stderr: CapturedOutput;
}

interface SelectedNode {
  readonly selected: Tool.SelectedTool<"node">;
  readonly version: string;
  readonly target: "linux-x64-gnu";
  readonly buildSea: true;
}

export interface Service {
  readonly builder: SelectedNode;
  readonly base: SelectedNode;
  readonly admission: Tool.Admission;
  readonly runChecked: (
    operation: "check-main" | "assemble-direct",
    argv: readonly string[],
    cwd: string,
    includeBase: boolean,
  ) => Effect.Effect<void, RunError>;
}

export class Runtime extends Context.Service<Runtime, Service>()("effect-build-node-sea/Command/Runtime") {}

export type ProbeError = NodeSeaTransportFailed | NodeSeaCommandFailed | NodeSeaUnsupported;
export type RunError = ArtifactInvalid | SelectedToolChanged | NodeSeaTransportFailed | NodeSeaCommandFailed;
export type LayerError =
  | ToolNotFound
  | ToolSelectionAmbiguous
  | ToolSelectionInvalid
  | ArtifactInvalid
  | SelectedToolChanged
  | NodeSeaInputInvalid
  | NodeSeaUnsupported
  | NodeSeaRelationRejected
  | NodeSeaTransportFailed
  | NodeSeaCommandFailed;

interface Accumulator {
  readonly chunks: readonly Uint8Array[];
  readonly retained: number;
  readonly truncated: boolean;
}

const collect = (stream: Stream.Stream<Uint8Array, unknown>, limit: number): Effect.Effect<CapturedOutput, unknown> =>
  Stream.runFold(
    stream,
    (): Accumulator => ({ chunks: [], retained: 0, truncated: false }),
    (state, chunk) => {
      const available = Math.max(0, limit - state.retained);
      const retained = chunk.byteLength <= available ? chunk : chunk.subarray(0, available);
      return {
        chunks: retained.byteLength === 0 ? state.chunks : [...state.chunks, retained],
        retained: state.retained + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.retained);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

const invoke = (
  command: ChildProcess.Command,
  operation: Operation,
  limit: number,
): Effect.Effect<Completion, NodeSeaTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new NodeSeaTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, limit), collect(handle.stderr, limit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new NodeSeaTransportFailed({ operation, cause: error })))
        ),
      );
      return { stdout, stderr, exitCode: Number(exitCode) };
    }),
  );

const checked = (
  command: ChildProcess.Command,
  operation: Operation,
  limit: number,
): Effect.Effect<Completion, NodeSeaTransportFailed | NodeSeaCommandFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  invoke(command, operation, limit).pipe(
    Effect.flatMap((completion) =>
      completion.exitCode === 0
        ? Effect.succeed(completion)
        : Effect.fail(
          new NodeSeaCommandFailed({
            operation,
            exitCode: completion.exitCode,
            stdout: completion.stdout.bytes,
            stderr: completion.stderr.bytes,
            stdoutTruncated: completion.stdout.truncated,
            stderrTruncated: completion.stderr.truncated,
          }),
        )
    ),
  );

const exactKeys = (value: object, allowed: readonly string[]): string | undefined =>
  Object.keys(value).find((key) => !allowed.includes(key));

const parseOptions = (
  raw?: LayerOptions,
): Effect.Effect<
  Required<Pick<LayerOptions, "allowUntestedVersion" | "outputLimitBytes">> & LayerOptions,
  NodeSeaInputInvalid
> => {
  if (raw !== undefined) {
    const unexpected = exactKeys(raw, [
      "builderExecutable",
      "baseExecutable",
      "allowUntestedVersion",
      "outputLimitBytes",
    ]);
    if (unexpected !== undefined) {
      return Effect.fail(new NodeSeaInputInvalid({ operation: "layer", reason: `unknown option ${unexpected}` }));
    }
  }
  const outputLimitBytes = raw?.outputLimitBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0) {
    return Effect.fail(
      new NodeSeaInputInvalid({
        operation: "layer",
        reason: "outputLimitBytes must be a positive safe integer",
      }),
    );
  }
  if (raw?.allowUntestedVersion !== undefined && typeof raw.allowUntestedVersion !== "boolean") {
    return Effect.fail(new NodeSeaInputInvalid({ operation: "layer", reason: "allowUntestedVersion must be boolean" }));
  }
  return Effect.succeed({ ...raw, outputLimitBytes, allowUntestedVersion: raw?.allowUntestedVersion ?? false });
};

const targetExpression =
  "JSON.stringify({platform:process.platform,arch:process.arch,glibc:Boolean(process.report?.getReport()?.header?.glibcVersionRuntime)})";

const observeNode = (
  candidate: Tool.Candidate<"node">,
  role: "builder" | "base",
  limit: number,
): Effect.Effect<Tool.Observation<"node">, ProbeError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const versionCompletion = yield* checked(candidate.command(["--version"]), "probe-version", limit);
    const version = versionCompletion.stdout.text.trim().replace(/^v/u, "");
    if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/u.test(version)) {
      return yield* new NodeSeaUnsupported({
        operation: "probe-version",
        version,
        reason: "Node returned a non-canonical version",
      });
    }
    const help = yield* checked(candidate.command(["--help"]), "probe-capability", limit);
    const buildSea = /(?:^|\s)--build-sea(?:[=\s]|$)/mu.test(`${help.stdout.text}\n${help.stderr.text}`);
    if (!buildSea) {
      return yield* new NodeSeaUnsupported({
        operation: "probe-capability",
        version,
        reason: "the exact selected binary does not expose --build-sea",
      });
    }
    const targetCompletion = yield* checked(candidate.command(["-p", targetExpression]), "probe-target", limit);
    let raw: unknown;
    try {
      raw = JSON.parse(targetCompletion.stdout.text.trim());
    } catch {
      return yield* new NodeSeaUnsupported({
        operation: "probe-target",
        version,
        reason: "the exact selected binary returned an invalid target observation",
      });
    }
    const target = raw as { readonly platform?: unknown; readonly arch?: unknown; readonly glibc?: unknown };
    if (target.platform !== "linux" || target.arch !== "x64" || target.glibc !== true) {
      return yield* new NodeSeaUnsupported({
        operation: "probe-target",
        version,
        reason: "only the certified linux-x64-gnu direct SEA cell is admitted",
      });
    }
    return Object.freeze({
      name: "node" as const,
      participants: Object.freeze([Object.freeze({
        role,
        name: "node",
        version,
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "node-build-sea", evidence: "exact-binary-help-probe" },
        { _tag: "Present" as const, id: "node-linux-x64-gnu", evidence: "exact-binary-runtime-probe" },
        { _tag: "Indeterminate" as const, id: "node-lief", reason: "proved by each successful direct assembly" },
      ]),
    });
  });

const selectedNode = (
  executable: Artifact.AbsolutePath | undefined,
  role: "builder" | "base",
  limit: number,
): Effect.Effect<
  SelectedNode,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  ToolAuthor.select({
    name: "node",
    ...(executable === undefined ? {} : { executable }),
    observe: (candidate) => observeNode(candidate, role, limit),
  }).pipe(
    Effect.map((selected) => ({
      selected,
      version: selected.observation.participants[0].version,
      target: "linux-x64-gnu" as const,
      buildSea: true as const,
    })),
  );

const makeService = (
  raw?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const options = yield* parseOptions(raw);
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const services = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(FileSystem.FileSystem, fileSystem),
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    const probeLimit = Math.min(options.outputLimitBytes, 64 * 1024);
    const builder = yield* selectedNode(options.builderExecutable, "builder", probeLimit);
    const base = options.baseExecutable === undefined || options.baseExecutable === builder.selected.executablePath
      ? builder
      : yield* selectedNode(options.baseExecutable, "base", probeLimit);
    if (builder.version !== base.version) {
      return yield* new NodeSeaRelationRejected({
        relation: "node-builder-base",
        reason: `builder ${builder.version} and base ${base.version} must be identical versions`,
      });
    }
    const definition = ToolAuthor.define({
      tool: builder.selected,
      evaluate: (_request: "assemble-direct") =>
        builder.version === "26.7.0"
          ? Effect.succeed({
            _tag: "ReviewedAdmission" as const,
            admissionKey: "node@26.7.0:linux-x64-gnu:assemble-direct",
          })
          : options.allowUntestedVersion
          ? Effect.succeed({
            _tag: "UntestedOverride" as const,
            admissionKey: `node@${builder.version}:linux-x64-gnu:assemble-direct`,
            warningCode: "EFFECT_BUILD_UNTESTED_VERSION" as const,
          })
          : Effect.fail(
            new NodeSeaUnsupported({
              operation: "assemble-direct",
              version: builder.version,
              reason: "only exact Node 26.7.0 is reviewed; set allowUntestedVersion for an explicit untested override",
            }),
          ),
    });
    const admission = yield* definition.evaluate("assemble-direct");
    const runChecked: Service["runChecked"] = (operation, argv, cwd, includeBase) =>
      Effect.gen(function*() {
        if (includeBase && base.selected.executablePath !== builder.selected.executablePath) {
          yield* base.selected.reauthenticate;
        }
        yield* builder.selected.reauthenticate;
        yield* checked(
          builder.selected.command(argv, { cwd, forceKillAfter: "2 seconds" }),
          operation,
          options.outputLimitBytes,
        );
      }).pipe(Effect.provide(services));
    return { builder, base, admission, runChecked };
  });

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Runtime,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Runtime, makeService(options));
