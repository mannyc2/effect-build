# Changelog

## 0.4.0 (unpublished candidate)

- Replace the entire 0.3 public surface with the frozen namespace-only roots
  and exact subpaths in `research/post-0.3/freeze/SURFACE.json`.
- Apply every remove, replace, rename, and retain row in the frozen migration
  ledger with no compatibility aliases or legacy export fallback.
- Keep five lockstep packages at 0.4.0, with one-way provider-to-core
  dependencies and no provider-sibling dependency.
- Pack the five candidate packages once and verify the same tarballs through
  fresh npm and Bun consumers and an external Author adapter.

The candidate remains unpublished. Publication, tags, releases, and merges are
outside this change.
