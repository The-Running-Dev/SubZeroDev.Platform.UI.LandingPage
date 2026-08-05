# Decisions

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
