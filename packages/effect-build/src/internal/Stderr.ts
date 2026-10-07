import { Effect, Redacted, Stream } from "effect";

const encoder = new TextEncoder();
const replacement = encoder.encode("<redacted>");

const concat = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  if (left.length === 0) return right;
  const bytes = new Uint8Array(left.length + right.length);
  bytes.set(left);
  bytes.set(right, left.length);
  return bytes;
};

/** Streaming exact-value redaction precedes the byte tail, including across chunk and tail boundaries. */
export const stderrTail = Effect.fnUntraced(function*<E>(
  stream: Stream.Stream<Uint8Array, E>,
  maxBytes: number,
  redact: ReadonlyArray<Redacted.Redacted<string>>,
) {
  const secrets = redact.map((value) => encoder.encode(Redacted.value(value)))
    .filter((value) => value.length > 0).sort((left, right) => right.length - left.length);
  const firstBytes = new Set(secrets.map((secret) => secret[0]));
  const longest = secrets[0]?.length ?? 1;
  const ring = new Uint8Array(maxBytes);
  let size = 0;
  let cursor = 0;
  const keep = (bytes: Uint8Array) => {
    if (maxBytes === 0 || bytes.length === 0) return;
    const recent = bytes.length > maxBytes ? bytes.subarray(bytes.length - maxBytes) : bytes;
    const head = Math.min(recent.length, maxBytes - cursor);
    ring.set(recent.subarray(0, head), cursor);
    ring.set(recent.subarray(head), 0);
    cursor = (cursor + recent.length) % maxBytes;
    size = Math.min(size + recent.length, maxBytes);
  };
  const matchAt = (bytes: Uint8Array, offset: number) =>
    secrets.find((secret) =>
      secret.length <= bytes.length - offset && secret.every((byte, index) => byte === bytes[offset + index])
    );
  // Bytes that may begin a secret continuing into the next chunk wait in `pending`.
  let pending = new Uint8Array(0);
  const append = (chunk: Uint8Array, eof: boolean) => {
    if (secrets.length === 0) return keep(chunk);
    const bytes = concat(pending, chunk);
    const limit = eof ? bytes.length : bytes.length - longest + 1;
    let start = 0;
    let offset = 0;
    while (offset < limit) {
      const secret = firstBytes.has(bytes[offset]) ? matchAt(bytes, offset) : undefined;
      if (secret === undefined) {
        offset += 1;
      } else {
        keep(bytes.subarray(start, offset));
        keep(replacement);
        offset += secret.length;
        start = offset;
      }
    }
    keep(bytes.subarray(start, offset));
    pending = bytes.slice(offset);
  };
  yield* Stream.runForEach(stream, (chunk) => Effect.sync(() => append(chunk, false)));
  append(new Uint8Array(0), true);
  const tail = size === maxBytes ? concat(ring.slice(cursor), ring.subarray(0, cursor)) : ring.subarray(0, size);
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(tail);
});
