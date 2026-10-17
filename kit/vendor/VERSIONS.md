# Vendored dependencies

Pinned and committed so a build needs nothing from the network and nothing to install.

| Package | Version | Files | License |
|---|---|---|---|
| three | 0.186.1 | `build/three.module.js`, `build/three.core.js`, the addons under `examples/jsm/` that the kit imports | MIT (`three/LICENSE`) |
| @dimforge/rapier3d-compat | 0.21.0 | `dist/rapier.mjs` (WASM inlined as base64; source-map comment removed) | Apache-2.0 (`rapier/LICENSE`) |

To update: `npm pack <package>@<version>`, copy the same files, rebuild every example, and check the games still pass their audits.
