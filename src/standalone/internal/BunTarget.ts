import { makeTargetTable } from "./TargetTable.js";

export const bunTargetTable = makeTargetTable(
  {
    "macos-x64": "bun-darwin-x64",
    "macos-aarch64": "bun-darwin-arm64",
    "linux-x64-gnu": "bun-linux-x64",
    "linux-x64-musl": "bun-linux-x64-musl",
    "linux-aarch64-gnu": "bun-linux-arm64",
    "linux-aarch64-musl": "bun-linux-arm64-musl",
    "windows-x64": "bun-windows-x64",
    "windows-aarch64": "bun-windows-arm64",
  } as const,
);

export type BunTarget = typeof bunTargetTable.Target.Type;
