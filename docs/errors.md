# Errors and troubleshooting

Each operation declares its own Effect error channel. Core errors describe tool identity and artifact lifecycle failures;
provider errors retain native input, exit, and diagnostic details. There is no shared `BuildError` or generic `ToolFailed`
wrapper.

## Read the error tag and stage

Command layer acquisition can fail while resolving or probing a tool. A later operation can fail admission,
reauthentication, production, inspection, or finalization. Handle errors after providing the layer when you want one
boundary covering both acquisition and execution.

| Error tag                                                                      | Meaning                                                               | What to check                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ToolNotFound`                                                                 | No usable executable was selected                                     | Install the required tool yourself and pass its absolute path                                 |
| `ToolSelectionInvalid`                                                         | Explicit selection or provider observation is invalid                 | Path normalization, executable identity, and `reason`                                         |
| `ToolSelectionAmbiguous`                                                       | Multiple canonical executables match `PATH`                           | Inspect `candidates`; pass the intended absolute path                                         |
| `SelectedToolChanged`                                                          | Selected tool bytes changed after selection                           | `path`, `expected`, and `observed`; intentionally reacquire a layer for a changed tool        |
| `ArtifactInvalid`                                                              | A core observation could not establish a valid artifact/tool file     | The recorded `path` and `reason`                                                              |
| `BunCommandUnsupported`, `DenoCommandUnsupported`, `EsbuildCommandUnsupported` | Selected version does not meet that operation's policy                | Exact versions in [provider drivers](drivers.md#tool-versions-and-runtime-requirements)       |
| `NodeSeaUnsupported`, `NodeSeaRelationRejected`                                | SEA version, capability, target, or builder/base relation was refused | Node version, `--build-sea`, Linux x64 GNU target, matching builder/base versions             |
| Provider `*InputInvalid` or API mode error                                     | The request does not fit that operation                               | Exported input type and error `reason`; memory/direct/finalized output selection              |
| Provider `*TransportFailed`                                                    | Launch or stream transport failed                                     | Underlying `cause`, executable access, working directory, platform services                   |
| Provider `*CommandFailed`                                                      | The process exited unsuccessfully                                     | `exitCode`, raw `stdout`/`stderr`, and truncation flags                                       |
| Provider `*CommandOutputTruncated`                                             | A successful stdout operation exceeded its capture bound              | Raise `outputLimitBytes` deliberately; never consume the captured prefix as a complete bundle |

Error classes need not be imported to match their `_tag`. Some provider errors are exposed through public operation/layer
types without a public constructor export. Avoid importing package-private `internal` modules.

## Keep native diagnostics

For example, log a failed Bun command's native stderr and preserve the original error:

```ts
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const compile = Command.CompileExecutable.compileExecutable({
  entrypoints: ["./src/cli.ts"],
  outfile: "./dist/cli.exe",
  observation: "hashed",
}).pipe(
  Effect.catchTag("BunCommandFailed", (error) =>
    Effect.gen(function*() {
      yield* Effect.logError({
        operation: error.operation,
        exitCode: error.exitCode,
        stderr: new TextDecoder().decode(error.stderr),
        stderrTruncated: error.stderrTruncated,
      });
      return yield* Effect.fail(error);
    })),
);
```

The enclosing application still provides the command and platform layers. This handler observes command failure only;
other typed failures propagate unchanged.

For command failures, streams are retained as bounded `Uint8Array` prefixes. Read `stdoutTruncated` and `stderrTruncated`
before treating diagnostics as complete. `publication: "provider-direct-durable"` means partial output can remain after a
failed direct build. It does not claim that a directory was finalized successfully.

For esbuild API rejection, `EsbuildFailed.cause` preserves the native rejection and `.errors`/`.warnings` expose its native
diagnostic arrays. Bun API calls preserve native `BuildOutput`, including its `success` and `logs` fields; inspect that
result as well as handling `BunApiFailed` when a call rejects. A successful Effect containing a native result is not a
new interpretation of that provider's success semantics.

## Finalization failures

File, tree, and executable finalizers use parallel error families, such as `FileDestinationLocked`,
`TreeDestinationLocked`, and `ExecutableDestinationLocked`.

| Suffix               | Meaning and response                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DestinationInvalid` | Destination resolution or setup failed; check the path and parent directory access                                  |
| `DestinationLocked`  | Destination exists or conflicts with another in-process claim; choose a fresh destination or coordinate the writers |
| `CandidateMissing`   | Production did not leave the expected candidate                                                                     |
| `CandidateChanged`   | Candidate changed while it was being observed or inspected; find the competing writer                               |
| `InspectionFailed`   | Executable inspection did not establish consistent runtime/format/target facts                                      |
| `CommitFailed`       | Filesystem commit failed; inspect `reason` and destination state                                                    |

Provider-specific inspectors may also return their own failure, such as `NativeExecutableInspectionFailed` or
`NodeSeaCandidateInvalid`. The finalizer preserves producer and inspector failures in its declared error union.

Finalized outputs never overlay an existing destination. Repeating a successful build with the same `outfile` can therefore
produce `ExecutableDestinationLocked`; this is expected. Do not delete an output in a generic error handler, because it
may belong to an earlier build or another writer.

`FileVerificationFailed` and `TreeVerificationFailed` mean the durable path no longer proves the identity you received.
It may be missing, aliased, changed during observation, or have different content. Stop that handoff and inspect the
mismatch; retrying the upload or trusting only the saved digest would not repair it.

## Scope and interruption

Command interruption closes its process scope. esbuild context closure cancels and disposes the native context. Bun's
in-process `Bun.build` has no cancel handle, so interrupting its Effect stops awaiting without guaranteeing native work
has stopped. Direct output and cache changes can survive interruption.

Interruption and defects remain in Effect's `Cause`; they are not converted into ordinary build failures. In particular,
a matrix reports typed cell failures but returns no report when interrupted. Outputs already finalized by successful cells
are not rolled back.

Borrowed-output errors describe a temporary lifetime:

- `BorrowedOutputExpired`: `observe` was used after the continuation ended.
- `BorrowedOutputChanged`, `Missing`, or `Escaped`: the candidate changed, disappeared, or escaped its owned root.
- `BorrowedOutputObservationFailed`: observation could not establish identity.
- `CleanupFailedAfterSuccessfulUse`: the continuation succeeded but its temporary output could not be removed.

Provide `BorrowedOutput.CleanupReporter.layer` for the default cleanup warning logger, or supply a custom reporter. When
cleanup also fails after the main use has failed, the reporter retains that diagnostic without replacing the primary
failure.
