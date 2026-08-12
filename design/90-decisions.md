# Decisions

### 2026-08-13 — A failed root model may fall back to a declared source, opt-in and loudly

Context: Docs-Template resolves each content document from a bundled default or
a configured remote URL, and when the remote fails it keeps the bundled default.
UI4 chose the opposite — a declared source that fails ends the build — so a
consumer moving a landing site to a published artifact loses the property that
its site still builds when the publisher is briefly unreachable. The gap was
first estimated as passing `JsonRequest.fallback` at the loader call. That is
wrong: `prefetch` resolves every `at: build` entry and throws `build.failed`
before returning, so the loader call is never reached and the request-level
fallback governs nothing here.
Chosen: an optional `--fallback-source-id` naming another `at: build` source in
the same public map. When `prefetch` fails and the root model is the _single_
failed source, the root entry is replaced by the fallback entry and the prefetch
is retried. Substitution is written to stderr naming the failed source, its
reason and the fallback. Default behaviour is unchanged: with no flag, a failure
still ends the build.
Rejected: **Docs-Template's implicit fallback** — it is silent, and a landing
site that quietly serves month-old copy is a worse outcome than one that fails
to build, because nobody is watching a static site the way a maintainer watches
a docs app. **Falling back for any failed source** — an auxiliary source failing
says nothing about whether the root is trustworthy, and recovering from it would
hide a broken publisher behind a working home page. **A `--fallback-path` naming
a file directly** — it would be a second source mechanism beside the map, which
is the duplication `subzerodev-data-json` exists to remove.
Reversibility: high. The flag is additive and defaults to the previous
behaviour, so withdrawing it affects only consumers who opted in.

### 2026-08-13 — A consumer owns its own content loader; the package owns the site model

Context: Docs-Template resolves many feature-scoped content documents — projects,
portfolio, CV, navigation, badges — each from a bundled JSON file or a remote URL
selected by configuration. The Data repository authors those in YAML, converts
them with `data-json-yaml`, and publishes the JSON artifacts. The question was
whether the landing package should grow the same per-feature content model so a
consumer like SubZeroDev.com could declare its projects and testimonials in JSON.
Chosen: it should not. The package's JSON path already delivers the loader
property that matters — a root model resolves from `path:` or `url:`
interchangeably, because `subzerodev-data-json` abstracts the difference and the
builder never branches on it. A consumer with structured content calls Data.Json
itself from `site/landing.config.ts`, exactly as Portfolio and Docs-Template do,
and composes its own body. The package keeps owning the site model, the routes
and the emitted document; it never owns product copy or its shape.
Rejected: **a section or component content model in the package** (`kind:
"sections"` with hero, features, projects, testimonials) — it is the most literal
reading of Docs-Template parity, and it moves copy structure and visual identity
into a repository whose brief excludes both. **build-time data injected into
`defineLandingPage`** — a factory receiving resolved sources would save each
consumer a little wiring, at the cost of a contract change and of the package
owning port construction that Data.Json already owns; the adapter module can
already call the loader directly, so the seam buys nothing it does not have.
Reversibility: high. Nothing was added, so nothing has to be withdrawn; the
build-time-injection seam remains available as an additive `0.x` change.

### 2026-08-13 — Route paths are validated as directory names, and every owned value is escaped

Context: the route-path validator accepted `/../`. A model route so declared
generated `../index.html`, which the adapter wrote outside its temporary entry
directory and left behind when the build then failed; `20-contract.md` had
claimed invalid route paths were errors. Separately, the generic shell
interpolated `docsUrl` and `repositoryUrl` into `href` attributes unescaped
while escaping the canonical URL beside them, so either value could close its
attribute and open a script element — in a document whose contract is that it
loads nothing. UI4 made both reachable from a JSON model that may be fetched
over HTTP.
Chosen: validate the path grammar in `assertRoute`, so the TypeScript adapter
and the JSON model enforce one rule rather than two; reject duplicate paths in
both; refuse to write an entry document resolving outside the generated
directory; and escape the two navigation URLs.
Rejected: **validating only the JSON path** — the adapter writes the file, so
the check belongs where the write is, and the asymmetry was itself the defect.
**Escaping a body route's `body` or `stylesheet`** — those are the two values
the contract names as caller-owned and validates by other means.
Reversibility: high for the escaping. The path grammar is a narrowing, so a
consumer using a segment outside `[A-Za-z0-9._-]` would need a widening release.

### 2026-08-13 — UI4 pins Data.Json 0.2.0

Context: the UI4 dependency gate required an immutable npm release exporting
`readSourceMap`; registry `0.1.0` did not include it. The newly published
`subzerodev-data-json@0.2.0` exports the reader from `/node` alongside the
prefetch and Node-port APIs UI4 needs.
Chosen: pin `subzerodev-data-json` exactly at `0.2.0` and implement UI4 against
that package. The landing package reads only the public map through Data.Json,
prefetches build-time values, and emits route-filtered inert runtime maps.
Rejected: a version range — it weakens the immutable consumer boundary; a local
reader — it duplicates the dependency's contract; a Git commit dependency — it
is not a released package artifact.
Reversibility: moderate. A correction requires a new immutable landing-package
release and an exact replacement dependency version.

