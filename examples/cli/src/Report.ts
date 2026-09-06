import { Effect, FileSystem, Schema } from "effect";

const ByteCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Measurements = Schema.Struct({
  assets: Schema.Array(Schema.Struct({
    name: Schema.NonEmptyString,
    bytes: ByteCount,
    budgetBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  })),
});

export interface Summary {
  readonly totalBytes: number;
  readonly exceeded: number;
  readonly assets: ReadonlyArray<{
    readonly name: string;
    readonly bytes: number;
    readonly budgetBytes: number;
    readonly overBudgetBy: number;
  }>;
}

// JSON parsing and data validation share one typed error channel. A string such
// as "large" never reaches the arithmetic below as though it were a byte count.
const decodeMeasurements = Schema.decodeUnknownEffect(Schema.fromJsonString(Measurements));

export const read = Effect.fn("BundleReport.read")(function*(filename: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(filename);
  const measurements = yield* decodeMeasurements(text);
  const assets = measurements.assets.map((asset) => ({
    ...asset,
    overBudgetBy: Math.max(0, asset.bytes - asset.budgetBytes),
  }));

  return {
    totalBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    exceeded: assets.filter((asset) => asset.overBudgetBy > 0).length,
    assets,
  } satisfies Summary;
});

export const formatTable = (summary: Summary): string => {
  const rows = [
    ["Asset", "Bytes", "Budget", "Status"],
    ...summary.assets.map((asset) => [
      asset.name,
      String(asset.bytes),
      String(asset.budgetBytes),
      asset.overBudgetBy === 0 ? "OK" : `OVER by ${asset.overBudgetBy}`,
    ]),
  ];
  const widths = [0, 1, 2].map((index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));
  const lines = rows.map((row) => row.map((value, index) => value.padEnd(widths[index] ?? 0)).join("  "));
  return [...lines, "", `Total: ${summary.totalBytes} bytes; over budget: ${summary.exceeded}`].join("\n");
};
