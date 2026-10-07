import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess } from "effect/process";

// Fails while .oxlintrc.legacy.json lists a path that no longer breaks its rule, so the list only
// shrinks: it lints with the policy alone and compares the findings with every listed exception.

const policyPath = ".oxlintrc.json";
const legacyPath = ".oxlintrc.legacy.json";
const temporaryPath = ".tmp-oxlintrc.json";
const legacyEntry =
  ',\n    // Last, so its per-file exceptions win: the old code\'s remaining findings, to be burned down.\n    "./.oxlintrc.legacy.json"';
const lintedPaths = ["packages", "test", "examples", "vitest.config.ts", "scripts/check-lint-legacy.ts"];

const Legacy = Schema.Struct({
  overrides: Schema.Array(
    Schema.Struct({
      files: Schema.Array(Schema.String),
      rules: Schema.Record(Schema.String, Schema.Literal("off")),
    }),
  ),
});
const Report = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
});

// Oxlint reports `plugin(rule)`; the configuration names `plugin/rule`, and core rules bare.
const ruleOfCode = (code: string): string => {
  const match = /^([\w-]+)\(([\w-]+)\)$/u.exec(code);
  if (match === null) return code;
  const [, plugin, rule] = match;
  return plugin === "eslint" ? `${rule}` : `${plugin}/${rule}`;
};
const ruleOfName = (name: string): string => name.replace(/^eslint\//u, "");
const withoutLineComments = (text: string): string =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

// oxlint's launcher runs on whatever `node` is first on PATH. Under Bun it exits before a piped stdout
// drains, which cuts the report off at 64 KiB, so this check needs Node there.
const requireNode = Effect.fn("checkLintLegacy.requireNode")(function*() {
  const handle = yield* ChildProcess.make("node", ["-p", "typeof Bun"]);
  const runtime = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
  if (runtime.trim() !== "undefined") {
    return yield* Effect.die(
      "`node` on PATH is Bun, under which oxlint cuts its piped report off at 64 KiB. Put Node first on PATH.",
    );
  }
});

const lintWithPolicyOnly = Effect.fn("checkLintLegacy.lintWithPolicyOnly")(function*() {
  const fs = yield* FileSystem.FileSystem;
  const policy = yield* fs.readFileString(policyPath);
  if (!policy.includes(legacyEntry)) {
    return yield* Effect.die(`${policyPath} no longer extends ${legacyPath} as this check expects`);
  }
  yield* Effect.acquireRelease(
    fs.writeFileString(temporaryPath, policy.replace(legacyEntry, "")),
    () => fs.remove(temporaryPath).pipe(Effect.orDie),
  );
  const handle = yield* ChildProcess.make("node_modules/.bin/oxlint", [
    "-c",
    temporaryPath,
    "--format",
    "json",
    ...lintedPaths,
  ]);
  const output = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
  return yield* Schema.decodeEffect(Schema.fromJsonString(Report))(output);
});

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const legacy = yield* fs
    .readFileString(legacyPath)
    .pipe(
      Effect.flatMap((text) => Schema.decodeEffect(Schema.fromJsonString(Legacy))(withoutLineComments(text))),
    );
  yield* Effect.scoped(requireNode());
  const report = yield* Effect.scoped(lintWithPolicyOnly());
  const found = new Set(
    report.diagnostics.map(({ code, filename }) => `${ruleOfCode(code)} ${filename}`),
  );
  const stale = legacy.overrides.flatMap(({ files, rules }) =>
    Object.keys(rules).flatMap((name) =>
      files
        .filter((file) => !found.has(`${ruleOfName(name)} ${file}`))
        .map((file) => `${name} ${file}`)
    )
  );
  if (stale.length > 0) {
    yield* Console.error(
      `${legacyPath} lists ${stale.length} exceptions that are no longer needed; remove them:`,
    );
    for (const entry of stale) yield* Console.error(`  ${entry}`);
    return yield* Effect.die("stale lint exceptions");
  }
  const entries = legacy.overrides.reduce((sum, { files }) => sum + files.length, 0);
  yield* Console.log(`${legacyPath}: all ${entries} exceptions are still needed`);
});

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the script's entry point.
NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
