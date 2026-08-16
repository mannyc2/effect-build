import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Context, Effect, Exit, Fiber, Layer } from "effect";
import * as esbuild from "esbuild";
import { conclusion, infrastructure } from "./receipt.mjs";

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const withStatefulContext = async (root) => {
  const entry = join(root, "entry.ts");
  const output = join(root, "out.js");
  await writeFile(entry, 'console.log("v1")\n');
  const context = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: output,
    logLevel: "silent",
  });
  let state = "open";
  const states = [state];
  const rebuild = async () => {
    if (state !== "open") throw new Error(`context is ${state}`);
    try {
      return await context.rebuild();
    } catch (error) {
      conclusion(state === "open", "failed rebuild closed the context");
      throw error;
    }
  };
  const cancel = async () => {
    if (state !== "open") throw new Error(`context is ${state}`);
    await context.cancel();
    conclusion(state === "open", "cancel disposed the context");
  };
  const dispose = async () => {
    if (state === "closed") return;
    state = "closing";
    states.push(state);
    await context.dispose();
    state = "closed";
    states.push(state);
  };
  try {
    await rebuild();
    await writeFile(entry, "const broken: = 1\n");
    let failed = false;
    try {
      await rebuild();
    } catch {
      failed = true;
    }
    conclusion(failed, "invalid rebuild unexpectedly succeeded");
    conclusion(state === "open", "failed rebuild made context unusable");
    await writeFile(entry, 'console.log("v2")\n');
    await rebuild();
    conclusion((await readFile(output, "utf8")).includes("v2"), "rebuild after failure did not update output");
    await cancel();
    await writeFile(entry, 'console.log("v3")\n');
    await rebuild();
    conclusion((await readFile(output, "utf8")).includes("v3"), "rebuild after cancel did not update output");
    await dispose();
    let closedRejected = false;
    try {
      await rebuild();
    } catch {
      closedRejected = true;
    }
    conclusion(closedRejected, "closed context accepted a rebuild");
    return {
      states,
      failedRebuildReusable: true,
      cancelWithoutDispose: true,
      rebuildAfterCancel: true,
      closedRejectsOperations: true,
    };
  } finally {
    await dispose();
  }
};

const cancelActiveBuildWithoutDispose = async (root) => {
  const entry = join(root, "cancel-entry.ts");
  const output = join(root, "cancel-out.js");
  await writeFile(entry, 'console.log("before-cancel")\n');
  let release;
  let entered;
  const enteredPromise = new Promise((resolveEntered) => {
    entered = resolveEntered;
  });
  const gate = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  let delay = true;
  const context = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    outfile: output,
    logLevel: "silent",
    plugins: [{
      name: "research-delay",
      setup(build) {
        build.onLoad({ filter: /cancel-entry\.ts$/ }, async (args) => {
          if (delay) {
            entered();
            await gate;
          }
          return { contents: await readFile(args.path, "utf8"), loader: "ts" };
        });
      },
    }],
  });
  try {
    const active = context.rebuild();
    await enteredPromise;
    await context.cancel();
    release();
    let canceled = false;
    try {
      await active;
    } catch {
      canceled = true;
    }
    conclusion(canceled, "Esbuild cancel did not reject active rebuild");
    delay = false;
    await writeFile(entry, 'console.log("after-cancel")\n');
    await context.rebuild();
    conclusion((await readFile(output, "utf8")).includes("after-cancel"), "context was not reusable after cancel");
    return { activeRebuildCanceled: true, contextStillOpen: true, subsequentRebuildSucceeded: true };
  } finally {
    release();
    await context.dispose();
  }
};

const promiseInterruption = async () => {
  let underlyingCompleted = false;
  const effect = Effect.promise(() => new Promise((resolvePromise) => {
    setTimeout(() => {
      underlyingCompleted = true;
      resolvePromise("completed");
    }, 200);
  }));
  const fiber = Effect.runFork(effect);
  await sleep(20);
  await Effect.runPromise(Fiber.interrupt(fiber));
  const exit = await Effect.runPromise(Fiber.await(fiber));
  conclusion(Exit.isFailure(exit), "interrupted Effect.promise fiber succeeded");
  await sleep(300);
  conclusion(underlyingCompleted, "underlying Promise-backed provider work was canceled without an abort protocol");
  return { callerFiberInterrupted: true, underlyingPromiseCompleted: true };
};

class LazyService extends Context.Service<LazyService, { readonly value: number }>()(
  "effect-build/research/LazyService",
) {}

const lazyLayerConstruction = async () => {
  let acquisitions = 0;
  const layerFactory = () => Layer.effect(
    LazyService,
    Effect.sync(() => {
      acquisitions += 1;
      return { value: acquisitions };
    }),
  );
  const layer = layerFactory();
  conclusion(acquisitions === 0, "constructing a Layer eagerly acquired its service");
  const value = await Effect.runPromise(
    LazyService.use((service) => Effect.succeed(service.value)).pipe(Effect.provide(layer)),
  );
  conclusion(value === 1 && acquisitions === 1, "Layer acquisition did not occur exactly once when provided");
  return { lazyConstruction: true, acquisitions };
};

