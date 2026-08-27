import type * as BorrowedOutput from "../BorrowedOutput.js";

export const TypeId: unique symbol = Symbol.for("effect-build/Author/NodeMain/SealedMain");

const borrowedFiles = new WeakMap<object, BorrowedOutput.File<"hashed">>();

/** Package-private brand/lease mint used by the sealed and incremental Node-main owners. */
export const mint = <Fields extends object>(
  fields: Fields,
  borrowed: BorrowedOutput.File<"hashed">,
): Readonly<Fields & { readonly [TypeId]: typeof TypeId }> => {
  const value = Object.freeze({ ...fields, [TypeId]: TypeId as typeof TypeId });
  borrowedFiles.set(value, borrowed);
  return value;
};

export const borrowedOf = (value: object): BorrowedOutput.File<"hashed"> | undefined => borrowedFiles.get(value);
