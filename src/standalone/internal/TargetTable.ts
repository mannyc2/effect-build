import { Schema } from "effect";
import { Target as CanonicalTarget } from "./TargetCatalog.js";
import type { Target as CanonicalTargetType } from "./TargetCatalog.js";

export interface TargetTable<T extends CanonicalTargetType> {
  readonly Target: Schema.Literals<readonly [T, ...T[]]>;
  readonly isTarget: (value: unknown) => value is T;
  readonly resolve: (value: unknown) => T | undefined;
  readonly nativeToken: (target: T) => string;
}

type ValidEntries<E extends Readonly<Record<string, string>>> = Exclude<keyof E, CanonicalTargetType> extends never
  ? keyof E extends never ? never
  : "" extends E[keyof E] ? never
  : E
  : never;

export const makeTargetTable = <const E extends Readonly<Record<string, string>>>(
  entries: E & ValidEntries<E>,
): TargetTable<Extract<keyof E, CanonicalTargetType>> => {
  const table = Object.freeze({ ...entries });
  const keys = Object.freeze(Object.keys(table)) as readonly [
    Extract<keyof E, CanonicalTargetType>,
    ...Array<Extract<keyof E, CanonicalTargetType>>,
  ];
  if (keys.length === 0) throw new Error("target table must not be empty");
  for (const key of keys) {
    if (!Schema.is(CanonicalTarget)(key)) throw new Error(`unknown canonical target: ${key}`);
    if (typeof table[key] !== "string" || table[key].length === 0) {
      throw new Error(`native target token must be non-empty: ${key}`);
    }
  }
  const Target = CanonicalTarget.pick(keys);
  const isTarget = Schema.is(Target);
  return Object.freeze({
    Target,
    isTarget,
    resolve: (value: unknown) => isTarget(value) ? value : undefined,
    nativeToken: (target: Extract<keyof E, CanonicalTargetType>) => table[target],
  });
};