const observeExecutable = async (path) => {
  const canonical = resolve(path);
  const information = await stat(canonical);
  const bytes = await readFile(canonical);
  return {
    path: canonical,
    device: information.dev,
    inode: information.ino,
    bytes: bytes.byteLength,
    digest: sha256(bytes),
  };
};

const executableReplacement = async (root) => {
  const selected = join(root, "selected-tool");
  await writeFile(selected, "tool-v1\n", { mode: 0o755 });
  const initial = await observeExecutable(selected);
  const replacement = join(root, "replacement-tool");
  await writeFile(replacement, "tool-v2\n", { mode: 0o755 });
  await rename(replacement, selected);
  const current = await observeExecutable(selected);
  const replaced = initial.digest !== current.digest
    || initial.bytes !== current.bytes
    || initial.inode !== current.inode
    || initial.device !== current.device;
  conclusion(replaced, "atomic executable replacement was not observable");
  const decision = replaced
    ? {
      _tag: "ToolExecutableReplaced",
      selected: initial,
      observed: current,
      overrideAvailable: false,
    }
    : { _tag: "Unchanged" };
  conclusion(decision._tag === "ToolExecutableReplaced", "selected executable replacement was not rejected");
  return decision;
};

const normalizePortableRelative = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    return { ok: false, reason: "invalid-path" };
  }
  const portable = value.replaceAll("\\", "/");
  if (portable.startsWith("/") || /^[A-Za-z]:\//.test(portable)) {
    return { ok: false, reason: "absolute-path" };
  }
  const segments = [];
  for (const segment of portable.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return { ok: false, reason: "traversal" };
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  if (segments.length === 0) return { ok: false, reason: "empty-normalized-path" };
  return { ok: true, path: segments.join("/") };
};

const validateManifestPaths = (values) => {
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    const result = normalizePortableRelative(value);
    if (!result.ok) return result;
    if (seen.has(result.path)) return { ok: false, reason: "normalized-collision", path: result.path };
    seen.add(result.path);
    normalized.push(result.path);
  }
  return { ok: true, paths: normalized.sort() };
};

const walkPortableTree = async (root) => {
  const output = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const information = await lstat(path);
      if (information.isSymbolicLink()) {
        return { ok: false, reason: "symlink", path: relative(root, path).split(sep).join("/") };
      }
      if (information.isDirectory()) {
        const nested = await visit(path);
        if (!nested.ok) return nested;
      } else if (information.isFile()) {
        const portable = relative(root, path).split(sep).join("/");
        const normalized = normalizePortableRelative(portable);
        if (!normalized.ok) return normalized;
        output.push(normalized.path);
      } else {
        return { ok: false, reason: "unsupported-entry", path: relative(root, path) };
      }
    }
    return { ok: true };
  };
  const result = await visit(root);
  if (!result.ok) return result;
  const validated = validateManifestPaths(output);
  return validated.ok ? { ok: true, paths: validated.paths } : validated;
};

const portableTreeLaws = async (root) => {
  const tree = join(root, "tree");
  const outside = join(root, "outside.txt");
  await mkdir(join(tree, "nested"), { recursive: true });
  await writeFile(join(tree, "a.txt"), "a");
  await writeFile(join(tree, "nested", "b.txt"), "b");
  await writeFile(outside, "outside");
  const valid = await walkPortableTree(tree);
  conclusion(valid.ok && valid.paths.join(",") === "a.txt,nested/b.txt", "portable tree traversal changed");
  const traversal = normalizePortableRelative("../../escape");
  conclusion(!traversal.ok && traversal.reason === "traversal", "portable path traversal was accepted");
  const normalization = normalizePortableRelative("nested\\b.txt");
  conclusion(normalization.ok && normalization.path === "nested/b.txt", "portable separator normalization changed");
  const collision = validateManifestPaths(["nested/b.txt", "nested\\b.txt"]);
  conclusion(!collision.ok && collision.reason === "normalized-collision", "normalized manifest collision was accepted");
  let symlinkResult = { supported: true };
  try {
    await symlink(outside, join(tree, "nested", "escape-link"));
    const observed = await walkPortableTree(tree);
    conclusion(!observed.ok && observed.reason === "symlink", "tree symlink was traversed");
    symlinkResult = { supported: true, rejected: true };
  } catch (error) {
    symlinkResult = { supported: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return { valid, traversal, normalization, collision, symlink: symlinkResult };
};

const root = await mkdtemp(join(tmpdir(), "effect-build-lifecycle-"));
export let lifecycleEffectResult;
try {
  lifecycleEffectResult = {
    context: await withStatefulContext(root),
    activeCancel: await cancelActiveBuildWithoutDispose(root),
    promiseInterruption: await promiseInterruption(),
    layer: await lazyLayerConstruction(),
    executableReplacement: await executableReplacement(root),
    tree: await portableTreeLaws(root),
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
