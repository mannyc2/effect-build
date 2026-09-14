import { Cause, Crypto, Deferred, Effect, Exit, Fiber, FileSystem, Path, Schema, Scope } from "effect";
import * as Artifact from "../Artifact.js";
import type * as Commit from "../Commit.js";
import * as Executable from "../Executable.js";
import * as Tool from "../Tool.js";

export type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;

export class ConformanceFailure extends Schema.TaggedError<ConformanceFailure>()("ConformanceFailure", {
  operation: Schema.String,
  guarantee: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.operation}: ${this.guarantee}: ${this.detail}`;
  }
}

/** Call inside the actual production boundary: a scripted process or an in-process tool hook.
 * Write provisional output first when the tool permits it. Return a tool failure when enter returns true.
 * The suite checks that this hook ran; an unobserved guarantee never passes silently. */
export interface Control {
  readonly directory: string;
  readonly enter: (output: string) => Effect.Effect<boolean, never, Fs>;
}

export interface ConstraintWitness<A extends Artifact.Artifact, R> {
  /** The declaration itself, shared with the provider; conditional constraints need activating input. */
  readonly constraint: Tool.Constraint;
  readonly version: string;
  readonly run: (output: string, options: Commit.ProducerOptions) => Effect.Effect<A, unknown, R>;
}

/** Adapt the operation's output field here, whether it is outfile, outdir, or a richer input.
 * A fresh fixture is made for every case. Dependencies remain visible in R. */
export interface Fixture<A extends Artifact.Artifact, R> {
  readonly run: (output: string, options: Commit.ProducerOptions) => Effect.Effect<A, unknown, R>;
  /** Count all tool/API invocations, including preparatory queries. */
  readonly calls: Effect.Effect<number, never, R>;
  readonly provider?: {
    readonly tool: Tool.Resolved;
    readonly constraints: Readonly<Record<string, readonly Tool.Constraint[]>>;
  } | undefined;
  readonly constraints?: readonly ConstraintWitness<A, R>[] | undefined;
}

export interface Subject<A extends Artifact.Artifact, R, E, R0> {
  readonly operation: string;
  readonly kind: A["kind"];
  /** Include a suffix required by the operation, such as output.exe or output.whl. */
  readonly outputName?: string | undefined;
  /** Expected POSIX root mode (default 0755). Windows has no equivalent POSIX permission bits;
   * every host still verifies the recorded root mode against the actual filesystem. */
  readonly rootMode?: number | undefined;
  readonly make: (control: Control) => Effect.Effect<Fixture<A, R>, E, R0>;
}

export interface Case<R> {
  readonly name: string;
  readonly run: Effect.Effect<void, ConformanceFailure, R>;
}

type Mode = "success" | "failure" | "interruption";

/** Runner-independent cases covering the producer contract on real files, with explicit native hooks.
 * Provide a real FileSystem, Path and Crypto layer to each case. No compiler installation is needed. */
export const conformance = <A extends Artifact.Artifact, R, E, R0>(
  subject: Subject<A, R, E, R0>,
): readonly Case<Exclude<R | R0, Scope.Scope> | Fs>[] => {
  const check = (condition: boolean, guarantee: string, detail: string) =>
    condition
      ? Effect.void
      : Effect.fail(new ConformanceFailure({ operation: subject.operation, guarantee, detail }));
  const names = [
    "staged output",
    "failure leaves no trace",
    "interruption leaves no trace",
    "onExists: fail",
    "atomic: false",
    "custom staging prefix",
    "record matches disk",
    "input validation",
    "version constraints",
  ] as const;
  return names.map((name) => ({
    name: `${subject.operation}: ${name}`,
    run: Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-conformance-" });
      let destination = p.join(directory, subject.outputName ?? "output");
      const mode: Mode = name === "failure leaves no trace"
        ? "failure"
        : name === "interruption leaves no trace"
        ? "interruption"
        : "success";
      const direct = name === "atomic: false";
      let entered = yield* Deferred.make<void>();
      let release = yield* Deferred.make<void>();
      const observations: string[] = [];
      const violations: string[] = [];
      let previous: Artifact.Artifact | undefined;
      const control: Control = {
        directory,
        enter: (output) =>
          Effect.gen(function*() {
            observations.push(output);
            const resolved = p.resolve(output);
            if ((resolved === destination) !== direct) {
              violations.push(`production path ${resolved} does not satisfy atomic=${!direct} for ${destination}`);
            }
            if (!direct) {
              if (previous === undefined) {
                if (yield* fs.exists(destination)) violations.push("destination appeared before commit");
              } else {
                const verified = yield* Artifact.verify(previous).pipe(Effect.exit);
                if (Exit.isFailure(verified)) violations.push("previous destination changed before commit");
              }
            }
            yield* Deferred.succeed(entered, undefined);
            if (mode === "interruption") yield* Deferred.await(release);
            return mode === "failure";
          }).pipe(Effect.orDie),
      };
      const fixture = yield* subject.make(control);
      const output = (path = destination, options: Commit.ProducerOptions = {}) => {
        destination = path;
        return fixture.run(path, options);
      };
      const noStaging = Effect.gen(function*() {
        const entries = yield* fs.readDirectory(directory);
        yield* check(
          !entries.some((entry) => entry.startsWith(".effect-build-") || entry.startsWith(".requested-")),
          name,
          `staging remains: ${entries.join(", ")}`,
        );
      });
      const assertFailure = (result: Exit.Exit<unknown, unknown>, tag?: string, operation?: string) =>
        Effect.gen(function*() {
          yield* check(Exit.isFailure(result), name, "operation unexpectedly succeeded");
          if (Exit.isSuccess(result)) return;
          const failure = Cause.findErrorOption(result.cause);
          yield* check(failure._tag === "Some", name, `expected a typed failure: ${Cause.pretty(result.cause)}`);
          if (failure._tag !== "Some") return;
          const error = failure.value;
          const actualTag: unknown = typeof error === "object" && error !== null
            ? Reflect.get(error, "_tag")
            : undefined;
          const message: unknown = typeof error === "object" && error !== null
            ? Reflect.get(error, "message")
            : undefined;
          yield* check(
            typeof actualTag === "string" && typeof message === "string"
              && String(error) === `${actualTag}: ${message}`,
            name,
            `error must print as Tag: message: ${String(error)}`,
          );
          if (tag !== undefined) {
            yield* check(actualTag === tag, name, `expected ${tag}, received ${String(actualTag)}`);
          }
          if (operation !== undefined) {
            yield* check(
              typeof error === "object" && error !== null && Reflect.get(error, "operation") === operation,
              name,
              "error does not name the operation",
            );
          }
        });
      const seed = Effect.gen(function*() {
        if (subject.kind === "directory") {
          yield* fs.makeDirectory(destination);
          yield* fs.writeFileString(p.join(destination, "previous"), "previous output");
          previous = yield* Artifact.directory(destination, { name: "fixture", version: "1" });
        } else {
          yield* fs.writeFileString(destination, "previous output");
          previous = yield* Artifact.file(destination, { name: "fixture", version: "1" });
        }
      });
      const observed = Effect.gen(function*() {
        yield* check(
          observations.length > 0,
          name,
          "production boundary was never observed; connect Control.enter to the tool or native hook",
        );
        yield* check(violations.length === 0, name, violations.join("; "));
      });
      if (name === "input validation") {
        for (const invalid of ["", "out\0put"]) {
          const calls = yield* fixture.calls;
          yield* assertFailure(yield* output(invalid).pipe(Effect.exit), "InputInvalid", subject.operation);
          yield* check((yield* fixture.calls) === calls, name, "invalid input invoked a tool");
          yield* noStaging;
        }
        return;
      }
      if (name === "version constraints") {
        const declared = fixture.provider?.constraints[subject.operation] ?? [];
        const witnesses = fixture.constraints ?? [];
        yield* check(
          witnesses.length === declared.length,
          name,
          "each declared operation constraint needs exactly one activating witness",
        );
        for (const constraint of declared) {
          const matching = witnesses.filter((witness) => witness.constraint === constraint);
          yield* check(matching.length === 1, name, `missing or duplicate witness for ${constraint.range}`);
          for (const witness of matching) {
            yield* check(
              Tool.satisfies(constraint.range)(witness.version),
              name,
              `witness ${witness.version} is outside ${constraint.range}`,
            );
            const calls = yield* fixture.calls;
            yield* assertFailure(
              yield* witness.run(destination, {}).pipe(Effect.exit),
              "ToolVersionUnsupported",
              subject.operation,
            );
            yield* check((yield* fixture.calls) === calls, name, "rejected version invoked a tool");
          }
        }
        return;
      }
      if (name === "failure leaves no trace" || name === "interruption leaves no trace") {
        for (const existing of [false, true]) {
          entered = yield* Deferred.make<void>();
          release = yield* Deferred.make<void>();
          observations.length = 0;
          if (existing) yield* seed;
          if (mode === "failure") yield* assertFailure(yield* output().pipe(Effect.exit));
          else {
            const fiber = yield* output().pipe(Effect.forkScoped);
            // Race with completion: a missing hook must fail promptly instead of hanging the suite.
            yield* Effect.raceFirst(Deferred.await(entered), Fiber.await(fiber));
            yield* observed;
            const interrupting = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
            yield* Effect.yieldNow;
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(interrupting);
            const result = yield* Fiber.await(fiber);
            yield* check(
              Exit.isFailure(result) && Cause.hasInterrupts(result.cause),
              name,
              "interruption was translated or production completed",
            );
          }
          yield* observed;
          if (previous === undefined) {
            yield* check(!(yield* fs.exists(destination)), name, "failed output was committed");
          } else yield* Artifact.verify(previous);
          yield* noStaging;
        }
        return;
      }
      if (name === "onExists: fail") {
        yield* seed;
        const result = yield* output(destination, { onExists: "fail" }).pipe(Effect.exit);
        yield* assertFailure(result, "CommitError");
        if (Exit.isFailure(result)) {
          const error = Cause.findErrorOption(result.cause);
          const expected = subject.kind === "directory" ? "directory-no-replace-unsupported" : "exists";
          yield* check(
            error._tag === "Some" && typeof error.value === "object" && error.value !== null
              && Reflect.get(error.value, "reason") === expected,
            name,
            `expected ${expected}`,
          );
        }
        if (previous !== undefined) yield* Artifact.verify(previous);
        yield* noStaging;
        return;
      }
      const options = { atomic: !direct, prefix: name === "custom staging prefix" ? ".requested-" : undefined };
      const artifact = yield* output(destination, options);
      if (name === "custom staging prefix") {
        yield* check(
          observations.some((path) => path.split(p.sep).some((part) => part.startsWith(".requested-"))),
          name,
          "custom staging prefix did not reach the producer",
        );
      }
      yield* observed;
      yield* check(
        artifact.kind === subject.kind && p.isAbsolute(artifact.path) && artifact.path === destination,
        name,
        "record kind or absolute output path differs",
      );
      yield* Artifact.verify(artifact);
      if (fixture.provider !== undefined) {
        const expected = Tool.producedBy(fixture.provider.tool);
        yield* check(
          (["name", "version", "path", "sha256"] as const).every((field) =>
            artifact.producedBy[field] === expected[field]
          ),
          name,
          "producedBy differs from the resolved tool",
        );
      }
      if (artifact.kind === "executable") {
        const facts = yield* Executable.inspect(artifact.path);
        yield* check(
          facts.format === artifact.format && Executable.matches(facts, artifact.target),
          name,
          "executable record disagrees with its header",
        );
      }
      if (artifact.kind === "directory") {
        // Windows stat reports native permission approximations; chmod cannot establish POSIX 0755.
        // Artifact.verify above still checks the recorded rootMode against disk on every host.
        if (typeof process === "undefined" || process.platform !== "win32") {
          yield* check(
            artifact.rootMode === (subject.rootMode ?? 0o755),
            name,
            `root mode was ${artifact.rootMode.toString(8)}`,
          );
        }
        const paths = artifact.entries.map((entry) => entry.path);
        yield* check(
          JSON.stringify(paths) === JSON.stringify([...paths].sort()),
          name,
          "directory entries are not sorted",
        );
        const again = yield* output(p.join(directory, `again-${subject.outputName ?? "output"}`), options);
        yield* check(
          again.sha256 === artifact.sha256,
          name,
          "directory manifest differs between identical productions",
        );
      }
      yield* noStaging;
    })).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          new ConformanceFailure({ operation: subject.operation, guarantee: name, detail: Cause.pretty(cause) }),
        )
      ),
    ),
  }));
};
