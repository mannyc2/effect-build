export class MatrixInterrupted extends Error {
  constructor() {
    super("compileExecutableMatrix was interrupted");
    this.name = "MatrixInterrupted";
  }
}

const cellId = (provider, index) => `${provider}:compileExecutable:${index}`;

export const runCompileExecutableMatrix = async ({
  provider,
  inputs,
  concurrency,
  compile,
  signal,
}) => {
  if (provider !== "bun" && provider !== "deno") throw new TypeError("provider must be bun or deno");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive safe integer");
  }
  if (!Array.isArray(inputs)) throw new TypeError("inputs must be an array");
  if (signal?.aborted === true) throw new MatrixInterrupted();

  const results = new Array(inputs.length);
  let nextIndex = 0;
  let firstCause;

  const take = () => {
    if (firstCause !== undefined || signal?.aborted === true || nextIndex >= inputs.length) return undefined;
    const index = nextIndex;
    nextIndex += 1;
    return index;
  };

  const worker = async () => {
    while (true) {
      const index = take();
      if (index === undefined) return;
      try {
        const exit = await compile(inputs[index], { index, signal });
        if (exit?._tag !== "Success" && exit?._tag !== "Failure") {
          throw new TypeError("scalar compile must return a Success or Failure exit");
        }
        results[index] = exit._tag === "Success"
          ? { _tag: "Success", cellId: cellId(provider, index), index, artifact: exit.artifact }
          : { _tag: "Failure", cellId: cellId(provider, index), index, error: exit.error };
      } catch (cause) {
        firstCause ??= cause;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()),
  );
  if (signal?.aborted === true || firstCause instanceof MatrixInterrupted) throw new MatrixInterrupted();
  if (firstCause !== undefined) throw firstCause;
  return {
    provider,
    operation: "compileExecutable",
    results,
    rollback: "none",
  };
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const until = async (predicate) => {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("matrix law fixture did not reach its expected state");
};

const normalLaw = async (provider) => {
  const gates = Array.from({ length: 4 }, () => deferred());
  const starts = [];
  const calls = new Map();
  const durable = [];
  let active = 0;
  let maximumActive = 0;
  const compile = async (input, { index }) => {
    starts.push(index);
    calls.set(index, (calls.get(index) ?? 0) + 1);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      const exit = await gates[index].promise;
      if (exit._tag === "Success") durable.push(exit.artifact.path);
      return exit;
    } finally {
      active -= 1;
    }
  };
  const running = runCompileExecutableMatrix({
    provider,
    inputs: ["zero", "one", "two", "three"],
    concurrency: 2,
    compile,
  });
  await until(() => starts.length === 2);
  gates[1].resolve({ _tag: "Failure", error: { _tag: "CompileFailed", input: "one" } });
  await until(() => starts.includes(2));
  gates[2].resolve({ _tag: "Success", artifact: { path: `${provider}-two` } });
  await until(() => starts.includes(3));
  gates[3].resolve({ _tag: "Failure", error: { _tag: "CompileFailed", input: "three" } });
  gates[0].resolve({ _tag: "Success", artifact: { path: `${provider}-zero` } });
  const report = await running;
  return { report, starts, calls, durable, maximumActive };
};

const interruptionLaw = async (provider) => {
  const controller = new AbortController();
  const starts = [];
  const durable = [];
  const compile = async (input, { index, signal }) => {
    starts.push(index);
    if (index === 0) {
      const artifact = { path: `${provider}-${input}` };
      durable.push(artifact.path);
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      return { _tag: "Success", artifact };
    }
    await new Promise((resolve, reject) => {
      const abort = () => reject(new MatrixInterrupted());
      signal.addEventListener("abort", abort, { once: true });
    });
  };
  const running = runCompileExecutableMatrix({
    provider,
    inputs: ["committed", "active", "queued-a", "queued-b"],
    concurrency: 2,
    compile,
    signal: controller.signal,
  });
  await until(() => starts.length === 2 && durable.length === 1);
  controller.abort();
  let cause;
  try {
    await running;
  } catch (error) {
    cause = error;
  }
  return { cause, starts, durable };
};

export const executeMatrixLawSuite = async () => {
  const providers = {};
  for (const provider of ["bun", "deno"]) {
    const normal = await normalLaw(provider);
    const interrupted = await interruptionLaw(provider);
    providers[provider] = {
      deterministicCellIds: normal.report.results.map((result) => result.cellId),
      orderedTags: normal.report.results.map((result) => result._tag),
      calls: Object.fromEntries(normal.calls),
      starts: normal.starts,
      durable: normal.durable,
      maximumActive: normal.maximumActive,
      rollback: normal.report.rollback,
      interruption: {
        cause: interrupted.cause?.name,
        starts: interrupted.starts,
        durable: interrupted.durable,
      },
    };
  }
  return providers;
};
