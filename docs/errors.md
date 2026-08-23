# Errors and interruption

Each public operation exposes its declared tagged error union at its exact
subpath. Input decoding, unsupported targets, discovery/probe failures,
compiler diagnostics, artifact inspection, and destination replacement remain
separate typed conditions.

Matrix results preserve input order. A failed cell is represented in the matrix
report rather than being silently retried by another provider. Successfully
committed cells remain observable; a matrix failure is not a matrix-wide
rollback.

Interruption is a Cause-level event. Closing the scope terminates owned child
processes and releases scoped resources; it must not be translated to a normal
compile or assemble failure.
