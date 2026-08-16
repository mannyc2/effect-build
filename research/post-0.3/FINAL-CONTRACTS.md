# Executable profile contracts

This file is generated from `research/post-0.3/contracts.ts`. Edit the TypeScript declarations, then run:

```text
node research/post-0.3/check-contract-markdown.mjs --write
```

## Protocols

| Constant | Protocol |
| --- | --- |
| `BrowserModuleApplicationProtocol` | `effect-build/profile/browser-module-application@1` |
| `NodeMainExecutableProtocol` | `effect-build/profile/node-main-executable@1` |
| `NodeMainProgramProtocol` | `effect-build/profile/node-main-program@1` |

## Declared fields

### `BuildStepObservation`

- `operation`
- `providerPackage`
- `profileProtocol`
- `tool`

### `ProfileProtocolUnsupported`

- `_tag`
- `profile`
- `expected`
- `observed`
- `providerPackage`

### `NodeMain`

- `_tag`
- `profileProtocol`
- `providerPackage`
- `content`
- `moduleFormat`
- `runtimeTarget`
- `syntaxCompatibility`
- `imports`
- `observations`

### `NodeMainProgramRequest`

- `entrypoint`
- `cwd`
- `moduleFormat`
- `runtimeTarget`
- `minify`
- `sourceMap`

### `NodeMainProgramService`

- `profile`
- `protocol`
- `providerPackage`
- `withMain`

### `NodeMainExecutableRequest`

- `main`
- `destination`
- `runtimeTarget`
- `acquisition`
- `digest`

### `NodeMainExecutableService`

- `profile`
- `protocol`
- `providerPackage`
- `assemble`

### `BrowserModuleApplicationRequest`

- `entryHtml`
- `cwd`
- `minify`
- `sourceMap`

### `BrowserModuleApplicationService`

- `profile`
- `protocol`
- `providerPackage`
- `withApplication`

### `ProfileAdapter`

- `status`
- `profile`
- `protocol`
- `providerPackage`
- `layer`

