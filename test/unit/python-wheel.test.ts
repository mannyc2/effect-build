import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Target } from "effect-build";
import * as Python from "effect-build-python";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { thinMacho } from "../fixtures/native-executable.js";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const producer = { name: "fixture", version: "0.7.0" };
const info = "wheel_fixture-1.2.3.dist-info";
let root: string;
let payload: Artifact.File;
let input: Python.WheelInput;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-wheel-"));
  await writeFile(join(root, "payload"), "answer = 42\n");
  payload = await run(Artifact.file(join(root, "payload"), producer));
  input = {
    metadata: { name: "Wheel-Fixture", version: "1.2.3" },
    tags: { python: "py3", abi: "none", platform: "any" },
    entries: [{ artifact: payload, path: "wheel_fixture/__init__.py" }],
    outdir: join(root, "dist"),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Read the central directory independently: local-header-only readers miss broken offsets and attributes.
const readZip = async (path: string) => {
  const bytes = await readFile(path), end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  expect(bytes.readUInt16LE(end + 20)).toBe(0);
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16);
  expect(start + bytes.readUInt32LE(end + 12)).toBe(end);
  const files = new Map<string, { contents: Buffer; mode: number }>();
  let cursor = start;
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(cursor)).toBe(0x02014b50);
    expect(bytes.readUInt16LE(cursor + 4) >>> 8).toBe(3);
    // UTF-8 names, with each entry's CRC and sizes in a data descriptor after its payload.
    expect(bytes.readUInt16LE(cursor + 8)).toBe(0x0808);
    expect(bytes.readUInt16LE(cursor + 10)).toBe(8);
    expect(bytes.readUInt16LE(cursor + 12)).toBe(0);
    expect(bytes.readUInt16LE(cursor + 14)).toBe(0x21);
    const crc = bytes.readUInt32LE(cursor + 16), compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const local = bytes.readUInt32LE(cursor + 42), body = local + 30 + nameLength;
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    expect(bytes.readUInt16LE(local + 6)).toBe(0x0808);
    expect([bytes.readUInt32LE(local + 14), bytes.readUInt32LE(local + 18), bytes.readUInt32LE(local + 22)]).toEqual([
      0,
      0,
      0,
    ]);
    expect(bytes.toString("utf8", local + 30, body)).toBe(name);
    const descriptor = body + compressedSize;
    expect(bytes.readUInt32LE(descriptor)).toBe(0x08074b50);
    expect([
      bytes.readUInt32LE(descriptor + 4),
      bytes.readUInt32LE(descriptor + 8),
      bytes.readUInt32LE(descriptor + 12),
    ]).toEqual([crc, compressedSize, size]);
    const contents = inflateRawSync(bytes.subarray(body, body + compressedSize));
    expect(contents.length).toBe(size);
    expect(crc32(contents)).toBe(crc);
    files.set(name, { contents, mode: bytes.readUInt32LE(cursor + 38) >>> 16 });
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  expect(cursor).toBe(end);
  return files;
};

