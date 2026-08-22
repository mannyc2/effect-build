import { Schema } from "effect";
import { SystemTarget as SystemTargetSchema } from "./TargetCatalog.js";
import type { SystemTarget } from "./TargetCatalog.js";

export type TargetEntries = readonly [
  readonly [SystemTarget, string],
  ...Array<readonly [SystemTarget, string]>,
];

export interface TargetTable<T extends SystemTarget> {
  readonly Target: Schema.Literals<readonly [T, ...T[]]>;
  readonly isTarget: (value: unknown) => value is T;
  readonly resolve: (value: unknown) => T | undefined;
  readonly nativeToken: (target: T) => string;
}

export const makeTargetTable = <const Entries extends TargetEntries>(
  entries: Entries,
): TargetTable<Entries[number][0]> => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("provider targetEntries must be non-empty");
  }
  const targets: SystemTarget[] = [];
  const tokens = new Map<SystemTarget, string>();
  for (const entry of entries as readonly unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Schema.is(SystemTargetSchema)(entry[0])) {
      throw new Error("provider target must be a known SystemTarget");
    }
    const target = entry[0];
    if (tokens.has(target)) throw new Error("provider targetEntries must not contain duplicate targets");
    if (typeof entry[1] !== "string" || entry[1].length === 0) {
      throw new Error("provider native target token must be non-empty");
    }
    targets.push(target);
    tokens.set(target, entry[1]);
  }
  const literals = Object.freeze(targets) as readonly [Entries[number][0], ...Entries[number][0][]];
  const Target = Schema.Literals(literals);
  const isTarget = Schema.is(Target);
  return Object.freeze({
    Target,
    isTarget,
    resolve: (value: unknown) => isTarget(value) ? value : undefined,
    nativeToken: (target: Entries[number][0]) => tokens.get(target)!,
  });
};
