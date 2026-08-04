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
