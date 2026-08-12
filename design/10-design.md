# UI1 design

The CLI resolves inputs in this order. Where `site/sources.public.yml` exists,
or `--source-map` explicitly names a map, it reads the named `LandingPageData`
payload through `subzerodev-data-json`; where no map exists it uses
`site/landing.config.ts`; where neither exists it uses the legacy README and
changelog files. A declared JSON source that cannot be read or validated fails
the build and never falls back. The root JSON source resolves at build time,
while an entry route may name additional build- or runtime-time public sources.

Generic JSON builds render sanitized Markdown strings into static HTML. Custom
JSON builds generate Vite entry HTML from declared routes, including each
route's declared static-head metadata and `<noscript>` content. A route declares
either an entry module, which receives the toolkit shell and a module script,
or its own document body, which is emitted verbatim with no script and may carry
an inline stylesheet. The body and generic forms remain static: only an entry
route may name runtime data. Its filtered public source map is emitted as
escaped inert JSON in `#szd-json-sources` before the module script; the consumer
entry owns constructing a Data.Json loader or React provider from it. One
document generator composes both forms and both pass through the same Vite
build, so output layout, public assets and static head do not vary by route
form. The merge command guards the documentation subtree with per-file SHA-256
fingerprints.
