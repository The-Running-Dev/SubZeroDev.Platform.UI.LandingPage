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

**Status:** complete

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

**Met 2026-08-13:** the `data.ts` rejection branches — version, kind, markdown
and metadata shape, icon `rel`, Open Graph numeric fields — now have negative
tests in `test/index.test.ts`, and `filteredMap`'s unknown-id and
runtime-file-source errors have them in `test/adapter.test.ts`, closing the last
gap against _Done when_.

Published handoff: npm `subzerodev-platform-ui-landing-page@0.4.1` from
source commit `3f1addd0b4c0bfa9dac4c0725a86d2e8e5d6edd1`; consumers pin the
package version exactly. `0.4.1` supersedes `0.4.0`, which was published from
this slice but reported only the first failing declared adapter source, so
correcting one malformed input revealed the next rather than all of them. Do not
pin `0.4.0`.

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
`docs/docs/json-site-data.md`, `test/adapter.test.ts`, `test/index.test.ts`

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

### UI8 — A site brings its own build steps

Delivers: for a consumer whose landing site is a React application, a
development server where editing a component updates the page in place instead
of reloading the whole thing — and, past that one case, the ability to bring any
build step the site needs to a build the package otherwise configures entirely.
Today adopting the package means giving those up: the site has no way to declare
them, so a consumer either loses them or keeps the duplicated configuration file
that adopting the package was meant to delete.

Touches: `src/index.ts`, `src/adapter.ts`, `src/data.ts`, `README.md`,
`test/adapter.test.ts`, `test/index.test.ts`

Depends on: none

Ordered first of the two because it carries the design's least certain bet: that
a consumer plugin can be given real configuration authority while the dev
server's filesystem sandbox stays package-owned, with a refusal a consumer can
act on rather than a silent re-narrowing.

Acceptance:

- UI8.1 An adapter configuration declaring a plugin whose `transform` replaces a
  marker string in an entry module produces built output containing the
  replacement, not the marker — the declared plugin ran during `build`.
- UI8.2 The same configuration's dev server serves that entry module with the
  same replacement applied — one declared list reaches both calls.
- UI8.3 A configuration declaring no plugins, and one declaring `plugins: []`,
  produce generated documents byte-identical to what the same configuration
  produced before, with unchanged `/`-relative entry paths, `publicDir` staging
  and site-wide stylesheet links.
- UI8.4 With a consumer plugin declaring its own `configureServer` middleware,
  the adapter's route middleware still answers `/` and a declared route path —
  the package's plugin keeps its position ahead of it, and two declared consumer
  plugins appear after the package's own in declaration order.
- UI8.5 A consumer plugin whose `config` hook returns
  `server: { fs: { allow: ["/etc"] } }` ends the dev run with a message naming
  `/etc`, and no server begins listening.
- UI8.6 With no plugin widening it, the started dev server's resolved
  `server.fs.allow` is exactly the site root plus each resolved `allow` entry,
  and nothing else.
- UI8.7 A `kind: "adapter"` JSON model declaring `plugins` is rejected as an
  unknown field, and the message names `plugins`.
- UI8.8 A site whose root holds a `vite.config.ts` that throws when it is
  evaluated still builds and still starts its dev server while declaring plugins
  — `configFile: false` holds unconditionally.
- UI8.9 `README.md` states that a declared plugin reaches both `build` and `dev`,
  and that the static-head, route-path and output-layout guarantees hold only for
  a site that declares none.

Out of scope: a plugin field on `AdapterLandingPageData` or any other JSON model
surface, which the 2026-08-19 decision rejected as remote code selection rather
than deferred; separate `buildPlugins`/`devPlugins` lists, rejected in the same
entry; accepting a consumer `configFile`; and generic mode, which has no consumer
entry module for a plugin to transform.

### UI9 — Look at the built site before shipping it

Delivers: for anyone about to trust the package with a site they already have, a
way to open the finished pages in a browser and check them — the real built
output, with its generated pages, fingerprinted asset names and copied public
files, rather than the development server's approximation of them. Today only
sites using the package's own built-in page style can be served that way; a site
with its own layout has to reinstall the very build tooling that adopting the
package removed.

