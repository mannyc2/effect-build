import { Config, Crypto, Effect, FileSystem, Option, Path, Schema } from "effect";
import { ChildProcess } from "effect/unstable/process";
import type { AbsolutePath, DecimalBytes, Digest } from "../Artifact.js";
import * as Artifact from "../Artifact.js";

export class ToolNotFound extends Schema.TaggedError<ToolNotFound>()("ToolNotFound", {
  tool: Schema.String,
  command: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} executable not found: ${this.command}`;
  }
}

export class ToolSelectionInvalid extends Schema.TaggedError<ToolSelectionInvalid>()(
  "ToolSelectionInvalid",
  { tool: Schema.String, reason: Schema.String },
) {}

export class ToolSelectionAmbiguous extends Schema.TaggedError<ToolSelectionAmbiguous>()(
  "ToolSelectionAmbiguous",
  { tool: Schema.String, candidates: Schema.Array(Schema.String) },
) {}

export class SelectedToolChanged extends Schema.TaggedError<SelectedToolChanged>()("SelectedToolChanged", {
  tool: Schema.String,
  path: Schema.String,
  expected: Schema.String,
  observed: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} executable changed at ${this.path}: expected ${this.expected}, observed ${this.observed}`;
  }
}

export type { DecimalBytes, Digest, Sha256Value } from "../Artifact.js";

export interface ContentIdentity {
  readonly digest: Digest;
  readonly bytes: DecimalBytes;
}

export const decimalBytes = Artifact.decimalBytes;
export const sha256Digest = Artifact.sha256Digest;

export interface ParticipantIdentity {
  readonly role: string;
  readonly name: string;
  readonly version: string;
  readonly revision: string;
  readonly channel: string;
  readonly content: ContentIdentity;
}

export type CapabilityObservation =
  | { readonly _tag: "Present"; readonly id: string; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly id: string; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly id: string; readonly reason: string };

export interface Observation<Name extends string> {
  readonly name: Name;
  readonly participants: readonly [ParticipantIdentity, ...ParticipantIdentity[]];
  readonly capabilities: readonly CapabilityObservation[];
}

export type Admission =
  | { readonly _tag: "ReviewedAdmission"; readonly admissionKey: string }
  | {
    readonly _tag: "UntestedOverride";
    readonly admissionKey: string;
    readonly warningCode: "EFFECT_BUILD_UNTESTED_VERSION";
  };

export type CommandOptions = Omit<ChildProcess.CommandOptions, "shell">;

export interface Candidate<Name extends string> {
  readonly name: Name;
  readonly executablePath: AbsolutePath;
  readonly content: ContentIdentity;
  readonly command: (argv: readonly string[], options?: CommandOptions) => ChildProcess.Command;
}

export interface SelectedTool<Name extends string = string> extends Candidate<Name> {
  readonly protocol: "effect-build/selected-tool@1";
  readonly observation: Observation<Name>;
  /** Re-observes exact bytes; providers sequence this immediately before yielding `command(...)`. */
  readonly reauthenticate: Effect.Effect<
    void,
    Artifact.ArtifactInvalid | SelectedToolChanged,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path
  >;
}

export interface SelectOptions<Name extends string, ObserveError, Requirements = never> {
  readonly name: Name;
  /** Explicit selection is accepted only when already absolute. */
  readonly executable?: string | undefined;
  /** Provider-owned version, revision, channel, capability, and probe semantics. */
  readonly observe: (candidate: Candidate<Name>) => Effect.Effect<Observation<Name>, ObserveError, Requirements>;
}

export interface Definition<Name extends string, Request, Refusal, Requirements = never> {
  readonly tool: SelectedTool<Name>;
  /** Provider-owned finite policy; core supplies no version-range or relation DSL. */
  readonly evaluate: (request: Request) => Effect.Effect<Admission, Refusal, Requirements>;
}

export const define = <Name extends string, Request, Refusal, Requirements = never>(
  definition: Definition<Name, Request, Refusal, Requirements>,
): Definition<Name, Request, Refusal, Requirements> => Object.freeze(definition);

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const invalid = (path: string, reason: string): Artifact.ArtifactInvalid =>
  new Artifact.ArtifactInvalid({ path, reason });

