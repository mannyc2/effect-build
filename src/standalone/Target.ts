import { Schema } from "effect";

export const Target = Schema.Literals(
  [
    "macos-x64",
    "macos-aarch64",
    "linux-x64-gnu",
    "linux-x64-musl",
    "linux-aarch64-gnu",
    "linux-aarch64-musl",
    "windows-x64",
    "windows-aarch64",
  ] as const,
);
export type Target = typeof Target.Type;