Touches: `src/cli.ts`, a new module holding the shared static server,
`README.md`, `test/` (a new test module for the server, alongside the existing
CLI coverage)

Depends on: none. Ordered after UI8 only because UI8 carries the riskier bet;
neither slice touches the other's files.

Acceptance:

- UI9.1 `preview` on a custom-adapter site serves the built tree: `GET /` returns
  the home route's document, and `GET /roadmap` and `GET /roadmap/` both return
  the `roadmap` route's document.
- UI9.2 A 200 response carries a `Content-Type` derived from the file's
  extension: `.js` a JavaScript media type a browser executes as a module, `.css`
  `text/css`, `.html` `text/html`, and an extension the mapping does not name
  still carries a header rather than none. The built adapter site's home document
  loads and executes its module script when served this way.
- UI9.3 `GET /../package.json` and `GET /%2e%2e/package.json` each answer 404,
  and neither response body contains a filesystem path.
- UI9.4 `GET /index.html?v=1` and `GET /#top` return the home document — neither
  the query nor the fragment reaches the filename.
- UI9.5 `preview --out-dir <dir> --port <n>` serves `<dir>` on `<n>`. Passing
  `--adapter` or `--source-map` changes nothing about what is served, because
  `preview` honours neither flag — including where the flag names something
  that would otherwise change the build, or fail it. Mode is still resolved,
  once, by the `build` `preview` runs.
- UI9.6 `preview` on a generic-mode site serves its built tree by the same rules,
  and the two modes differ only in what `build` wrote.
- UI9.7 Generic `dev` serves through that same implementation, so on that path
  `/roadmap` without a trailing slash now resolves, `?v=1` no longer 404s, and
  every 200 carries a `Content-Type` — and generic `dev` and the adapter dev
  server now agree about a route URL without a trailing slash.
- UI9.8 `preview` builds before serving: with `outDir` deleted beforehand it
  still serves, and with a source edit made after the last build the served
  document carries the edit.
- UI9.9 `README.md` documents `preview` alongside `dev`, `build`, `check` and
  `merge`, and states that it builds first.

Out of scope: resolving input mode in `preview`, and any `--no-build` or
absent-`outDir` path — the 2026-08-19 decisions rejected both. A second server
implementation for adapter mode. Changing the adapter dev server, whose own
route middleware is unaffected; only generic `dev`'s static serving moves.

### UI10 — The site you develop against is the site that ships

Delivers: for a consumer who keeps a published site model and a local adapter
file side by side, a development server that shows the site the deploy will
actually publish. Today the two commands disagree without saying so — the deploy
uses the published model and the development server ignores it entirely, so
every page checked locally belongs to a site nobody is going to see. Pages that
ask for their own data also get it locally now, and a data source that cannot be
reached stops the server starting instead of letting someone develop against a
page with its content missing.

Touches: `src/cli.ts`, `src/adapter.ts`, `README.md`, `test/json-source.test.ts`,
`test/adapter.test.ts`

Depends on: none

Ordered first of the two because it carries the least certain bet in the
rewritten design: that a site selected by the source map can still be served by
the Vite dev server, rather than being sent to build-and-serve like every other
map-selected site. The 2026-08-19 decision rejected the uniform fix by name for
exactly that reason, so the slice that proves the branch is the one to run first.

Acceptance:

- UI10.1 In a repository holding both a public source map whose root model
  declares `kind: "adapter"` and an adapter module declaring no build-time
  sources, `dev` serves the routes the model declares, not the routes the adapter
  module declares — the same site `build` writes from the same two files.
- UI10.2 That site is served by the Vite dev server and not by the static server:
  a request for an entry module the model names returns JavaScript Vite
  transformed, not the module's source bytes.
- UI10.3 In the same repository, a root model declaring `kind: "generic"` is
  built and served statically, and a request for a declared route path without a
  trailing slash resolves — the family decides the server, not the ladder rung.
- UI10.4 An adapter module declaring build-time sources still outranks the root
  model under `dev`, as it already does under `build`.
- UI10.5 A repository with an adapter module and no source map is unchanged: the
  Vite dev server starts and the adapter module is re-read per request, so an
  edit to it takes effect without a restart.
- UI10.6 A repository with neither an adapter module nor a source map is
  unchanged: the generic site is built and served statically.
