# effect-build-apple

`Codesign`, `Notarytool` and `Stapler` are ordinary Effect services for Apple's native tools. Import the services from
`effect-build-apple`; argument types and notary output schemas are available at the matching module subpaths.

| Service      | Methods                         | Behavior                                                          |
| ------------ | ------------------------------- | ----------------------------------------------------------------- |
| `Codesign`   | `sign`, `verify`                | Sign a path in place; verify separately                           |
| `Notarytool` | `submit`, `wait`, `info`, `log` | Upload once, keep the native submission ID/status and JSON issues |
| `Stapler`    | `staple`, `validate`            | Mutate a path in place; validate its ticket separately            |

Each layer resolves its executable once and captures the platform. Codesign searches PATH by default. Notarytool and
Stapler resolve `xcrun` by default; an explicit executable selects the corresponding native binary directly. There is
no retry, substitute binary or host gate. Applications own nested-code ordering, packaging, release policy and retries.

Notarytool supports keychain profiles, API-key files and Apple-ID credentials. Apple-ID passwords are `Redacted` and
revealed only into its native password flag, then removed from failure diagnostics. This native interface does not
support altool's environment-password references; use a keychain profile to keep passwords out of argv. Command env
options stay native. Inherited output and transformed secrets remain the application's responsibility.

`layerConfig` reads layer options through Config. These services require an application-supplied Effect platform layer.
