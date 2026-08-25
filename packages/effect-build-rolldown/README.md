# effect-build-rolldown

Rolldown 1.2.5 is a private research candidate. R6 did not admit a public
package, and M8 forbids empty or synthetic public lanes.

Compiled and tested API
candidates cover build, watch, transform, parse, minify, resolve, scan,
dev-engine, declaration, and config operations. Package-private command
candidates cover bundle, bundle-to-directory, and watch.

No package or conditional operation is promoted until its complete lifecycle, five-host,
dual Node/Bun host-runtime, independently packed-consumer, and publication gate
closes. The candidate `Api` and `Command` modules are repository-private; the
former `Build`, `Watch`, and `Profile` subpaths are absent.
