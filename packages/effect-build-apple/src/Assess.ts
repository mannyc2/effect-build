import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

export type AssessableArtifact =
  | Artifact.FileArtifact<"mach-o" | "disk-image" | "installer-package">
  | Artifact.TreeArtifact<"app-bundle">;

export type AssessmentType = "execute" | "install" | "open";

export interface SignatureObservation {
  readonly valid: boolean;
  readonly invocation: Artifact.ToolInvocation;
}

export interface GatekeeperObservation {
  readonly accepted: boolean;
  readonly type: AssessmentType;
  readonly exitCode: 0 | 3;
  /** Opaque, bounded XML plist from `spctl --raw`; its keys are not a stable API. */
  readonly rawPlist: string;
  readonly invocation: Artifact.ToolInvocation;
}

export interface Assessment {
  readonly subject: Artifact.ArtifactReference;
  readonly signature: SignatureObservation;
  readonly gatekeeper: GatekeeperObservation;
  readonly snapshot: Artifact.ArtifactReference;
  readonly tools: readonly Artifact.ToolInvocation[];
  readonly completedAtEpochMillis: number;
  /** This is a build-host observation, never a clean-host Gatekeeper certification. */
  readonly scope: "local-static-observation";
}

export interface LayerOptions {
  readonly codesignPath?: string;
  readonly dittoPath?: string;
  readonly pkgutilPath?: string;
  readonly spctlPath?: string;
}

export class AssessmentToolFailed extends Schema.TaggedError<AssessmentToolFailed>()("AssessmentToolFailed", {
  tool: Schema.String,
  path: Schema.String,
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
}) {}

export type AssessError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.ArtifactError
  | Artifact.LifecycleError
  | Artifact.ToolError
  | AssessmentToolFailed;

interface Service {
  readonly assess: (artifact: AssessableArtifact) => Effect.Effect<Assessment, AssessError>;
}

export class Assessor extends Context.Service<Assessor, Service>()("effect-build-apple/Assess/Assessor") {}

const operation = "assess";
const supported = ["mach-o", "app-bundle", "disk-image", "installer-package"] as const;

const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const assessmentType = (artifact: AssessableArtifact): AssessmentType => {
  if (artifact.kind === "installer-package") return "install";
  if (artifact.kind === "disk-image") return "open";
  return "execute";
};

const validate = (artifact: AssessableArtifact): Effect.Effect<void, Artifact.UnsupportedArtifactKind> =>
  supported.includes(actualKind(artifact) as typeof supported[number])
    ? Effect.void
    : Effect.fail(
      new Artifact.UnsupportedArtifactKind({
        operation,
        actual: actualKind(artifact),
        expected: [...supported],
      }),
    );

const makeService = (
  options: LayerOptions = {},
): Effect.Effect<
  Service,
  Artifact.ToolError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const codesign = yield* Tool.select({ name: "codesign", path: options.codesignPath ?? "/usr/bin/codesign" });
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const pkgutil = yield* Tool.select({ name: "pkgutil", path: options.pkgutilPath ?? "/usr/sbin/pkgutil" });
    const spctl = yield* Tool.select({ name: "spctl", path: options.spctlPath ?? "/usr/sbin/spctl" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const assess = (artifact: AssessableArtifact): Effect.Effect<Assessment, AssessError> =>
      Effect.scoped(
        Effect.gen(function*() {
          yield* validate(artifact);
          const copied = yield* Lifecycle.copyAuthenticatedScoped({ input: artifact, copyTool: ditto });
          const signature = artifact.kind === "installer-package"
            ? yield* Tool.run({ tool: pkgutil, args: ["--check-signature", copied.artifact.path] })
            : yield* Tool.run({
              tool: codesign,
              args: [
                "--verify",
                ...(artifact.kind === "app-bundle" ? ["--deep"] : []),
                "--strict",
                "--verbose=2",
                copied.artifact.path,
              ],
            });
          const type = assessmentType(artifact);
          const gatekeeper = yield* Tool.run({
            tool: spctl,
            args: [
              "--assess",
              "--type",
              type,
              "--ignore-cache",
              "--no-cache",
              "--raw",
              copied.artifact.path,
            ],
          });
          if (gatekeeper.exitCode !== 0 && gatekeeper.exitCode !== 3) {
            return yield* new AssessmentToolFailed({
              tool: gatekeeper.tool.name,
              path: gatekeeper.tool.path,
              exitCode: gatekeeper.exitCode,
              stdout: gatekeeper.stdout.text,
              stderr: gatekeeper.stderr.text,
            });
          }
          yield* Artifact.revalidate(copied.artifact);
          yield* Artifact.revalidate(artifact);
          return Object.freeze({
            subject: Artifact.reference(artifact),
            signature: Object.freeze({ valid: signature.exitCode === 0, invocation: signature }),
            gatekeeper: Object.freeze({
              accepted: gatekeeper.exitCode === 0,
              type,
              exitCode: gatekeeper.exitCode,
              rawPlist: gatekeeper.stdout.text,
              invocation: gatekeeper,
            }),
            snapshot: Artifact.reference(copied.artifact),
            tools: Object.freeze([...copied.tools, signature, gatekeeper]),
            completedAtEpochMillis: gatekeeper.completedAtEpochMillis,
            scope: "local-static-observation" as const,
          });
        }),
      ).pipe(Effect.provide(services));

    return { assess };
  });

export const assess = (
  artifact: AssessableArtifact,
): Effect.Effect<Assessment, AssessError, Assessor> => Assessor.use((service) => service.assess(artifact));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Assessor,
  Artifact.ToolError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Assessor, makeService(options));
