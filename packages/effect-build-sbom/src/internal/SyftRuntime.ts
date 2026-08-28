import { Cause, Context, Crypto, Effect, FileSystem, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  SyftCommandFailed,
  SyftOutputTruncated,
  SyftToolChanged,
  SyftToolUnavailable,
  SyftTransportFailed,
} from "./SbomError.js";

export interface Options {
  readonly executable?: string;
  readonly outputLimitBytes?: number;
}

interface CapturedOutput {
  readonly text: string;
  readonly truncated: boolean;
}

interface Completion {
  readonly exitCode: number;
  readonly stdout: CapturedOutput;
  readonly stderr: CapturedOutput;
}

export type Failure = SyftToolChanged | SyftTransportFailed | SyftCommandFailed | SyftOutputTruncated;
export type SelectionFailure = SyftToolUnavailable | Failure;

export interface Runtime {
  readonly tool: Tool.Observation<"syft">;
  readonly version: string;
  readonly runScan: (format: string, argv: readonly string[], cwd?: string) => Effect.Effect<void, Failure>;
}

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
      return { text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

const execute = (
  command: ChildProcess.Command,
  operation: "probe" | "scan",
  limit: number,
): Effect.Effect<Completion, SyftTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new SyftTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, limit), collect(handle.stderr, limit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new SyftTransportFailed({ operation, cause: error })))
        ),
      );
      return { exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const checked = (
  operation: "probe" | "scan",
  completion: Completion,
  limit: number,
): Effect.Effect<Completion, SyftCommandFailed | SyftOutputTruncated> => {
  if (completion.exitCode !== 0) {
    return Effect.fail(
      new SyftCommandFailed({
        operation,
        exitCode: completion.exitCode,
        stdout: completion.stdout.text,
        stderr: completion.stderr.text,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      }),
    );
  }
  if (completion.stdout.truncated || completion.stderr.truncated) {
    return Effect.fail(new SyftOutputTruncated({ operation, outputLimitBytes: limit }));
  }
  return Effect.succeed(completion);
};

const parseVersion = (stdout: string): string | undefined =>
  /^Version:\s*(\S+)\s*$/miu.exec(stdout)?.[1]
    ?? /(?:^|\s)syft\s+v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/miu.exec(stdout)?.[1];

const observe = (
  candidate: Tool.Candidate<"syft">,
): Effect.Effect<
  Tool.Observation<"syft">,
  SyftTransportFailed | SyftCommandFailed | SyftOutputTruncated,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const completion = yield* execute(candidate.command(["version"]), "probe", 64 * 1024).pipe(
      Effect.flatMap((result) => checked("probe", result, 64 * 1024)),
    );
    const version = parseVersion(completion.stdout.text);
    if (version === undefined) {
      return yield* new SyftCommandFailed({
        operation: "probe",
        exitCode: completion.exitCode,
        stdout: completion.stdout.text,
        stderr: completion.stderr.text,
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    }
    return Object.freeze({
      name: "syft" as const,
      participants: Object.freeze([Object.freeze({
        role: "selected-command",
        name: "syft",
        version,
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "syft-spdx-json-2.3", evidence: "spdx-json@2.3" },
        { _tag: "Present" as const, id: "syft-cyclonedx-json-1.6", evidence: "cyclonedx-json@1.6" },
        { _tag: "Present" as const, id: "syft-file-directory-scan", evidence: "explicit---from" },
      ]),
    });
  });

const supported = (version: string): boolean => /^1\.50(?:\.|$)/u.test(version);
const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const selectionFailure = (error: unknown): SelectionFailure => {
  if (
    error instanceof SyftTransportFailed || error instanceof SyftCommandFailed || error instanceof SyftOutputTruncated
  ) return error;
  if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "SelectedToolChanged") {
    const changed = error as unknown as { readonly path: string; readonly expected: string; readonly observed: string };
    return new SyftToolChanged({
      path: changed.path,
      reason: `expected ${changed.expected}, observed ${changed.observed}`,
    });
  }
  return new SyftToolUnavailable({ reason: describe(error) });
};

const changedFailure = (path: Artifact.AbsolutePath, error: unknown): SyftToolChanged =>
  new SyftToolChanged({ path, reason: describe(error) });

export const make = (
  rawOptions?: Options,
): Effect.Effect<
  Runtime,
  SelectionFailure,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const outputLimitBytes = rawOptions?.outputLimitBytes ?? 1024 * 1024;
    if (!Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0) {
      return yield* new SyftToolUnavailable({ reason: "outputLimitBytes must be a positive safe integer" });
    }
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const services = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(FileSystem.FileSystem, fileSystem),
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    const selected = yield* ToolAuthor.select({
      name: "syft",
      ...(rawOptions?.executable === undefined ? {} : { executable: rawOptions.executable }),
      observe,
    }).pipe(Effect.mapError(selectionFailure));
    const version = selected.observation.participants[0].version;
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (request: { readonly format: string }) =>
        Effect.succeed(
          supported(version)
            ? { _tag: "ReviewedAdmission" as const, admissionKey: `syft@${version}:scan:${request.format}` }
            : {
              _tag: "UntestedOverride" as const,
              admissionKey: `syft@${version}:scan:${request.format}`,
              warningCode: "EFFECT_BUILD_UNTESTED_VERSION" as const,
            },
        ),
    });
    if (!supported(version)) yield* Effect.logWarning(`Syft ${version} is outside the reviewed 1.50.x line`);

    const runScan: Runtime["runScan"] = (format, argv, cwd) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ format });
        yield* selected.reauthenticate.pipe(
          Effect.mapError((error) => changedFailure(selected.executablePath, error)),
        );
        const completion = yield* execute(
          selected.command(argv, { ...(cwd === undefined ? {} : { cwd }), forceKillAfter: "2 seconds" }),
          "scan",
          outputLimitBytes,
        );
        yield* checked("scan", completion, outputLimitBytes);
      }).pipe(Effect.provide(services));
    return { tool: selected.observation, version, runScan };
  });
