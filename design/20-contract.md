# UI1 contract

The public executable is `subzerodev-platform-ui-landing-page`. It exports
`defineLandingPage`, `LandingPageConfig`, `LandingPageRoute`,
`LandingPageEntryRoute`, `LandingPageBodyRoute`, `LandingPageMetadata`,
`LandingPageOpenGraphMetadata`, `LandingPageTwitterMetadata`,
`LandingPageIcon`, `defineLandingPageData`, `LandingPageDataConfig`,
`LandingPageDataSource`, `LandingPageDataSources`, `LandingPageData`,
`GenericLandingPageData`, `AdapterLandingPageData`, `LandingPageDataRoute`,
`LandingPageMarkdown`, and `validateLandingPageData`. Generic selectors start
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
That covers the custom-adapter static head, every site-wide stylesheet link,
and the generic shell's title, description, canonical URL, documentation URL
and repository URL. The two values emitted verbatim are named and validated
elsewhere: a body route's `body` and its `stylesheet`. Generic Markdown is
sanitized, not escaped.

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

`AdapterLandingPageData` has `kind: "adapter"` and carries `allow`, `publicDir`,
`styles` and the existing entry/body route declarations. Entry-module paths,
site-wide stylesheets and public assets remain filesystem references; theme CSS
and body-route stylesheets are strings in the model. An entry route may
additionally declare `dataSourceIds`; body routes may not.

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

## Site-wide stylesheets

`styles` declares repository-relative CSS files belonging to the site rather
than to any route. Each is copied to the output and emitted as a
`<link rel="stylesheet">` in the head of every custom-adapter route, entry and
body alike; no route opts out and no route adds one of its own. Declaration
order is emission order, and the links precede a body route's `stylesheet`,
which the head already places last — so a route's own CSS overrides site-wide
rules and never the reverse.

The field is available on `LandingPageConfig` and on `AdapterLandingPageData`,
so a TypeScript adapter, a JSON adapter model and a site composed by
`defineLandingPageData` express it identically. It does not reach the generic
shell, whose CSS is the theme file that form already owns.

A declared file that cannot be read ends the build rather than being dropped: a
site that builds and serves unstyled is the silent failure the declared-source
rules exist to prevent. An absent or empty `styles` emits no link and no
default.

## Serving built output

`preview` serves an already-built `outDir` over `node:http` for generic and
custom-adapter sites alike. It reads no adapter module and no source map: the
built tree is its whole input, so the command cannot branch on input mode and
cannot disagree with `build` about which mode a site is in. It honours
`--out-dir` and `--port` and no other flag.

One static server implementation serves both `preview` and generic `dev`. A
second copy is what would let the two diverge on resolution, containment or
content type, and the built tree is the artifact that ships, so a divergence
there is a divergence about the thing being inspected.

Resolution is over the request's pathname alone — a query or fragment never
reaches the filesystem — percent-decoded once, then resolved against `outDir`. A
pathname that is `/`, ends in `/`, or names a directory resolves to `index.html`
within it, so a route path and the URL a reader types for it name the same
document. A path resolving outside `outDir` is never read: it is a 404, the same
response as a path naming no file, and neither response carries filesystem
detail. This is the serving half of the containment rule the adapter already
holds when writing entry documents.

Every 200 carries a `Content-Type` derived from the file's extension. It is not
cosmetic: a built adapter route loads its bundle as a module script, and a module
served without a JavaScript type does not execute — the built site would fail in
the one command written to inspect it.

`preview` builds before serving: it runs the same build the site's mode already
uses, then serves the `outDir` that produced. There is no `--no-build` escape
and no absent-`outDir` error, because there is never an absent `outDir` to
report on. This accepts the risk named when the decision was made — `build`
clears `outDir` before writing, so a build that fails after the clear leaves
`preview` with nothing to serve — as the cost of a command that always shows
the current source, not a build that may be stale by however long it has been
since the last one ran.

## Consumer Vite plugins

A custom-adapter site may declare its own Vite plugins. The declaration is on
`LandingPageConfig` and nowhere else. `AdapterLandingPageData` does not carry it:
a plugin is code, the JSON model is data the package may fetch over HTTP, and a
fetched document must never name something the builder then executes. That
asymmetry with `styles` is deliberate, not an oversight. A site composed by
`defineLandingPageData` returns a `LandingPageConfig` and so declares plugins
like any other adapter.

Declaring no plugins changes nothing: emitted entry HTML, the `/`-relative entry
paths, `publicDir` staging and site-wide stylesheet links are what they were.

`configFile: false` is unconditional. A plugin may not reintroduce a
consumer-owned Vite configuration file, which is the duplication the adapter
exists to remove.

The dev server's `server.fs.allow` is exactly the site root plus the resolved
`allow` entries. Plugin-supplied configuration that would extend it does not take
effect; the run ends naming the entries it refused. A consumer widens that
sandbox through `allow`, which is declared and reviewable, or not at all.

Package-owned plugins keep their position. The adapter's route middleware still
registers ahead of Vite's built-in middlewares, and no consumer plugin displaces
it; consumer plugins follow the package's own, in declaration order.

`LandingPageConfig.plugins?: readonly PluginOption[]` reaches both `build` and
`dev` — one list, spread into both Vite calls identically. Declaring plugins
therefore does affect the shipped artifact, not only the dev experience: what
the package stops guaranteeing is stated rather than left to be discovered. A
plugin can rewrite emitted HTML and asset URLs, so the static-head, route-path
and output-layout guarantees hold only where a site declares no plugins; where
one is declared, the plugin's output is on the consumer, the same way a
site-wide stylesheet's _content_ is never validated by this package, only its
path and containment are.
