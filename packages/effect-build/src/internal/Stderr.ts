import { Effect, Redacted, Stream } from "effect";

const encoder = new TextEncoder();
const replacement = encoder.encode("<redacted>");

/** Streaming exact-value redaction precedes the byte tail, including across chunk and tail boundaries. */
export const stderrTail = Effect.fnUntraced(function*<E>(
  stream: Stream.Stream<Uint8Array, E>,
  maxBytes: number,
  redact: ReadonlyArray<Redacted.Redacted<string>>,
) {
  const secrets = redact.map((value) => encoder.encode(Redacted.value(value)))
    .filter((value) => value.length > 0).sort((left, right) => right.length - left.length);
  const longest = secrets[0]?.length ?? 1;
  const buffer = new Uint8Array(maxBytes);
  let pending = new Uint8Array(0);
  let size = 0;
  let cursor = 0;
  const keep = (byte: number) => {
    if (maxBytes === 0) return;
    buffer[cursor] = byte;
    cursor = (cursor + 1) % maxBytes;
    size = Math.min(size + 1, maxBytes);
  };
  const append = (chunk: Uint8Array, eof: boolean) => {
    const bytes = new Uint8Array(pending.length + chunk.length);
    bytes.set(pending);
    bytes.set(chunk, pending.length);
    let offset = 0;
    while (offset < bytes.length && (eof || bytes.length - offset >= longest)) {
      const secret = secrets.find((value) =>
        value.length <= bytes.length - offset && value.every((byte, index) => byte === bytes[offset + index])
      );
      if (secret === undefined) {
        for (const byte of bytes.subarray(offset, offset + 1)) keep(byte);
        offset += 1;
      } else {
        for (const byte of replacement) keep(byte);
        offset += secret.length;
      }
    }
    pending = bytes.slice(offset);
  };
  yield* Stream.runForEach(stream, (chunk) => Effect.sync(() => append(chunk, false)));
  append(new Uint8Array(0), true);
  const tail = new Uint8Array(size);
  const start = size === maxBytes ? cursor : 0;
  for (let index = 0; index < size; index += 1) {
    tail.set(buffer.subarray((start + index) % maxBytes, (start + index) % maxBytes + 1), index);
  }
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(tail);
});
