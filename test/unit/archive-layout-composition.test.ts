import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as ArtifactAuthor from "effect-build/Artifact";
import * as FileAuthor from "effect-build/Author/File";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Archive from "../../packages/effect-build-archives/src/Archive.js";
import { decodeGitTar, type Entry } from "../../packages/effect-build-archives/src/internal/archive.js";
import { validateLayout } from "../../packages/effect-build-archives/src/internal/layout.js";

const collisions = [
  { label: "case-folded ancestor", ancestor: "Bin", descendant: "bin/tool" },
  { label: "NFC-equivalent ancestor", ancestor: "caf\u00e9", descendant: "cafe\u0301/tool" },
  { label: "nested case-folded ancestor", ancestor: "Docs/Bin", descendant: "docs/bin/tool" },
  { label: "nested NFC-equivalent ancestor", ancestor: "docs/caf\u00e9", descendant: "docs/cafe\u0301/tool" },
] as const;
const orders = ["ancestor first", "descendant first"] as const;
const formats = ["zip", "tar.gz"] as const;
const cases = formats.flatMap((format) =>
  collisions.flatMap((collision) => orders.map((order) => ({ ...collision, format, order })))
);
const ordered = <A>(ancestor: A, descendant: A, order: typeof orders[number]): readonly [A, A] =>
  order === "ancestor first" ? [ancestor, descendant] : [descendant, ancestor];

let root = "";
let payload: Artifact.HashedFile;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-archive-layout-"));
  payload = await Effect.runPromise(
    FileAuthor.publish(
      {
        destination: join(root, "payload"),
        observation: "hashed",
        provenance: ArtifactAuthor.intrinsicProvenance("effect-build-test-fixture"),
      },
      (candidate) => Effect.tryPromise(() => writeFile(candidate, "portable payload\n")),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const publish = (format: typeof formats[number], paths: readonly [string, string], outfile: string) =>
  Effect.runPromiseExit(
    Archive.archive(
      new Archive.ArchiveInput({
        format,
        entries: [
          new Archive.ArchiveEntry({ artifact: payload, path: paths[0] }),
          new Archive.ArchiveEntry({ artifact: payload, path: paths[1] }),
        ],
        outfile,
      }),
    ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
  );

const zipNames = (bytes: Buffer): readonly string[] => {
  const end = bytes.byteLength - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = bytes.readUInt16LE(offset + 28);
    names.push(bytes.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return names;
};

describe("archive layout composition", () => {
  it.each(cases)("rejects $label in $format with $order before publication", async ({
    ancestor,
    descendant,
    format,
    label,
    order,
  }) => {
    const outfile = join(root, `${label}-${order}.${format}`);
    const exit = await publish(format, ordered(ancestor, descendant, order), outfile);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.findErrorOption(exit.cause)).toMatchObject({
        _tag: "Some",
        value: {
          _tag: "UnsafeArchiveLayout",
          path: descendant,
          reason: `descends through non-directory entry ${JSON.stringify(ancestor)}`,
        },
      });
    }
    await expect(lstat(outfile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(formats.flatMap((format) => orders.map((order) => ({ format, order }))))(
    "preserves valid implicit-directory names in $format with $order",
    async ({ format, order }) => {
      const paths = ordered("Bin/tool", "cafe\u0301/readme", order);
      const outfile = join(root, `valid-${order}.${format}`);
      const exit = await publish(format, paths, outfile);
      expect(Exit.isSuccess(exit)).toBe(true);
      const bytes = await readFile(outfile);
      const names = format === "zip"
        ? zipNames(bytes)
        : decodeGitTar(new Uint8Array(gunzipSync(bytes))).map(({ path }) => path);
      expect(names).toEqual(["Bin/tool", "cafe\u0301/readme"]);
    },
  );

  it.each(collisions.flatMap((collision) => orders.map((order) => ({ ...collision, order }))))(
    "rejects a symlink at $label with $order",
    ({ ancestor, descendant, order }) => {
      const entries = ordered<Entry>(
        { path: ancestor, kind: "symlink", mode: 0o777, contents: new Uint8Array(), linkTarget: "target" },
        { path: descendant, kind: "file", mode: 0o644, contents: new Uint8Array([1]) },
        order,
      );
      expect(validateLayout(entries)).toMatchObject({
        _tag: "Invalid",
        error: { _tag: "UnsafeArchiveLayout", path: descendant },
      });
    },
  );

  it.each(collisions.flatMap((collision) => orders.map((order) => ({ ...collision, order }))))(
    "accepts an explicit directory at $label with $order and preserves both names",
    ({ ancestor, descendant, order }) => {
      const directory: Entry = { path: ancestor, kind: "directory", mode: 0o755, contents: new Uint8Array() };
      const file: Entry = { path: descendant, kind: "file", mode: 0o644, contents: new Uint8Array([1]) };
      const result = validateLayout(ordered({ ...directory, path: `${ancestor}/` }, file, order));
      expect(result).toEqual({ _tag: "Valid", entries: ordered(directory, file, order) });
    },
  );
});
