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

const nonEmptyObservationString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !value.includes("\0");

const copyContentIdentity = (value: unknown): ContentIdentity | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const content = value as { readonly bytes?: unknown; readonly digest?: unknown };
  if (typeof content.bytes !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(content.bytes)) return undefined;
  if (typeof content.digest !== "object" || content.digest === null) return undefined;
  const digest = content.digest as { readonly algorithm?: unknown; readonly value?: unknown };
  if (digest.algorithm !== "sha256" || typeof digest.value !== "string" || !/^[0-9a-f]{64}$/u.test(digest.value)) {
    return undefined;
  }
  return Object.freeze({
    bytes: decimalBytes(content.bytes),
    digest: sha256Digest(digest.value),
  });
};

const invalidObservation = (tool: string, reason: string): ToolSelectionInvalid =>
  new ToolSelectionInvalid({ tool, reason });

const copyObservation = <const Name extends string>(
  name: Name,
  value: unknown,
): Effect.Effect<Observation<Name>, ToolSelectionInvalid> =>
  Effect.gen(function*() {
    if (typeof value !== "object" || value === null) {
      return yield* invalidObservation(name, "tool observation must be an object");
    }
    const observation = value as {
      readonly name?: unknown;
      readonly participants?: unknown;
      readonly capabilities?: unknown;
    };
    if (observation.name !== name) {
      return yield* invalidObservation(name, "tool observation name does not match the selected tool");
    }
    if (!Array.isArray(observation.participants) || observation.participants.length === 0) {
      return yield* invalidObservation(name, "tool observation requires at least one participant");
    }
    const participants: ParticipantIdentity[] = [];
    for (const value of observation.participants) {
      if (typeof value !== "object" || value === null) {
        return yield* invalidObservation(name, "tool observation contains an invalid participant");
      }
      const participant = value as Partial<Record<keyof ParticipantIdentity, unknown>>;
      if (
        !nonEmptyObservationString(participant.role)
        || !nonEmptyObservationString(participant.name)
        || !nonEmptyObservationString(participant.version)
        || !nonEmptyObservationString(participant.revision)
        || !nonEmptyObservationString(participant.channel)
      ) {
        return yield* invalidObservation(name, "tool observation contains an incomplete participant identity");
      }
      const content = copyContentIdentity(participant.content);
      if (content === undefined) {
        return yield* invalidObservation(name, "tool observation contains an invalid participant content identity");
      }
      participants.push(Object.freeze({
        role: participant.role,
        name: participant.name,
        version: participant.version,
        revision: participant.revision,
        channel: participant.channel,
        content,
      }));
    }
    if (!Array.isArray(observation.capabilities)) {
      return yield* invalidObservation(name, "tool observation capabilities must be an array");
    }
    const capabilities: CapabilityObservation[] = [];
    for (const value of observation.capabilities) {
      if (typeof value !== "object" || value === null) {
        return yield* invalidObservation(name, "tool observation contains an invalid capability");
      }
      const capability = value as {
        readonly _tag?: unknown;
        readonly id?: unknown;
        readonly evidence?: unknown;
        readonly reason?: unknown;
      };
      if (!nonEmptyObservationString(capability.id)) {
        return yield* invalidObservation(name, "tool observation contains a capability without an id");
      }
      if (capability._tag === "Present") {
        if (!nonEmptyObservationString(capability.evidence)) {
          return yield* invalidObservation(name, "present capability observation requires evidence");
        }
        capabilities.push(Object.freeze({ _tag: "Present", id: capability.id, evidence: capability.evidence }));
      } else if (capability._tag === "Missing" || capability._tag === "Indeterminate") {
        if (!nonEmptyObservationString(capability.reason)) {
          return yield* invalidObservation(name, `${capability._tag} capability observation requires a reason`);
        }
        capabilities.push(Object.freeze({ _tag: capability._tag, id: capability.id, reason: capability.reason }));
      } else {
        return yield* invalidObservation(name, "tool observation contains an unknown capability tag");
      }
    }
    return Object.freeze({
      name,
      participants: Object.freeze(participants) as readonly [ParticipantIdentity, ...ParticipantIdentity[]],
      capabilities: Object.freeze(capabilities),
    });
  });

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
    const observed = yield* options.observe(Object.freeze({
      name: options.name,
      executablePath,
      content: before,
      command,
    }));
    const observation = yield* copyObservation(options.name, observed);
    const primary = observation.participants[0];
    if (primary.name !== options.name || !sameContent(primary.content, before)) {
      return yield* invalidObservation(
        options.name,
        "primary participant identity does not match the selected executable",
      );
    }
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
      observation,
      command,
      reauthenticate,
    });
  });
