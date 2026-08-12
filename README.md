# SubZeroDev.Platform.UI.LandingPage

A static landing-page toolkit for repositories that want a README-driven home
page, a changelog route, optional full CSS control, and an auditable GitHub
Pages deployment path.

## Quick start

```powershell
npm install --save-dev subzerodev-platform-ui-landing-page@0.3.0
subzerodev-platform-ui-landing-page build
```

The default inputs are `README.md`, `CHANGELOG.md`, optional `site/README.md`,
optional `site/theme.css`, and optional `site/public/`. The build writes
`site/dist/` with `/` and `/changelog/`.

## JSON site data

When `site/sources.public.yml` exists, the builder reads the `landing-page`
source through `subzerodev-data-json@0.2.0`. Pass `--source-map` and
`--source-id` to select another map or source. The selected root source must
use `at: build`; an unavailable or invalid declared source fails the build and
does not fall back to legacy inputs.

Its JSON payload is a versioned `LandingPageData` object. A `generic` model
carries home, optional supplemental, and changelog Markdown; an `adapter` model
carries the same route declarations as the TypeScript adapter. Entry routes can
declare `dataSourceIds`; their filtered public map is emitted as inert JSON in
`#szd-json-sources` for consumer code to parse and load. Generic and body
routes remain static and make no runtime data request.

See [JSON-backed site data](docs/json-site-data.md) for a complete generic-site
example, an entry-route runtime-data example, and the validation rules.

## Custom adapter

Existing frontend sites can export `defineLandingPage(...)` from
`site/landing.config.ts`. Each route declares static metadata and exactly one of
`entry` and `body`. In addition to the required title and description, route
metadata can carry canonical, Open Graph, X/Twitter, icon, theme-colour and
`<noscript>` values; the adapter emits only the optional fields declared by that
route.

A route `path` starts and ends with `/`, and each segment between them matches
`[A-Za-z0-9._-]+` — so `/`, `/roadmap/` and `/docs/v1.2/` are paths, while
`/about`, `/../` and `/a//` are errors. Two routes may not declare one path.
Both rules apply identically to a `defineLandingPage` configuration and to a
`LandingPageData` model.

An `entry` route names a module, and its document is the toolkit shell —
`<div id="root"></div>` plus a module script — with `hydrate` available for a
server-rendered mount. A `body` route supplies the document body itself; that
markup is emitted verbatim, no script is emitted, and the built page loads
nothing. A `body` route may also declare a `stylesheet`, which is emitted as a
`<style>` element in the head, since `<style>` is not valid in the body.

```ts
export default defineLandingPage({
  routes: [
    {
      path: "/",
      body: "<main><h1>Composed at build time</h1></main>",
      stylesheet: "main { font: 1rem/1.5 system-ui; }",
      metadata: { title: "Home", description: "A page that loads no script." },
    },
  ],
});
```

## Development

```powershell
npm install
npm run check
```

## Compatibility

Generic-site DOM selectors and CSS custom properties beginning `szd-` are the
public styling contract. During `0.x`, consumers pin exact package versions and
workflow SHAs. A later `1.0.0` will use semantic-versioning major releases for
breaking CSS or DOM changes.
