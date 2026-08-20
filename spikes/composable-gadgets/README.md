# Composable gadgets — spike workspace

Isolated proof for [issue #69](https://github.com/The-Running-Dev/SubZeroDev.Platform.UI.LandingPage/issues/69).
Nothing here is part of the `subzerodev-platform-ui-landing-page` package: this
directory has its own `package.json`, its own React toolchain, and its own
`node_modules`, and it is excluded from the repository's eslint, vitest and
prettier configuration by name.

The findings are in [`../composable-gadgets-spike.md`](../composable-gadgets-spike.md).

## Running it

```bash
cd spikes/composable-gadgets
npm install
npm run verify        # typecheck, 39 unit tests, three builds, bundle assertions
npm run preview       # serves dist/ on http://localhost:4319
```

`http://localhost:4319/` is the composing host. It runs its own assertions in
the browser on load and prints them at the bottom of the page; the count is in
`#summary` and the machine-readable form is `window.__SPIKE_RESULTS__`.
`http://localhost:4319/standalone.html` is the same gadget as its own
application.

## Layout

| Path                    | What it is                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| `src/contract/`         | The proposed contract. Types, manifest schema, compatibility, errors.   |
| `src/runtime/loader.ts` | Manifest loader, module loader, registry, style attachment. No React.   |
| `src/react/`            | `Gadget`, `RemoteGadget`, `GadgetBoundary`, and the imperative `mount`. |
| `src/gadgets/counter/`  | The proof gadget, its config validator, its CSS, its remote entry.      |
| `src/gadgets/panel/`    | A gadget that is also a host surface, for the nesting case.             |
| `src/host/`             | The dashboard page, the standalone page, and the browser assertions.    |
| `src/shared/`           | Generated shared-dependency shims the import map resolves to.           |
| `scripts/`              | Shim generation and the build-output assertions.                        |
