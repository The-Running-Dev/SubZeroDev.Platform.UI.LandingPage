# SubZeroDev.Platform.UI.LandingPage

A static landing-page toolkit for repositories that want a README-driven home
page, a changelog route, optional full CSS control, and an auditable GitHub
Pages deployment path.

## Quick start

```powershell
npm install --save-dev subzerodev-platform-ui-landing-page@0.4.1
subzerodev-platform-ui-landing-page build
```

The default inputs are `README.md`, `CHANGELOG.md`, optional `site/README.md`,
optional `site/theme.css`, and optional `site/public/`. The build writes
`site/dist/` with `/` and `/changelog/`.

## JSON site data

> Requires `subzerodev-platform-ui-landing-page@0.4.1`, which the quick start
> above installs. Nothing in this section or the next exists in `0.3.0`. Use
> `0.4.1` rather than `0.4.0`: that release reported only the first failing
> declared source, so correcting a malformed input revealed the next one instead
> of all of them.

When `site/sources.public.yml` exists, the builder reads the `landing-page`
source through `subzerodev-data-json@0.2.0`. Pass `--source-map` and
`--source-id` to select another map or source. The selected root source must
use `at: build`; an unavailable or invalid declared source fails the build and
does not fall back to legacy inputs. Pass `--fallback-source-id` to name another
`at: build` source that replaces the root model when the root is the only source
that failed; the substitution is reported on stderr rather than made silently.

Its JSON payload is a versioned `LandingPageData` object. A `generic` model
carries home, optional supplemental, and changelog Markdown; an `adapter` model
carries the same route declarations as the TypeScript adapter. Entry routes can
declare `dataSourceIds`; their filtered public map is emitted as inert JSON in
`#szd-json-sources` for consumer code to parse and load. Generic and body
routes remain static and make no runtime data request.

See [JSON-backed site data](docs/json-site-data.md) for a complete generic-site
example, an entry-route runtime-data example, and the validation rules.

## Routes composed from build-time data

Where a site composes its own markup from structured content, the adapter module
can declare the sources it needs and receive them validated and typed, instead of
serialising finished HTML into a JSON model:

```ts
import {
  defineLandingPage,
  defineLandingPageData,
} from "subzerodev-platform-ui-landing-page";

type Content = { projects: Project[] };

export default defineLandingPageData<Content>(
  { projects: { id: "projects", validate: validateProjects } },
  ({ projects }) =>
    defineLandingPage({
      routes: [
        {
          path: "/",
          body: renderProjects(projects),
          metadata: { title: "Projects", description: "What exists so far." },
        },
      ],
    }),
);
```

Each source names an id declared in `site/sources.public.yml` and the validator
that gives it a type. The validator is required: `T` is a claim about JSON this
package never authored, so an unchecked cast would make the type a lie. A
payload that fails ends the build before composition runs. Every declared
source must resolve at build time; failures are reported together in declaration
order, so one correction cycle can address every malformed input.

When both a source map and an adapter module exist, an adapter declaring sources
takes precedence over the root `LandingPageData` model, because it is that data's
consumer. An adapter declaring none is unaffected and the root model is used, so
adding this changes no existing build.

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
`<div id="root"></div>` plus a module script. A `body` route supplies the document body itself; that
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
