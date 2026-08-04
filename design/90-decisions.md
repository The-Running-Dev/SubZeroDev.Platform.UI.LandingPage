# Decisions

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
working tree.
Chosen: publish `subzerodev-platform-ui-landing-page@0.1.0` from source commit
`d2625b7be51585371d9f0b6c0b435c25e6ea4ade` and tag that commit `v0.1.0`.
Rejected: a floating npm range or action branch — either can change under a
consumer without review; a Git submodule — preserves duplicated integration
ownership.
Reversibility: moderate; a correction requires a new immutable `0.x` release.
