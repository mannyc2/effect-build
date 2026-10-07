import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Stream } from "effect";
import { Ffmpeg } from "../../examples/ffmpeg-session/src/Ffmpeg.js";
import { Ffprobe } from "../../examples/ffmpeg-session/src/Ffprobe.js";

it.live(
  "finishes two finite native writers, drains progress, and probes real CSV and JSON output",
  () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "ffmpeg-binding-integration-" });
      const output = path.join(directory, "clip.ts");
      const ffmpeg = yield* Ffmpeg.make({ executable: process.env.EFFECT_BUILD_FFMPEG });
      const encoding = yield* ffmpeg.encode({ output: { _tag: "File", path: output }, videoBitrate: 500_000 });
      const frame = new Uint8Array(1280 * 720 * 4);
      const audio = new Uint8Array(2000 * 2);
      const [, , events, code] = yield* Effect.all([
        Stream.run(Stream.make(frame), encoding.video),
        Stream.run(Stream.make(audio), encoding.audio),
        Stream.runCollect(encoding.progress),
        encoding.exitCode,
      ], { concurrency: "unbounded" });
      assert.strictEqual(Number(code), 0);
      assert.isTrue(events.some((event) => event._tag === "Frame" && event.frame > 0));
      const ffprobe = yield* Ffprobe.make({ executable: process.env.EFFECT_BUILD_FFPROBE });
      const codecs = yield* ffprobe.codecTypes(output);
      assert.include(codecs, "video");
      assert.include(codecs, "audio");
      assert.isAbove(yield* ffprobe.duration(output), 0);
      const metadata = yield* ffprobe.json(output);
      assert.isTrue(metadata.streams.some((stream) => stream.codec_name === "h264"));
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the native integration entry point.
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  60_000,
);
