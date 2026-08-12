# UI slices

## UI1 — Reusable package, CLI, and GitHub delivery

**Status:** complete

Delivers the generic renderer, custom adapter seam, changelog generator,
protected merge, composite action, and reusable Pages workflow.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.1.0` and source
commit `d2625b7be51585371d9f0b6c0b435c25e6ea4ade`; `v0.1.0` is a convenience
tag. Consumers pin the action by that commit SHA.

## UI2 — Custom-adapter static-head contract

**Status:** complete

Delivers the typed static-head metadata that an existing custom site needs to
retain its canonical URL, social metadata, icons, theme colour and no-script
fallback when it adopts the reusable adapter. The package emits only declared
optional elements and escapes every supplied value. The correction is released
as a new immutable `0.x` package version; consumers continue to pin exactly.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.2.0` from
source commit `69ec6db0de0dce467e5414cfb8ed670f51b117d1`; consumers pin the
package version exactly.

## UI3 — Caller-supplied route body

**Status:** complete

Delivers a second custom-adapter route form. A body route supplies the document
body itself instead of receiving the fixed `<div id="root"></div>` and entry
script, and the emitted document then loads no script at all. Such a route may
also declare a stylesheet, which the adapter emits as a `<style>` element in the
head because `<style>` is not conforming inside `<body>`. Entry routes keep
their existing shell and their existing type, so this is additive: a `0.2.0`
consumer's configuration builds unchanged.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.3.0` from
source commit `ab44435e3bc1af90509dd0364856a84aa7d932e8`; consumers pin the
package version exactly.

## UI4 — JSON-backed landing data

**Status:** implementation complete; release pending

Delivers a versioned JSON site model through `subzerodev-data-json`, preferred
when a public source map exists and falling back to the current TypeScript
adapter and README/changelog modes only when it does not. The root model resolves
at build time. Entry routes may expose a filtered public source map to consumer
code through escaped inert `#szd-json-sources`; generic and body routes remain
static. Validation rejects malformed models, invalid routes, undeclared source
ids, public headers, and runtime file sources.

**Dependency:** exact npm `subzerodev-data-json@0.2.0`, the first immutable
release exporting `readSourceMap` from `subzerodev-data-json/node`.

**Done when:** positive builds cover generic, entry, body, local-file,
build-time HTTP, and mixed build/runtime auxiliary sources; negative tests cover
every validator; declared JSON failure never falls back; and legacy adapter and
Markdown builds remain unchanged with no source map.
