# UI1 contract

The public executable is `subzerodev-platform-ui-landing-page`. It exports
`defineLandingPage`, `LandingPageConfig`, `LandingPageRoute`,
`LandingPageEntryRoute`, `LandingPageBodyRoute`, `LandingPageMetadata`,
`LandingPageOpenGraphMetadata`, `LandingPageTwitterMetadata`, and
`LandingPageIcon`. Generic selectors start `szd-`; generic tokens start
`--szd-`. CLI input and error behavior is specified in the repository README.

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

For every entry route with `dataSourceIds`, the package emits only its referenced
sources as an escaped inert JSON `<script type="application/json"
id="szd-json-sources">` immediately before the route module script. The text
escapes `<` so a payload cannot terminate the script. The consumer entry owns
parsing it and constructing any Data.Json loader. The `szd-json-sources` id is
part of the public DOM contract. Generic and body routes emit no runtime source
map and initiate no data request.

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
