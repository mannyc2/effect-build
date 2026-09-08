# Changelog

## 0.7.0

0.7.0 composes compilers and packagers through one `Artifact.File | Artifact.Executable |
Artifact.Directory` record with numeric byte counts and SHA-256. Bun and Deno compile and bundle,
esbuild and now-public Rolldown retain scoped native APIs, and Node SEA consumes artifact inputs.
The same executable feeds archives, OS packages, and the new Python wheel writer without external
tools; uv builds projects and Syft generates SBOMs. Apple and Windows signing remain experimental.
This release deletes `Author/*`, parallel hashed/unhashed identities, generated contracts, launch
reauthentication, command wrappers for esbuild/Rolldown, and unused utility wrappers; checks and
staging are combinators and options.
