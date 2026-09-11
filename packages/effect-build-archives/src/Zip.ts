/**
 * Streaming ZIP32 encoder shared by archives and Python wheels: fixed DEFLATE level, zero
 * timestamps, entries ordered by their UTF-8 bytes, and each entry's CRC and sizes in a data
 * descriptor after its payload, so nothing is buffered to fill in a header.
 */
import type { Stream } from "effect";
import type { EntrySizeMismatch } from "./EntrySizeMismatch.js";
import type { FormatLimit } from "./FormatLimit.js";
import { encodeZip, type Entry, zipLimit } from "./internal/archive.js";

export type { DirectoryEntry, Entry, FileEntry, SymlinkEntry } from "./internal/archive.js";
export type EncodeError = FormatLimit | EntrySizeMismatch;

/** Fixed-width limits knowable before any payload is read. `encode` fails with the same limit first. */
export const limit: <E, R>(entries: ReadonlyArray<Entry<E, R>>) => FormatLimit | undefined = zipLimit;

/**
 * The archive's bytes. Payloads are read when the stream reaches their entry and compressed in
 * 64 KiB pieces, so the output depends only on the entries' bytes, not on how their streams chunk
 * them. Every run compresses afresh, so the stream may be run more than once.
 */
export const encode: <E, R>(entries: ReadonlyArray<Entry<E, R>>) => Stream.Stream<Uint8Array, E | EncodeError, R> =
  encodeZip;
