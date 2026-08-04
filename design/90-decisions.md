# Decisions

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
