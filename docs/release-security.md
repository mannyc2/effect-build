# Candidate and workflow security

The CI and candidate workflows establish source authority before
repository-controlled code can run. CI checks out `github.sha`, then immediately
requires a lowercase 40-hex value equal to `git rev-parse HEAD`. A dispatched
candidate job first validates its requested source as data, checks out only that
validated value, and then requires the requested source, workflow source, and
HEAD to be identical. Every checkout retains `persist-credentials: false`.
Workflow and tool outputs enter commands through step-local environment values;
they are never interpolated into executable shell text.

Dependency automation is bounded to the Bun workspace at the repository root:
Dependabot runs weekly with at most three open pull requests, groups the Effect
4 endpoint family and compatible development tooling only for minor/patch
updates, and leaves raw `esbuild` as its own exact pin. Ordinary CI jobs may
cache only Bun downloads under the runner temporary directory; their keys bind
the runner, Bun 1.3.14, Node 24.14.1, and `bun.lock`. Release and candidate
jobs stay cold: setup-node package-manager caching is disabled and no cache
action or cache environment is present. Quality runs `bun audit --audit-level=high`
before the full verification gate. Audit output is
registry intelligence, not proof that the dependency graph is safe.

Candidate consumers use a two-phase install:

1. create a lock with a lock-only, script-disabled operation;
2. validate the fixture name, exact direct versions, candidate identities, and
   every resolved integrity;
3. remove any materialized `node_modules` directory;
4. perform a script-disabled frozen install; and
5. require the raw lock bytes to remain unchanged.

The npm lane uses npm 11.11.0 with `package-lock.json`; the Bun lane uses Bun
1.3.14 with `bun.lock`. An exact direct candidate tarball is the sole permitted
local locator because unpublished candidate packages must be installed from
the bytes under test. Workspace, link, directory, and every other file
reference are rejected. Legitimate duplicate transitive versions stay distinct
by lock location. SRI-pinned HTTPS tarball resolutions are accepted consistently
in both lock formats; non-HTTPS remote tarballs are rejected. No generated
all-transitive override map flattens them; the
existing exact `@effect/platform-node-shared` compatibility override remains a
single named constraint.

The candidate inventory remains exactly five tarballs and `manifest.json`.
Manifest v2 keeps the five ordered package records and adds 14 ordered consumer
records. Each consumer record names its fixture, installer, lock format, raw
lock SHA-256, and normalized installed-tree SHA-256. Tree normalization removes
temporary absolute roots while retaining logical package paths, names, and
versions, so duplicate versions remain visible.

The candidate producer records those hashes from the same fourteen real
consumer runs that exercised the tarballs. Because transient locks and trees
are deliberately not candidate artifacts, the independent six-file verifier
validates the observation schema and canonical order but cannot recompute the
values. It independently recomputes tarball sizes, SHA-256 values, manifests,
entries, and exports.

Lock and tree hashes are bounded verification observations. This is not a
hermeticity, input-closure, provenance, or cross-platform reproducibility claim. The
tarballs are packed once; consumer verification and any later coordinated
release must consume the same exact tarball bytes. This candidate workflow is
read-only and grants no registry or release mutation authority.
