# R7 executable-matrix law verdict

Date: 2026-08-21.
Status: **retain with a hard-cut result/error redesign**.

The executable model in `r7-matrix-laws.mjs` runs the same law suite for Bun and
Deno. It establishes the M2 contract selected in `PRODUCT-DECISIONS.md`:

- deterministic provider/operation/input-index cell identity;
- caller-selected positive bounded concurrency;
- exactly one scalar `compileExecutable` invocation per started cell;
- independent publication and no rollback claim;
- an input-ordered success-or-typed-failure result for every normally completed
  cell;
- defects and caller interruption remain Cause rather than cell results;
- interruption starts no queued cells; and
- already committed scalar artifacts remain durable after interruption.

The 0.3 `readonly Artifact[]` success and `MatrixFailed` aggregate-failure shape
cannot express these laws. It is replaced at the 0.4 hard cut by an ordered
matrix report with explicit `Success` and `Failure` cell variants. An interrupted
or defective invocation returns no misleading complete report.

This executable research proves the contract that Plans 039 and 044 must
implement and certify; it does not certify the not-yet-written production code.