describe("wheels from real artifacts", () => {
  it("reports an unwritable wheel destination and preserves its directory", async () => {
    const outfile = join(input.outdir, "wheel_fixture-1.2.3-py3-none-any.whl");
    await mkdir(outfile, { recursive: true });
    await writeFile(join(outfile, "retained"), "existing tree");
    const failure = await run(Python.wheel({ ...input, atomic: false }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", path: outfile, reason: "unwritable" });
    expect(await readFile(join(outfile, "retained"), "utf8")).toBe("existing tree");
    expect(await readdir(input.outdir)).toEqual([basename(outfile)]);
  });

  it("rejects ZIP32 entry overflow including generated wheel metadata", async () => {
    // 65533 payload entries plus METADATA, WHEEL and RECORD exceed the ZIP32 entry count.
    const entries = Array.from({ length: 65_533 }, (_, index) => ({ artifact: payload, path: `file-${index}` }));
    expect(await run(Python.wheel({ ...input, entries }).pipe(Effect.flip))).toMatchObject({
      _tag: "ArchiveFormatLimit",
      format: "zip",
      limit: "entries",
      maximum: 65_535,
    });
    expect(await readdir(root)).toEqual(["payload"]);
  });
  it("compresses repeated input and retains valid RECORD hashes", async () => {
    await writeFile(payload.path, "x".repeat(1024 * 1024));
    const artifact = await run(Artifact.file(payload.path, producer));
    const result = await run(Python.wheel({ ...input, entries: [{ artifact, path: "data.txt" }] }));
    expect(result.bytes).toBeLessThan(10_000);
    expect((await readZip(result.path)).get("data.txt")?.contents.toString()).toBe("x".repeat(1024 * 1024));
  });

  it.each(["any", "linux_aarch64", "win_arm64", "macosx_11_0_x86_64", "macosx_11_0_universal2"])(
    "rejects Darwin arm64 native commands tagged %s",
    async (platform) => {
      await writeFile(payload.path, thinMacho());
      const artifact = await run(Artifact.executable(payload.path, producer));
      const result = await run(
        Python.wheel({
          ...input,
          tags: { ...input.tags, platform },
          entries: [{ artifact, path: "wheel_fixture-1.2.3.data/scripts/tool" }],
        }).pipe(Effect.flip),
      );
      expect(result).toBeInstanceOf(Python.InputInvalid);
      expect(await readdir(root)).toEqual(["payload"]);
    },
  );

  it("rejects an entry ZIP32 cannot hold before reading artifact payloads", async () => {
    const artifact = { ...payload, bytes: 0x1_0000_0000 };
    expect(await run(Python.wheel({ ...input, entries: [{ artifact, path: "data" }] }).pipe(Effect.flip)))
      .toMatchObject({ _tag: "ArchiveFormatLimit", format: "zip", limit: "entry-bytes", path: "data" });
    expect(await readdir(root)).toEqual(["payload"]);
  });

  it.each([true, false])("writes deterministic metadata, UTF-8 paths and RECORD with atomic=%s", async (atomic) => {
    const entries = [
      ...input.entries,
      { artifact: payload, path: 'wheel_fixture/data,"é".txt', executable: true },
    ];
    const options = {
      ...input,
      atomic,
      entries,
      metadata: {
        ...input.metadata,
        summary: "A wheel fixture",
        license: "MIT",
        requiresPython: ">=3.9",
        projectUrls: { Source: "https://example.test/source", Home: "https://example.test/" },
      },
      entryPoints: {
        console_scripts: { "wheel-fixture": "wheel_fixture:main" },
        "fixture.plugins": { demo: "wheel_fixture" },
      },
    };
    const first = await run(Python.wheel(options));
    await utimes(payload.path, new Date(0), new Date(0));
    const second = await run(Python.wheel({
      ...options,
      entries: [...entries].reverse(),
      outdir: "second",
      cwd: root,
      metadata: {
        ...options.metadata,
        projectUrls: { Home: "https://example.test/", Source: "https://example.test/source" },
      },
      entryPoints: {
        "fixture.plugins": { demo: "wheel_fixture" },
        console_scripts: { "wheel-fixture": "wheel_fixture:main" },
      },
    }));
    expect(second.path).toBe(join(root, "second", "wheel_fixture-1.2.3-py3-none-any.whl"));
    expect(await readFile(second.path)).toEqual(await readFile(first.path));
    expect(await run(Artifact.verify(first))).toEqual(first);
    expect(first.producedBy).toEqual({ name: "effect-build-python", version: "0.7.0" });
    const files = await readZip(first.path), names = [...files.keys()];
    expect(names).toEqual([...names].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    expect(files.get(`${info}/METADATA`)?.contents.toString()).toBe([
      "Metadata-Version: 2.1",
      "Name: Wheel-Fixture",
      "Version: 1.2.3",
      "Summary: A wheel fixture",
      "License: MIT",
      "Requires-Python: >=3.9",
      "Project-URL: Home, https://example.test/",
      "Project-URL: Source, https://example.test/source",
      "",
      "",
    ].join("\n"));
    expect(files.get(`${info}/WHEEL`)?.contents.toString()).toContain("Root-Is-Purelib: true\nTag: py3-none-any\n");
    expect(files.get(`${info}/entry_points.txt`)?.contents.toString()).toBe(
      "[console_scripts]\nwheel-fixture = wheel_fixture:main\n\n[fixture.plugins]\ndemo = wheel_fixture\n\n",
    );
    const records = files.get(`${info}/RECORD`)!.contents.toString().trimEnd().split("\n");
    expect(records).toHaveLength(files.size);
    for (const [name, entry] of files) {
      expect(entry.mode).toBe(0o100000 | (name === entries[1]!.path ? 0o755 : 0o644));
      if (name.endsWith("/RECORD")) continue;
      const hash = createHash("sha256").update(entry.contents).digest("base64url");
      const escaped = name.includes(",") ? `"${name.replaceAll('"', '""')}"` : name;
      expect(records).toContain(`${escaped},sha256=${hash},${entry.contents.length}`);
    }
    expect(records.at(-1)).toBe(`${info}/RECORD,,`);
    expect(files.get(entries[1]!.path)?.contents).toEqual(await readFile(payload.path));
  });

  it("preserves executable artifact modes unless explicitly overridden", async () => {
    const executable = await run(Artifact.executable(process.execPath, producer, Target.host()));
    const platform = process.platform === "win32"
      ? `win_${process.arch === "arm64" ? "arm64" : "amd64"}`
      : process.platform === "darwin"
      ? `macosx_11_0_${process.arch === "arm64" ? "arm64" : "x86_64"}`
      : `linux_${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
    const result = await run(Python.wheel({
      ...input,
      tags: { ...input.tags, platform },
      entries: [
        { artifact: executable, path: "wheel_fixture/bin/tool" },
        { artifact: executable, path: "wheel_fixture/bin/data", executable: false },
      ],
    }));
    const files = await readZip(result.path);
    expect(files.get("wheel_fixture/bin/tool")?.mode).toBe(0o100755);
    expect(files.get("wheel_fixture/bin/data")?.mode).toBe(0o100644);
    expect(files.get("wheel_fixture/bin/tool")?.contents.equals(await readFile(executable.path))).toBe(true);
  }, 30_000);

  it("derives platform tags whose wheels admit their own executables", async () => {
    expect(Python.platformTag({ target: "windows-x64" })).toBe("win_amd64");
    expect(Python.platformTag({ target: "windows-arm64" })).toBe("win_arm64");
    expect(Python.platformTag({ target: "darwin-x64", macos: [11, 0] })).toBe("macosx_11_0_x86_64");
    expect(Python.platformTag({ target: "linux-x64", glibc: [2, 17] })).toBe("manylinux_2_17_x86_64");
    expect(Python.platformTag({ target: "linux-arm64", glibc: [2, 28] })).toBe("manylinux_2_28_aarch64");
    expect(Python.platformTag({ target: "linux-x64-musl", musl: [1, 2] })).toBe("musllinux_1_2_x86_64");
    expect(Python.platformTag({ target: "linux-arm64-musl", musl: [1, 2] })).toBe("musllinux_1_2_aarch64");
    const tags = Python.executableTags({ target: "darwin-arm64", macos: [11, 0] });
    expect(tags).toEqual({ python: "py3", abi: "none", platform: "macosx_11_0_arm64" });
    await writeFile(payload.path, thinMacho());
    const artifact = await run(Artifact.executable(payload.path, producer));
    expect(artifact.target).toBe("darwin-arm64");
    const result = await run(
      Python.wheel({ ...input, tags, entries: [{ artifact, path: "wheel_fixture-1.2.3.data/scripts/tool" }] }),
    );
    expect(basename(result.path)).toBe("wheel_fixture-1.2.3-py3-none-macosx_11_0_arm64.whl");
    expect((await readZip(result.path)).get("wheel_fixture-1.2.3.data/scripts/tool")?.mode).toBe(0o100755);
  });

  it("expands compressed compatibility tags and accepts explicit purelib placement", async () => {
    const result = await run(Python.wheel({
      ...input,
      tags: { python: "PY3.py2.py3", abi: "none.abi3", platform: "manylinux_2_17_x86_64.linux_x86_64" },
      rootIsPurelib: true,
    }));
    expect(basename(result.path)).toBe("wheel_fixture-1.2.3-py2.py3-abi3.none-linux_x86_64.manylinux_2_17_x86_64.whl");
    const wheel = (await readZip(result.path)).get(`${info}/WHEEL`)!.contents.toString();
    expect(wheel).toContain("Root-Is-Purelib: true\n");
    expect(wheel.split("\n").filter((line) => line.startsWith("Tag: "))).toEqual([
      "Tag: py2-abi3-linux_x86_64",
      "Tag: py2-abi3-manylinux_2_17_x86_64",
      "Tag: py2-none-linux_x86_64",
      "Tag: py2-none-manylinux_2_17_x86_64",
      "Tag: py3-abi3-linux_x86_64",
      "Tag: py3-abi3-manylinux_2_17_x86_64",
      "Tag: py3-none-linux_x86_64",
      "Tag: py3-none-manylinux_2_17_x86_64",
    ]);
  });

  it.each([
    ["  V01.002.03  ", "1.2.3"],
    ["00!1.0", "1.0"],
    ["02!1.0", "2!1.0"],
    ["1.0alpha", "1.0a0"],
    ["1.0-ALPHA_02", "1.0a2"],
    ["1.0.beta-03", "1.0b3"],
    ["1.0c1", "1.0rc1"],
    ["1.0pre", "1.0rc0"],
    ["1.0-preview_2", "1.0rc2"],
    ["1.0-03", "1.0.post3"],
    ["1.0r", "1.0.post0"],
    ["1.0_REV_2", "1.0.post2"],
    ["1.0-dev", "1.0.dev0"],
    ["1.0DEV_02", "1.0.dev2"],
    ["1.0RC1.post2.dev3+BUILD-002_AbC", "1.0rc1.post2.dev3+build.2.abc"],
    [
      "123456789012345678901234567890!01.999999999999999999999999999999+001",
      "123456789012345678901234567890!1.999999999999999999999999999999+1",
    ],
  ])("normalizes PEP 440 version %s to %s in wheel bytes and filename", async (version, normalized) => {
    const result = await run(Python.wheel({ ...input, metadata: { ...input.metadata, version } }));
    expect(basename(result.path)).toBe(`wheel_fixture-${normalized}-py3-none-any.whl`);
    expect((await readZip(result.path)).get(`wheel_fixture-${normalized}.dist-info/METADATA`)?.contents.toString())
      .toContain(`Version: ${normalized}\n`);
  });

  it.each([
    "",
    "1..0",
    "1.0-",
    "1.0+",
    "1.0+a..b",
    "1.0.dev1.post1",
    "1.0a1b2",
    "one",
    "-1.0",
    "1!",
    "1.0\nInjected: yes",
  ])("rejects invalid PEP 440 version %j before writing", async (version) => {
    expect(await run(Python.wheel({ ...input, metadata: { ...input.metadata, version } }).pipe(Effect.flip)))
      .toBeInstanceOf(Python.InputInvalid);
    expect(await readdir(root)).toEqual(["payload"]);
  });

  it.each([
    ["../outside"],
    ["/absolute"],
    ["C:/drive"],
    ["back\\slash"],
    ["a//b"],
    ["a/./b"],
    ["a/../b"],
    ["trailing/"],
    ["nul\0byte"],
    ["line\nbreak"],
    ["line\rbreak"],
    ["same", "same"],
    ["Readme", "README"],
    ["Docs/a", "docs/b"],
    ["café/a", "cafe\u0301/b"],
    ["café", "cafe\u0301"],
    ["Bin", "bin/tool"],
    ["café", "cafe\u0301/tool"],
    ["wheel_fixture-1.2.3.dist-info/METADATA"],
    ["other.DIST-INFO/data"],
  ])("rejects unsafe wheel layout %j before writing", async (...paths) => {
    for (const ordered of [paths, [...paths].reverse()]) {
      const failure = await run(
        Python.wheel({ ...input, entries: ordered.map((path) => ({ path, artifact: payload })) }).pipe(Effect.flip),
      );
      expect(failure).toBeInstanceOf(Python.InputInvalid);
    }
    expect(await readdir(root)).toEqual(["payload"]);
  });

  it.each(
    [
      { metadata: { name: "bad name", version: "1" } },
      { metadata: { name: "ok", version: "1", summary: "one\nInjected: two" } },
      { metadata: { name: "ok", version: "1", projectUrls: { "bad,label": "https://example.test" } } },
      { metadata: { name: "ok", version: "1", projectUrls: { Home: "relative/path" } } },
      { metadata: { name: "ok", version: "1", projectUrls: { ["a".repeat(33)]: "https://example.test" } } },
      { tags: { python: "py3-none", abi: "none", platform: "any" } },
      { entryPoints: { "bad group": { command: "pkg:main" } } },
      { entryPoints: { console_scripts: { command: "pkg:main\nother = bad" } } },
      { entryPoints: { console_scripts: { "bad=name": "pkg:main" } } },
      { entries: [] },
      { outdir: "" },
      { outdir: "bad\0path" },
      { cwd: "bad\0path" },
    ] satisfies readonly Partial<Python.WheelInput>[],
  )("rejects malformed metadata and options %j", async (invalid) => {
    const failure = await run(Python.wheel({ ...input, ...invalid }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Python.InputInvalid);
    expect(String(failure)).toBe(`PythonInputInvalid: ${failure.message}`);
    expect(await readdir(root)).toEqual(["payload"]);
  });

  it.each(["bytes", "digest"])("refuses a changed artifact %s and preserves existing output", async (changed) => {
    const original = await run(Python.wheel(input));
    const before = await readFile(original.path);
    if (changed === "digest") await writeFile(payload.path, "answer = 43\n");
    const artifact = changed === "bytes" ? { ...payload, bytes: payload.bytes + 1 } : payload;
    const failure = await run(
      Python.wheel({ ...input, entries: [{ artifact, path: "wheel_fixture/__init__.py" }] }).pipe(Effect.flip),
    );
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
    expect(await readFile(original.path)).toEqual(before);
    expect(await readdir(input.outdir)).toEqual([basename(original.path)]);
  });
});
