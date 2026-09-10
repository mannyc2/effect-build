import { Effect, FileSystem } from "effect";
import { Artifact } from "effect-build";
import { TarInvalid } from "../TarInvalid.js";

/** A tar entry located by its header; a file's `offset` is where its payload begins in the tar. */
export type TarEntry =
  | {
    readonly kind: "file";
    readonly path: string;
    readonly mode: number;
    readonly bytes: number;
    readonly offset: number;
  }
  | { readonly kind: "directory"; readonly path: string; readonly mode: number }
  | { readonly kind: "symlink"; readonly path: string; readonly mode: number; readonly target: string };

const decoder = new TextDecoder("utf-8", { fatal: true });

const beforeNul = (value: string): string => {
  const index = value.indexOf("\0");
  return index === -1 ? value : value.slice(0, index);
};

const field = (header: Uint8Array, offset: number, length: number): string =>
  beforeNul(decoder.decode(header.subarray(offset, offset + length)));

const parseOctal = (value: string): number => {
  const normalized = value.trim().replace(/^0+/, "");
  if (normalized === "") return 0;
  if (!/^[0-7]+$/.test(normalized)) throw new RangeError(`invalid tar octal field: ${value}`);
  return Number.parseInt(normalized, 8);
};

const parsePax = (contents: Uint8Array): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  let offset = 0;
  while (offset < contents.byteLength) {
    const space = contents.indexOf(0x20, offset);
    if (space === -1) throw new RangeError("invalid PAX record length");
    const encodedLength = decoder.decode(contents.subarray(offset, space));
    if (!/^[1-9][0-9]*$/.test(encodedLength)) throw new RangeError("invalid PAX record length");
    const length = Number.parseInt(encodedLength, 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > contents.byteLength) {
      throw new RangeError("invalid PAX record");
    }
    const end = offset + length;
    if (contents[end - 1] !== 0x0a) throw new RangeError("PAX record does not end in newline");
    const record = contents.subarray(space + 1, end - 1);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) throw new RangeError("PAX record lacks a key/value separator");
    result[decoder.decode(record.subarray(0, equals))] = decoder.decode(record.subarray(equals + 1));
    offset += length;
  }
  return result;
};

interface TarHeader {
  readonly rawPath: string;
  readonly size: number;
  readonly type: string;
  readonly mode: number;
  readonly linkField: string;
}

const parseHeader = (header: Uint8Array): TarHeader => {
  const expected = parseOctal(field(header, 148, 8));
  const checksumHeader = header.slice();
  checksumHeader.fill(0x20, 148, 156);
  const actual = checksumHeader.reduce((total, byte) => total + byte, 0);
  if (expected !== actual) throw new RangeError("invalid tar header checksum");
  const prefix = field(header, 345, 155);
  const headerPath = field(header, 0, 100);
  return {
    rawPath: prefix === "" ? headerPath : `${prefix}/${headerPath}`,
    size: parseOctal(field(header, 124, 12)),
    // An empty type field is the pre-ustar spelling of a regular file.
    type: field(header, 156, 1) || "0",
    mode: parseOctal(field(header, 100, 8)),
    linkField: field(header, 157, 100),
  };
};

/** Extended records apply to the next regular entry only; a global PAX header persists. */
interface Pending {
  readonly pax: Readonly<Record<string, string>>;
  readonly longPath?: string | undefined;
  readonly longLink?: string | undefined;
}
const nothingPending: Pending = { pax: {} };

/** PAX and long-name records are read into memory; `git archive` writes small ones. */
const metadataBytes = 16 * 1024 * 1024;

/** Walk the ustar/PAX headers written by `git archive --format=tar`, recording payload ranges instead of reading them. */
export const readGitTar = (
  path: string,
): Effect.Effect<readonly TarEntry[], TarInvalid | Artifact.ArtifactError, FileSystem.FileSystem> =>
  Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const unreadable = (error: unknown) =>
      new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });
    const invalid = (offset: number, detail: unknown) =>
      new TarInvalid({ path, offset, detail: detail instanceof Error ? detail.message : String(detail) });
    const handle = yield* fs.open(path).pipe(Effect.mapError(unreadable));
    const size = Number((yield* handle.stat.pipe(Effect.mapError(unreadable))).size);
    const read = (at: number, length: number) =>
      Effect.gen(function*() {
        if (length > metadataBytes) return yield* invalid(at, "metadata record exceeds 16 MiB");
        yield* handle.seek(at, "start");
        const buffer = new Uint8Array(length);
        let filled = 0;
        while (filled < length) {
          const count = Number(yield* handle.read(buffer.subarray(filled)).pipe(Effect.mapError(unreadable)));
          if (count === 0) return yield* invalid(at, "truncated tar");
          filled += count;
        }
        return buffer;
      });
    const parse = <A>(at: number, parser: () => A) => Effect.try({ try: parser, catch: (error) => invalid(at, error) });
    const entries: TarEntry[] = [];
    let offset = 0;
    let global: Readonly<Record<string, string>> = {};
    let pending = nothingPending;
    while (offset + 512 <= size) {
      const headerOffset = offset;
      const header = yield* read(headerOffset, 512);
      if (header.every((byte) => byte === 0)) break;
      const parsed = yield* parse(headerOffset, () => parseHeader(header));
      const dataStart = headerOffset + 512;
      if (dataStart + parsed.size > size) return yield* invalid(headerOffset, `truncated tar entry: ${parsed.rawPath}`);
      offset = dataStart + Math.ceil(parsed.size / 512) * 512;
      if (parsed.type === "g" || parsed.type === "x" || parsed.type === "L" || parsed.type === "K") {
        const data = yield* read(dataStart, parsed.size);
        if (parsed.type === "g") global = { ...global, ...yield* parse(dataStart, () => parsePax(data)) };
        else if (parsed.type === "x") pending = { ...pending, pax: yield* parse(dataStart, () => parsePax(data)) };
        else if (parsed.type === "L") pending = { ...pending, longPath: beforeNul(decoder.decode(data)) };
        else pending = { ...pending, longLink: beforeNul(decoder.decode(data)) };
        continue;
      }
      const entryPath = pending.pax.path ?? global.path ?? pending.longPath ?? parsed.rawPath;
      const target = pending.pax.linkpath ?? global.linkpath ?? pending.longLink ?? parsed.linkField;
      pending = nothingPending;
      if (parsed.type === "0") {
        entries.push({
          kind: "file",
          path: entryPath,
          mode: (parsed.mode & 0o111) === 0 ? 0o644 : 0o755,
          bytes: parsed.size,
          offset: dataStart,
        });
      } else if (parsed.type === "2") {
        entries.push({ kind: "symlink", path: entryPath, mode: 0o777, target });
      } else if (parsed.type === "5") {
        entries.push({ kind: "directory", path: entryPath.replace(/\/$/, ""), mode: 0o755 });
      } else {
        return yield* invalid(headerOffset, `unsupported tar entry type ${JSON.stringify(parsed.type)}: ${entryPath}`);
      }
    }
    return entries;
  }));
