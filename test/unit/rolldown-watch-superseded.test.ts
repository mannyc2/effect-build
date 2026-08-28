import { Effect, Stream } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const watchHarness = vi.hoisted(() => ({
  listener: undefined as ((event: unknown) => Promise<void>) | undefined,
  closeCalls: 0,
}));

vi.mock("rolldown", () => ({
  watch: () => ({
    on: (_name: string, listener: (event: unknown) => Promise<void>) => {
      watchHarness.listener = listener;
    },
    off: (_name: string, listener: (event: unknown) => Promise<void>) => {
      if (watchHarness.listener === listener) watchHarness.listener = undefined;
    },
    close: async () => {
      watchHarness.closeCalls += 1;
    },
  }),
}));

import * as Watch from "../../packages/effect-build-rolldown/src/Api/Watch.js";

beforeEach(() => {
  watchHarness.listener = undefined;
  watchHarness.closeCalls = 0;
});

const listener = async (): Promise<(event: unknown) => Promise<void>> => {
  const deadline = Date.now() + 5_000;
  while (watchHarness.listener === undefined) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the Rolldown watcher listener");
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  }
  return watchHarness.listener;
};

const completion = (duration: number, close: () => Promise<void>) => ({
  code: "BUNDLE_END",
  duration,
  output: [`event-${duration}.js`],
  result: { close },
});

describe("Rolldown API watch supersession", () => {
  it("samples the sliding queue immediately before offering a completed event", async () => {
    let releaseFirst!: () => void;
    let observeFirst!: () => void;
    let observeSecond!: () => void;
    let observeThirdClose!: () => void;
    let releaseThirdClose!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstObserved = new Promise<void>((resolve) => {
      observeFirst = resolve;
    });
    const secondObserved = new Promise<void>((resolve) => {
      observeSecond = resolve;
    });
    const thirdCloseObserved = new Promise<void>((resolve) => {
      observeThirdClose = resolve;
    });
    const thirdCloseReleased = new Promise<void>((resolve) => {
      releaseThirdClose = resolve;
    });

    const collected = Effect.runPromise(
      Watch.skipWrite({
        input: "entry.js",
        watch: { skipWrite: true },
      }).pipe(
        Stream.tap((event) =>
          event.code === "BUNDLE_END" && event.duration === 1
            ? Effect.promise(async () => {
              observeFirst();
              await firstReleased;
            })
            : event.code === "BUNDLE_END" && event.duration === 2
            ? Effect.sync(observeSecond)
            : Effect.void
        ),
        Stream.take(3),
        Stream.runCollect,
      ) as Effect.Effect<Watch.SkipWriteEvent[]>,
    );
    const emit = await listener();

    await emit(completion(1, async () => {}));
    await firstObserved;
    await emit(completion(2, async () => {}));
    const third = emit(completion(3, async () => {
      observeThirdClose();
      await thirdCloseReleased;
    }));
    await thirdCloseObserved;

    releaseFirst();
    await secondObserved;
    releaseThirdClose();
    await third;

    const events = await collected;
    expect(events.map((event) => event.code === "BUNDLE_END" ? event.duration : -1)).toEqual([1, 2, 3]);
    expect(events.map((event) => event.superseded)).toEqual([0, 0, 0]);
    expect(watchHarness.closeCalls).toBe(1);
  });
});
