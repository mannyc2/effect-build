# effect-build-windows

`SignTool` is an Effect service for native Windows SignTool. Import it from `effect-build-windows`; credential/input
types and options are available at `effect-build-windows/SignTool`.

`SignTool.layer` resolves one explicit executable or PATH match and captures the platform. `sign` signs a path in place
and returns its absolute path. `verify` performs native Authenticode verification separately. Signing supports PFX,
certificate-store and Trusted Signing credentials, optional RFC3161 timestamping, and `extraArgs`.

PFX passwords are `Redacted`, revealed only while rendering the native `/p` option and removed from failed diagnostics.
Native env options support external credential providers. Certificate trust, stores, timestamps and SDK capability
remain the application's choices; no version/host gate runs.

Applications supply an Effect platform layer. `SignTool.layerConfig` reads layer options through Config. Real signing
and certificate-trust tests require a disposable Windows environment configured by its owner.
