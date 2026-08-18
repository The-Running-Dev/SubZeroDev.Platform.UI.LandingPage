# UI slices

## How this document is kept

Slices are numbered `UI<n>` and criteria `UI<n>.<m>`. **Neither is ever reused or
renumbered**: removing a criterion leaves a gap, because the id is what an
issue's checkbox refers to and what `/track` matches drift on. A reworded
criterion is the same criterion.

A slice moves to `## Landed` once its work is merged and, where the slice ships
one, its package version is published; the published handoff is recorded on the
slice itself. **Landed slices are never rewritten.** A re-run of `/slices` only
appends to `## Outstanding`.

Publishing an npm version needs explicit authorization every time, so no slice
carries its release as an acceptance criterion.

## Landed

### UI1 — Reusable package, CLI, and GitHub delivery

**Status:** complete

Delivers the generic renderer, custom adapter seam, changelog generator,
protected merge, composite action, and reusable Pages workflow.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.1.0` and source
commit `d2625b7be51585371d9f0b6c0b435c25e6ea4ade`; `v0.1.0` is a convenience
tag. Consumers pin the action by that commit SHA.

### UI2 — Custom-adapter static-head contract

**Status:** complete

Delivers the typed static-head metadata that an existing custom site needs to
retain its canonical URL, social metadata, icons, theme colour and no-script
fallback when it adopts the reusable adapter. The package emits only declared
optional elements and escapes every supplied value. The correction is released
as a new immutable `0.x` package version; consumers continue to pin exactly.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.2.0` from
source commit `69ec6db0de0dce467e5414cfb8ed670f51b117d1`; consumers pin the
package version exactly.

### UI3 — Caller-supplied route body

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

## Outstanding

### UI4 — JSON-backed landing data

**Status:** implementation complete; validator tests complete; release pending

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

**Amended 2026-08-13:** "declared JSON failure never falls back" is now the
default rather than the whole rule. `--fallback-source-id` opts into replacing a
failed root model with another declared `at: build` source, and only when the
root is the single failure. See `90-decisions.md` § _A failed root model may
fall back to a declared source, opt-in and loudly_.

**Remaining:** the release. The rejection branches this entry previously listed
as untested — `data.ts` on version, kind, markdown and metadata shape, icon
`rel` and Open Graph numeric fields, and `filteredMap` on an unknown id and a
runtime file source — all carry negative tests in `test/index.test.ts` and
`test/adapter.test.ts`.

### UI5 — Every caller reaches the same document writer

Delivers: for a consumer whose site reaches the builder some way other than
`defineLandingPage` — a JSON adapter model, a plain configuration object, or a
site composed from build-time data — pages that are checked as thoroughly as
everyone else's. Today such a site can quietly build one page where it declared
two, can have a script it never wrote injected into a document whose whole
promise is that it loads nothing else, and cannot hand its own data to the pages
that asked for it.

Touches: `src/adapter.ts`, `src/cli.ts`, `test/adapter.test.ts`,
`test/json-source.test.ts`

Depends on: none

Acceptance:

- UI5.1 An adapter route whose `entry` is `src/x"><script>alert(1)</script>`
  produces a document whose module-script `src` attribute contains the escaped
  value and which holds exactly one `<script>` element.
- UI5.2 A default-exported plain object — not built by `defineLandingPage` —
  declaring two routes with path `/` ends the build with
  `Duplicate route path '/'` and writes no output, matching what
  `defineLandingPage` and a JSON model already do with the same input.
- UI5.3 A `defineLandingPageData` site whose entry route declares
  `dataSourceIds: ["x"]`, with `x` declared `at: runtime` in the public map,
  builds and emits `<script type="application/json" id="szd-json-sources">`
  carrying `x` alone — instead of failing with a message claiming no source map
  exists.
- UI5.4 A generic build and a body route emit no `szd-json-sources` script, as
  before.

Out of scope: validating `entry` against a path grammar — the 2026-08-15
decision rejected that narrowing explicitly, and escaping closes the document
hole on its own. No contract text changes; all three behaviours are already
specified.

### UI6 — Withdraw the two fields that only ever get validated

Delivers: for anyone reading the type definitions to work out what a route can
do, two fields stop existing that never changed a generated page — a flag that
claimed to make an entry route hydrate, and a repository URL on route metadata
that no document has ever emitted. Both are validated today, which is what makes
them worse than absent: a consumer sets one, gets no error, and believes the page
changed.

Touches: `src/index.ts`, `src/data.ts`, `README.md`, `test/index.test.ts`

Depends on: none

Acceptance:

- UI6.1 `LandingPageEntryRoute` no longer declares `hydrate`, and a JSON model
  route declaring `hydrate: true` is rejected as an unknown field.
- UI6.2 `LandingPageMetadata` no longer declares `repositoryUrl`, and a JSON
  model route whose metadata declares `repositoryUrl` is rejected as an unknown
  field.
- UI6.3 `README.md` no longer states that `hydrate` is available for a
  server-rendered mount.
- UI6.4 A generic build still emits the repository nav link from
  `GenericLandingPageData.repositoryUrl`, HTML-escaped, unchanged.

Out of scope: `GenericLandingPageData.repositoryUrl` and the generic shell's
`repositoryUrl` option, which share a name with the withdrawn field but are read
and emitted. Do not touch them.

### UI7 — Site-wide stylesheets

Delivers: for a consumer whose CSS belongs to the site rather than to any one
page — a font stack, a colour reset, a print sheet — one place to declare those
files so every page links them. Today the same rules have to be threaded through
each route's entry module, or pasted into every body route's own stylesheet, and
a page composed entirely at build time has no way to get them at all.

Touches: `src/index.ts`, `src/data.ts`, `src/adapter.ts`, `README.md`,
`docs/json-site-data.md`, `test/adapter.test.ts`, `test/index.test.ts`

Depends on: none. Ordered after UI5 only because both edit the head builder, and
UI5 is the smaller change.

Acceptance:

- UI7.1 A configuration declaring `styles: ["site/base.css", "site/type.css"]`
  builds a site in which every custom-adapter document, entry route and body
  route alike, contains a `<link rel="stylesheet">` for each — `base.css` before
  `type.css` — and each emitted `href` resolves to a file present in the output.
- UI7.2 On a body route that also declares `stylesheet`, both site-wide links
  appear before the `<style>` element in the head.
- UI7.3 A `kind: "adapter"` JSON model declaring the same `styles` array
  produces the same links; a model whose `styles` holds a non-string is rejected
  naming the field.
- UI7.4 A declared path that cannot be read ends the build with a message naming
  that path, and no output directory is written.
- UI7.5 A configuration with no `styles`, and one with `styles: []`, emit no
  `<link rel="stylesheet">` and no default — a `0.3.0` configuration's generated
  documents are byte-identical to what it produced before.
- UI7.6 A generic build's head is unchanged: `szd-base.css` and `theme.css`, no
  site-wide link.

Out of scope: extending `styles` to the generic shell, whose CSS is the theme
file that form already owns; accepting inline CSS strings rather than paths; and
a per-route stylesheet link on an entry route, which the 2026-08-05 decision
rejected because an entry route's CSS already travels through its module graph.
