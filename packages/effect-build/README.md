# effect-build

Core vocabulary and role-owned authoring protocols for provider-native build
integrations.

The package has exactly six public subpaths:

- `effect-build/Artifact`
- `effect-build/SystemTarget`
- `effect-build/Matrix`
- `effect-build/Author/Tool`
- `effect-build/Author/BorrowedOutput`
- `effect-build/Author/Executable`

```ts
import type * as Artifact from "effect-build/Artifact";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import * as Executable from "effect-build/Author/Executable";
import * as Tool from "effect-build/Author/Tool";
import * as Matrix from "effect-build/Matrix";
import * as SystemTarget from "effect-build/SystemTarget";
```

`Author/NodeMain`, `Profile/BrowserModulePayload`, `IncrementalNodeMain`, and
the typed-watch protocol are implemented and tested package-private candidates.
Their proof gates did not admit public exports.

The research-complete hard cut has no generic `BuildError`, `Target`,
`Generation`, `DurableFile`, `BorrowedContent`, `TreeSnapshot`, or
`StaticBrowserApplication` compatibility surface. Errors, lifecycle, and
publication authority belong to the operation or role that can state them
truthfully.

Those profile candidates have named external evidence gates still open. See the canonical
[`effect-build/research-complete-contract@1`](https://github.com/mannyc2/effect-build/blob/main/docs/research-complete-contract.md)
for dispositions, gates, and certification status.
