# UI1 contract

The public executable is `subzerodev-platform-ui-landing-page`. It exports
`defineLandingPage`, `LandingPageConfig`, `LandingPageRoute`,
`LandingPageEntryRoute`, `LandingPageBodyRoute`, `LandingPageMetadata`,
`LandingPageOpenGraphMetadata`, `LandingPageTwitterMetadata`,
`LandingPageIcon`, `defineLandingPageData`, `LandingPageDataConfig`,
`LandingPageDataSource`, `LandingPageDataSources`, and
`validateLandingPageData`. Generic selectors start
`szd-`; generic tokens start
`--szd-`. CLI input and error behavior is specified in the repository README.

## Route paths

A route path starts and ends with `/`. Every segment between them matches
`[A-Za-z0-9._-]+` and is neither `.` nor `..`, so no path can name a directory
above the generated entry directory and no percent-escape survives to decode
into a separator. Two routes may not declare one path. Both constraints hold
identically for `defineLandingPage` and for a `LandingPageData` model; the
adapter additionally refuses to write any entry document that would resolve
outside the generated entry directory.

## Escaping

Every value the package interpolates into a document it owns is HTML-escaped.
That covers the custom-adapter static head and the generic shell's title,
description, canonical URL, documentation URL and repository URL. The two
values emitted verbatim are named and validated elsewhere: a body route's
`body` and its `stylesheet`. Generic Markdown is sanitized, not escaped.

## JSON-backed site data

UI4 adds `LandingPageData` as a strict, versioned union and exports its public
types. Every model has `version: 1` and exactly one `kind`. Unknown fields,
unsupported versions, malformed metadata, duplicate or invalid route paths,
and invalid entry/body route combinations are errors.

`GenericLandingPageData` has `kind: "generic"` and carries the home Markdown,
optional supplemental Markdown, changelog Markdown, generic metadata and URLs,
optional theme CSS, and an optional public-directory path. Every Markdown
value may carry a repository-relative `assetBase`; it defaults to the
repository root.

`AdapterLandingPageData` has `kind: "adapter"` and carries `allow`, `publicDir`
and the existing entry/body route declarations. Entry-module paths and public
assets remain filesystem references; CSS and body-route stylesheets are strings
in the model. An entry route may additionally declare `dataSourceIds`; body
routes may not.

The CLI accepts `--source-map` (default `site/sources.public.yml`) and
`--source-id` (default `landing-page`). An explicitly named but missing source
map is an error. When the default map is absent, legacy adapter and generic
input resolution continues unchanged. The selected root source must declare
`at: build`. The package reads the public source map, prefetches the build-time
sources, and validates the root payload through `subzerodev-data-json`; it does
not parse YAML or fetch JSON independently. Public source-map entries may not
declare headers. Runtime file sources are rejected.

`--fallback-source-id` is optional and has no default. When it is absent a
declared source that fails ends the build, unchanged. When it names a source,
that source replaces the root model only if the root is the single source that
failed to resolve; a failure of any other source, or of the root alongside
another, still ends the build. The fallback must be declared in the same map and
must declare `at: build`. A substitution is written to stderr naming the failed
source, its reason and the fallback used — it is never silent.

For every entry route with `dataSourceIds`, the package emits only its referenced
sources as an escaped inert JSON `<script type="application/json"
id="szd-json-sources">` immediately before the route module script. The text
escapes `<` so a payload cannot terminate the script. The consumer entry owns
parsing it and constructing any Data.Json loader. The `szd-json-sources` id is
part of the public DOM contract. Generic and body routes emit no runtime source
map and initiate no data request.

## Routes composed from build-time data

`defineLandingPageData(sources, config)` declares a site whose routes are
composed from validated build-time JSON. `sources` carries one entry per key of
the consumer's `T`, each naming a source id and a `Validator` for that key's
type; declaring no source is an error, as is an entry without a string `id` and
a `validate` function. `config` receives the resolved `T` and returns a
`LandingPageConfig`.

Every declared id must exist in the public source map and declare `at: build`.
Each source resolves through its own validator. Missing ids, non-build sources,
resolution failures and validator failures are collected in declaration order,
with each diagnostic naming the adapter key and source id. Any failure ends the
build before `config` runs. The package owns resolution and validation timing;
it owns nothing about `T`, which is the consumer's, as is `config`. The
validator is required rather than optional: an unchecked cast would make `T` a
claim the package cannot support about JSON it never authored.

When a source map and an adapter module both exist, an adapter that declares
sources is selected over the root `LandingPageData` model, because such an
adapter is that data's consumer. An adapter that declares none is not selected
and the root model is used, so the precedence is additive. The
`--fallback-source-id` substitution does not apply here: there is no root model
to replace. An adapter declaring sources with no source map present is an error.

## Custom-adapter static head

Each custom-adapter route has a required `metadata.title` and
`metadata.description`. It may also declare a canonical URL, a social image,
Open Graph title/description/type/URL/image/dimensions, an X/Twitter card and
image, favicon or Apple-touch-icon links, a theme colour, and route-specific
`<noscript>` text. The adapter emits exactly the optional elements declared by
the route; it invents no defaults. Attribute and text values are HTML-escaped.

## Custom-adapter document body

A custom-adapter route declares exactly one of `entry` and `body`; declaring
both or neither is an error.

An `entry` route emits the toolkit shell — `<div id="root"></div>` followed by a
module script for that entry — as before.

A `body` route emits the supplied markup verbatim as the document body and emits
no script, so the generated document loads nothing. The caller owns that markup;
the package still owns the doctype, the head, and the static-head contract
above, which is identical for both route forms. A `body` route may also declare
a `stylesheet`, which the adapter emits verbatim as the last element of the head
inside a `<style>` element; CSS containing the string `</style` is rejected, and
a `stylesheet` declared on an `entry` route is rejected rather than dropped.
