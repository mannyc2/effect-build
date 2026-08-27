import { Effect, type Scope } from "effect";
import * as rolldown from "rolldown";
import { RolldownFailed } from "./error.js";

export interface Owner {
  /** Native in-memory generation. The returned chunks and assets are caller-owned. */
  readonly generate: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, RolldownFailed>;
  /** Native provider-direct publication. Partial writes and remnants remain Rolldown semantics. */
  readonly write: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, RolldownFailed>;
}

type Operation = "generate" | "write";

const failed = (operation: Operation, cause: unknown): RolldownFailed =>
  cause instanceof RolldownFailed ? cause : new RolldownFailed({ operation, cause });

/**
 * Rolldown's native close does not join an already-running generate/write. The
 * owner therefore closes admission first, drains every admitted call, and only
 * then invokes native close. No operation can start after release begins.
 */
const wrap = (native: rolldown.RolldownBuild): { readonly owner: Owner; readonly release: Effect.Effect<void> } => {
  let accepting = true;
  const inFlight = new Set<Promise<unknown>>();

  const run = <A>(operation: Operation, body: () => Promise<A>): Effect.Effect<A, RolldownFailed> =>
    Effect.tryPromise({
      try: () => {
        if (!accepting) {
          throw new Error("the scoped Rolldown build has already begun release");
        }
        const promise = body();
        inFlight.add(promise);
        void promise.then(
          () => inFlight.delete(promise),
          () => inFlight.delete(promise),
        );
        return promise;
      },
      catch: (cause) => failed(operation, cause),
    });

  const owner: Owner = {
    generate: (output) => run("generate", () => native.generate(output)),
    write: (output) => run("write", () => native.write(output)),
  };

  const release = Effect.uninterruptible(
    Effect.suspend(() => {
      accepting = false;
      const admitted = [...inFlight];
      return Effect.promise(async () => {
        await Promise.allSettled(admitted);
        await native.close();
      });
    }),
  );

  return { owner, release };
};

export interface Acquired {
  readonly owner: Owner;
  readonly release: Effect.Effect<void>;
}

/** Package-private acquisition for composite scoped owners. */
export const open = (input: rolldown.InputOptions): Effect.Effect<Acquired, RolldownFailed> =>
  Effect.map(
    Effect.tryPromise({
      try: () => rolldown.rolldown(input),
      catch: (cause) => new RolldownFailed({ operation: "make", cause }),
    }),
    wrap,
  );

export const make = (input: rolldown.InputOptions): Effect.Effect<Owner, RolldownFailed, Scope.Scope> =>
  Effect.flatMap(
    open(input),
    ({ owner, release }) => {
      return Effect.as(Effect.addFinalizer(() => release), owner);
    },
  );