const observeContent = (
  executablePath: AbsolutePath,
): Effect.Effect<ContentIdentity, Artifact.ArtifactInvalid, Crypto.Crypto | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const information = yield* fileSystem.stat(executablePath).pipe(
      Effect.mapError(() => invalid(executablePath, "unable to inspect selected executable")),
    );
    if (information.type !== "File") return yield* invalid(executablePath, "selected executable is not a file");
    const contents = yield* fileSystem.readFile(executablePath).pipe(
      Effect.mapError(() => invalid(executablePath, "unable to read selected executable")),
    );
    if (`${contents.byteLength}` !== `${information.size}`) {
      return yield* invalid(executablePath, "selected executable changed during observation");
    }
    const digest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => invalid(executablePath, "sha-256 digest unavailable")),
    );
    return Object.freeze({
      bytes: decimalBytes(`${contents.byteLength}`),
      digest: sha256Digest(hex(new Uint8Array(digest))),
    });
  });

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.bytes === right.bytes && left.digest.value === right.digest.value;

const makeCommand =
  (executablePath: AbsolutePath) => (argv: readonly string[], options: CommandOptions = {}): ChildProcess.Command =>
    ChildProcess.make(executablePath, argv, { ...options, shell: false });

const canonicalCandidate = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  candidate: string,
): Effect.Effect<AbsolutePath | undefined> =>
  Effect.gen(function*() {
    const canonical = yield* Effect.option(fileSystem.realPath(candidate));
    if (Option.isNone(canonical)) return undefined;
    const normalized = path.normalize(canonical.value);
    if (!path.isAbsolute(normalized)) return undefined;
    const information = yield* Effect.option(fileSystem.stat(normalized));
    if (Option.isNone(information) || information.value.type !== "File") return undefined;
    if (path.sep !== "\\" && (Number(information.value.mode) & 0o111) === 0) return undefined;
    return normalized as AbsolutePath;
  });

const resolve = <Name extends string>(
  name: Name,
  explicit: string | undefined,
): Effect.Effect<
  AbsolutePath,
  ToolNotFound | ToolSelectionAmbiguous | ToolSelectionInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (explicit !== undefined) {
      if (!path.isAbsolute(explicit) || path.normalize(explicit) !== explicit) {
        return yield* new ToolSelectionInvalid({
          tool: name,
          reason: "explicit executable must be an absolute normalized path",
        });
      }
      const candidate = yield* canonicalCandidate(fileSystem, path, explicit);
      if (candidate === undefined) return yield* new ToolNotFound({ tool: name, command: explicit });
      return candidate;
    }

    const environment = yield* Config.string("PATH").pipe(Effect.orElseSucceed(() => ""));
    const candidates = new Map<string, AbsolutePath>();
    const names = path.sep === "\\" ? [name, `${name}.exe`] : [name];
    for (const entry of environment.split(path.sep === "\\" ? ";" : ":")) {
      if (entry.length === 0 || !path.isAbsolute(entry)) continue;
      for (const executableName of names) {
        const candidate = yield* canonicalCandidate(fileSystem, path, path.join(entry, executableName));
        if (candidate !== undefined) candidates.set(candidate, candidate);
      }
    }
    const unique = [...candidates.values()];
    if (unique.length === 0) return yield* new ToolNotFound({ tool: name, command: name });
    if (unique.length > 1) {
      return yield* new ToolSelectionAmbiguous({ tool: name, candidates: unique });
    }
    return unique[0]!;
  });

const changed = (name: string, path: AbsolutePath, expected: ContentIdentity, observed: ContentIdentity) =>
  new SelectedToolChanged({
    tool: name,
    path,
    expected: expected.digest.value,
    observed: observed.digest.value,
  });

/**
 * Selects and observes exactly one executable. Selection never installs,
 * substitutes, retries, or treats a contiguous version range as evidence.
 */
export const select = <const Name extends string, ObserveError, Requirements = never>(
  options: SelectOptions<Name, ObserveError, Requirements>,
): Effect.Effect<
  SelectedTool<Name>,
  | ToolNotFound
  | ToolSelectionAmbiguous
  | ToolSelectionInvalid
  | Artifact.ArtifactInvalid
  | SelectedToolChanged
  | ObserveError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | Requirements
> =>
  Effect.gen(function*() {
    const executablePath = yield* resolve(options.name, options.executable);
    const before = yield* observeContent(executablePath);
    const command = makeCommand(executablePath);
    const observation = yield* options.observe(Object.freeze({
      name: options.name,
      executablePath,
      content: before,
      command,
    }));
    const after = yield* observeContent(executablePath);
    if (!sameContent(before, after)) return yield* changed(options.name, executablePath, before, after);

    const reauthenticate = Effect.suspend(() =>
      observeContent(executablePath).pipe(
        Effect.flatMap((observed) =>
          sameContent(before, observed)
            ? Effect.void
            : Effect.fail(changed(options.name, executablePath, before, observed))
        ),
      )
    );
    return Object.freeze({
      protocol: "effect-build/selected-tool@1" as const,
      name: options.name,
      executablePath,
      content: before,
      observation: Object.freeze(observation),
      command,
      reauthenticate,
    });
  });
