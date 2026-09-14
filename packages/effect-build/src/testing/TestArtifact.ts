import { Effect, FileSystem, Path } from "effect";
import * as Artifact from "../Artifact.js";
import * as Layout from "../Layout.js";
import * as Target from "../Target.js";

const producedBy = { name: "effect-build/testing", version: "1.0.0" };

/** Structurally complete native images for inspection/packaging; they do not contain runnable programs. */
export const elf = (interpreter?: string, machine = 62): Uint8Array => {
  const encoded = interpreter === undefined ? undefined : new TextEncoder().encode(`${interpreter}\0`);
  const count = encoded === undefined ? 1 : 2, payload = 64 + count * 56;
  const bytes = new Uint8Array(payload + (encoded?.byteLength ?? 1));
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  const view = new DataView(bytes.buffer);
  view.setUint16(16, 2, true);
  view.setUint16(18, machine, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(52, 64, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, count, true);
  view.setUint32(64, 1, true);
  view.setBigUint64(96, BigInt(bytes.length), true);
  view.setBigUint64(104, BigInt(bytes.length), true);
  if (encoded !== undefined) {
    view.setUint32(120, 3, true);
    view.setBigUint64(128, BigInt(payload), true);
    view.setBigUint64(152, BigInt(encoded.length), true);
    bytes.set(encoded, payload);
  }
  return bytes;
};

export const thinMacho = (cpu = 0x0100000c): Uint8Array => {
  const bytes = new Uint8Array(105);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, cpu, true);
  view.setUint32(12, 2, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 72, true);
  view.setUint32(32, 0x19, true);
  view.setUint32(36, 72, true);
  view.setBigUint64(64, BigInt(bytes.length), true);
  view.setBigUint64(80, BigInt(bytes.length), true);
  return bytes;
};

export const fatMacho = (cpus: readonly number[]): Uint8Array => {
  const start = 8 + cpus.length * 20, sliceSize = thinMacho().length;
  const bytes = new Uint8Array(start + cpus.length * sliceSize);
  bytes.set([0xca, 0xfe, 0xba, 0xbe]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, cpus.length, false);
  cpus.forEach((cpu, i) => {
    const entry = 8 + i * 20, offset = start + i * sliceSize;
    view.setUint32(entry, cpu, false);
    view.setUint32(entry + 8, offset, false);
    view.setUint32(entry + 12, sliceSize, false);
    bytes.set(thinMacho(cpu), offset);
  });
  return bytes;
};

export const pe = (machine = 0x8664): Uint8Array => {
  const bytes = new Uint8Array(512 + 512), optional = 88, section = optional + 112;
  bytes.set([0x4d, 0x5a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(60, 64, true);
  bytes.set([0x50, 0x45], 64);
  view.setUint16(68, machine, true);
  view.setUint16(70, 1, true);
  view.setUint16(84, 112, true);
  view.setUint16(86, 2, true);
  view.setUint16(optional, 0x20b, true);
  view.setUint32(optional + 56, 8192, true);
  view.setUint32(optional + 60, 512, true);
  view.setUint32(section + 16, 512, true);
  view.setUint32(section + 20, 512, true);
  return bytes;
};

/** Header bytes for every supported target, including the Linux interpreter ABI. */
export const bytes = (target: Target.Target, options: { readonly fat?: boolean | undefined } = {}): Uint8Array => {
  const parts = Target.parts(target);
  if (parts.os === "windows") return pe(parts.arch === "x64" ? 0x8664 : 0xaa64);
  if (parts.os === "darwin") {
    const cpu = parts.arch === "x64" ? 0x01000007 : 0x0100000c;
    return options.fat === true ? fatMacho([cpu]) : thinMacho(cpu);
  }
  const interpreter = parts.abi === "musl"
    ? `/lib/ld-musl-${parts.arch === "x64" ? "x86_64" : "aarch64"}.so.1`
    : parts.arch === "x64"
    ? "/lib64/ld-linux-x86-64.so.2"
    : "/lib/ld-linux-aarch64.so.1";
  return elf(interpreter, parts.arch === "x64" ? 62 : 183);
};

const temporary = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-test-artifact-" }).pipe(
    Effect.mapError(Artifact.ioError("temporary fixture", "write")),
  );
});

const relative = (name: string): Effect.Effect<void, Artifact.ArtifactError> => {
  const issue = Layout.pathIssue(name);
  return issue === undefined
    ? Effect.void
    : Effect.fail(new Artifact.ArtifactError({ path: name, reason: "invalid-metadata", detail: issue }));
};

/** A real, scoped file with its hash observed from disk. */
export const file = (contents: string | Uint8Array, name = "fixture") =>
  Effect.gen(function*() {
    yield* relative(name);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const destination = path.join(yield* temporary, name);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true }).pipe(
      Effect.mapError(Artifact.ioError(destination, "write")),
    );
    yield* fs.writeFile(destination, typeof contents === "string" ? new TextEncoder().encode(contents) : contents).pipe(
      Effect.mapError(Artifact.ioError(destination, "write")),
    );
    return yield* Artifact.file(destination, producedBy);
  });

/** A real tree. File and parent-directory modes are fixed, and links are recorded without following them. */
export const tree = (entries: Readonly<Record<string, string | Uint8Array | { readonly link: string }>>) =>
  Effect.gen(function*() {
    const issue = Layout.validate(
      Object.entries(entries).map(([path, value]) => ({
        path,
        kind: typeof value === "object" && !(value instanceof Uint8Array) ? "symlink" : "file",
      })),
    );
    if (issue !== undefined) {
      return yield* new Artifact.ArtifactError({ path: issue.path, reason: "invalid-metadata", detail: issue.reason });
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* temporary;
    yield* fs.chmod(root, 0o755).pipe(Effect.mapError(Artifact.ioError(root, "write")));
    for (const [name, value] of Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      yield* relative(name);
      const destination = path.join(root, name);
      yield* Effect.gen(function*() {
        let parent = root;
        for (const component of name.split("/").slice(0, -1)) {
          parent = path.join(parent, component);
          yield* fs.makeDirectory(parent, { recursive: true });
          yield* fs.chmod(parent, 0o755);
        }
        if (typeof value === "object" && !(value instanceof Uint8Array)) yield* fs.symlink(value.link, destination);
        else {
          yield* fs.writeFile(destination, typeof value === "string" ? new TextEncoder().encode(value) : value);
          yield* fs.chmod(destination, 0o644);
        }
      }).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
    }
    return yield* Artifact.directory(root, producedBy);
  });

/** Minimal images parse as native executables but do not run. */
export const executable = (target: Target.Target, options: { readonly fat?: boolean | undefined } = {}) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const fixture = yield* file(bytes(target, options), `fixture${Target.parts(target).executableSuffix}`);
    yield* fs.chmod(fixture.path, 0o755).pipe(Effect.mapError(Artifact.ioError(fixture.path, "write")));
    return yield* Artifact.executable(fixture.path, producedBy, target);
  });

/** A scoped copy of the host executable. Running the copy requires a relocatable runtime;
 * installations using executable-relative dynamic libraries need their own runtime fixture. */
export const host = () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* temporary;
    const destination = path.join(
      root,
      `host${typeof process !== "undefined" && process.platform === "win32" ? ".exe" : ""}`,
    );
    if (typeof process === "undefined") {
      return yield* new Artifact.ArtifactError({
        path: destination,
        reason: "not-found",
        detail: "host runtime does not expose process.execPath",
      });
    }
    yield* fs.copyFile(process.execPath, destination).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
    yield* fs.chmod(destination, 0o755).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
    return yield* Artifact.executable(destination, producedBy);
  });
