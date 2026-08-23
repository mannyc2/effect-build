# effect-build documentation

This documentation describes the unpublished 0.4.0 hard-cut candidate. The
complete authority is the frozen surface and migration ledgers, not a legacy
import path.

| Document                                  | Covers                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| [API](api.md)                             | Exact package roots, subpaths, and namespace rule      |
| [Architecture](architecture.md)           | Ownership, layers, artifacts, and no-fallback boundary |
| [Integrations](drivers.md)                | Bun, Deno, Esbuild, and Node SEA operations            |
| [Errors](errors.md)                       | Typed failure and interruption behavior                |
| [Candidate evidence](release-security.md) | Once-packed tarballs and certification scope           |

Runnable examples are under [`examples/`](../examples). The normative public
surface is [`SURFACE.json`](../research/post-0.3/freeze/SURFACE.json), and
every removal or replacement is in
[`MIGRATION.json`](../research/post-0.3/freeze/MIGRATION.json).