- UI10.7 Under `dev` on a data-backed adapter, an entry route declaring
  `dataSourceIds` emits `<script type="application/json" id="szd-json-sources">`
  carrying the prefetched map — each build-time entry holding its resolved
  payload inline, not the path or URL the public map declared — byte-identical to
  what `build` emits for the same route. A body route and a generic route emit
  none.
- UI10.8 A declared source that cannot be fetched, or whose payload fails its
  validator, ends `dev` before the server listens: the message names the source
  and its reason, and nothing binds the port.
- UI10.9 `--source-map` naming a file that does not exist ends `dev` with the
  same message `build` raises for the same flag; an absent _default_ map is not
  an error and resolution continues down the ladder.
- UI10.10 `dev` selects mode by calling the same function `build` does:
  `hasAdapter` and `hasSourceMap` are each reached from exactly one call site in
  `src/cli.ts`, and `dev` holds no source-map or adapter test of its own.

Out of scope: hot-reloading a data-backed adapter's configuration — re-resolving
per request was rejected on 2026-08-19 because it refetches every declared source
on every navigation, and the restart is the retained cost. Sending a map-selected
adapter-family site to build-and-serve, which is the uniform fix the same day's
decision rejected by name. `--base-path` on generic `dev`, which is a separate
filed defect. Any new exported name: `devAdapter` may gain what it needs to hold a
resolved configuration and a prefetched map, and no new module surface appears.

### UI11 — One containment check, and it follows symbolic links

Delivers: for anyone whose stylesheets, images or served files are reached
through a symbolic link, a build that refuses to read outside the repository the
same way on every path. Today three separate checks disagree about what
"outside" even means, and none of them follows a link — so a link pointing out of
the tree is read and copied into the published site on two of the three paths,
and refused on the third.

Touches: `src/paths.ts`, `src/generic.ts`, `src/adapter.ts`,
`src/staticServer.ts`, `README.md`, `test/generic.test.ts`,
`test/adapter.test.ts`, `test/preview.test.ts`

Depends on: none. Ordered after UI10 only because UI10 carries the riskier bet;
the two touch different functions of `src/adapter.ts` and no other file in
common.

Acceptance:

- UI11.1 A site-wide stylesheet path that resolves, through a symbolic link, to a
  file outside the repository root ends the build naming that declared path, and
  no output directory is written. It builds today.
- UI11.2 A site-wide stylesheet path naming a file that does not exist still ends
  the build with the unreadable-stylesheet message, naming the declared path —
  containment is checked in an order that does not turn a missing file into a
  resolution failure with a different message.
- UI11.3 A local Markdown asset that resolves, through a symbolic link, to a file
  outside the repository root ends the generic build naming that asset. It is
  copied under `assets/source/` today.
- UI11.4 A request for a file inside the served tree that is a symbolic link to a
  file outside it answers 404, and the response body carries no filesystem path.
  It is served today.
- UI11.5 A request naming a path that does not exist still answers 404 — it does
  not throw, does not answer 500, and does not end the server.
- UI11.6 A stylesheet, a Markdown asset, and a served file each reached through a
  symbolic link that stays inside the root are all still accepted.
- UI11.7 `src/generic.ts`, `src/adapter.ts` and `src/staticServer.ts` each import
  `assertWithin` from `src/paths.ts`, and none of the three retains a containment
  comparison of its own.
- UI11.8 Every refusal the three checks already make is still made: an absolute
  stylesheet path, a stylesheet path relative to exactly `..`, an asset path
  beginning `../`, and a request for `/../package.json` or `/%2e%2e/package.json`
  each fail or 404 as they do today.
- UI11.9 `README.md` states that a declared stylesheet or asset resolving outside
  the repository root through a symbolic link is refused, so a consumer relying on
  one reads why the build stopped.

Out of scope: `src/merge.ts`, whose guarantee is the per-file fingerprint and not
a path check (**C25**) — routing it through `paths` would suggest the path check
is what protects the subtree, which is the belief that invariant exists to
correct. Changing what `assertWithin` does: the contract specifies `realpath` on
both sides before comparing, so the call sites order around it rather than
relaxing it. Removing `isWithin` or `resolveFrom`. Extending containment to any
path the three modules do not check today.
