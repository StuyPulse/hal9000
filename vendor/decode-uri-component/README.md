# CommonJS compatibility backport

Source: official `decode-uri-component@0.5.0` npm tarball, SHA-1 `4592fa1e1d640ec5e2760e2e168ad2ab5f2c9da1`.

The source is reformatted and its `export default function` becomes `module.exports = function`. Algorithm and license are upstream's. This backports the CVE-2026-45822 fix without changing Expo SDK 57 or breaking `query-string@7`'s CommonJS require.

Metro explicitly redirects all `decode-uri-component` imports to this source. npm's transitive graph still contains the old package for tooling: do not describe npm audit as clean. Remove the Metro override when the supported Expo Router dependency chain includes the patched decoder natively. Regression tests exercise the Metro resolver and query-string's source against its resolved decoder.