### 2026-08-13 — Landing data moves through Data.Json without changing static-route ownership

Context: the generic builder reads Markdown directly and custom consumers encode
route primitives in TypeScript, while Docs-Template already carries an
independent YAML-to-JSON loading path. `subzerodev-data-json` exists to make the
source, timing and validation of a JSON payload declarative, but its published
`0.1.0` does not yet export the source-map reader needed to use the public YAML
map safely.
Chosen: define UI4 as an additive, JSON-backed `LandingPageData` path. A public
source map and build-time root source take precedence over the existing adapter
and Markdown inputs; declared JSON errors fail rather than falling back. Entry
routes alone may expose declared public runtime sources through inert
`#szd-json-sources`, and consumer code owns any loader or React provider. Body
and generic routes remain static. UI4 is blocked until the first immutable npm
release exporting `readSourceMap`, which it will pin exactly.
Rejected: **a local YAML reader** — duplicates Data.Json's contract and lets the
two validators drift. **a Git SHA dependency** — does not provide the immutable
package boundary consumers need. **package-owned React wiring** — makes React a
toolkit dependency and narrows the adapter seam. **runtime generic or body
rendering** — reverses their no-script static contract.
Reversibility: moderate. The JSON path is additive during `0.x`; withdrawing it
after consumers adopt it needs a breaking release.

### 2026-08-05 — A route declares either an entry module or its own document body

Context: `0.2.0` composes one body for every custom-adapter route: `<div id="root"></div>` plus a module
script for the route's entry. A consumer whose page is fully composed at build time cannot use the
adapter at all — it would have to ship an empty document plus a bundle whose only job is to fill it,
and it has no valid place for its stylesheet, because `<style>` is not conforming in `<body>`.
Chosen: make `LandingPageRoute` a union of an entry route and a body route. A body route's markup is
emitted verbatim as the document body, no script element is emitted, and an optional `stylesheet` is
emitted as a `<style>` element at the end of the head. Exactly one form must be declared; the
constraint is a type-level fact and is validated again at build time for JavaScript callers. Entry
routes are untouched, so this is additive for existing consumers.
Rejected: **An optional `body` beside the required `entry`** — the two never apply together, so the
type would admit "both" and "neither" and defer every mistake to a build-time error. **Escaping the
supplied body** — escaping is what makes the typed static head safe, and it is exactly what makes a
supplied body useless; the difference from the raw-head escape hatch rejected on 2026-08-04 is that
the head carries package-owned semantics a raw hole could contradict, whereas the body is entirely
consumer-owned content. **A body route that bypasses Vite** — a second output path would let asset
handling, public-directory copying and output layout drift between route forms. **A `stylesheet` on
entry routes too** — an entry route's CSS already travels through its module graph, and a second
mechanism would compete with it.
Reversibility: moderate. The union is easy to extend with further route forms; withdrawing the body
form after a consumer adopts it needs a new breaking package release.

### 2026-08-04 — The custom adapter owns declared static head, not consumer entry HTML

Context: `0.1.0` generated custom-adapter entry HTML but could express only a title, description,
canonical URL and one Open Graph image. A consumer with a complete static-head contract would lose
its Open Graph fields, X/Twitter card, icon links, theme colour and no-script fallback during
migration — a public regression caused by the integration it was meant to remove.
Chosen: add typed, route-local metadata for Open Graph, X/Twitter, icons, theme colour and no-script
content. The adapter emits exactly those declarations and HTML-escapes all supplied text and
attributes. This remains an adapter concern: consumers own values and public assets; the package
owns entry HTML generation.
Rejected: **Keep the fields in consumer-owned HTML** — preserves the values only by retaining the
duplicated mechanism. **Add an untyped raw-head escape hatch** — covers future tags, and makes an
HTML-injection surface part of the public API with no semantic validation. **Have the package infer
metadata from assets or route names** — guesses public copy and can silently change a consumer's
social card.
Reversibility: moderate. The additive `0.x` contract is easy to extend; removing a field after a
consumer adopts it needs a new breaking package release.

### 2026-08-04 — Vite and existing Markdown libraries are adopted

Context: Platform and Game Engine already prove Vite for custom landing pages;
generic Markdown must be safely rendered.
Chosen: Vite owns custom bundles; unified, remark, and rehype own Markdown,
GFM, and sanitization.
Rejected: hand-written parser or sanitizer — security-sensitive duplicate work;
hand-written HTML — no reusable Markdown contract; consumer-owned Vite config —
the duplicate configuration this repository exists to remove.
Reversibility: moderate.

### 2026-08-04 — UI1 release is pinned at 0.1.0

Context: UI2 must consume an immutable prerelease rather than the toolkit
working tree; Git tags are labels, not an immutability boundary.
Chosen: publish `subzerodev-platform-ui-landing-page@0.1.0` from source commit
`d2625b7be51585371d9f0b6c0b435c25e6ea4ade`, use that SHA for action references,
and provide `v0.1.0` as a convenience tag.
Rejected: a floating npm range or action branch — either can change under a
consumer without review; a Git submodule — preserves duplicated integration
ownership.
Reversibility: moderate; a correction requires a new immutable `0.x` release.
