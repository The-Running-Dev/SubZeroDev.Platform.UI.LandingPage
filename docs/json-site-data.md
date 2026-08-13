# JSON-backed site data

`subzerodev-platform-ui-landing-page@0.4.0` can build a site from a versioned
JSON model selected through `subzerodev-data-json@0.2.0`. This is a build-time
input: the root site model always declares `at: build`.

## Start with a generic site

Install both exact versions, then add these two files.

```powershell
npm install --save-dev subzerodev-platform-ui-landing-page@0.4.0 subzerodev-data-json@0.2.0
```

```yaml
# site/sources.public.yml
version: 1
sources:
  landing-page:
    at: build
    path: site/landing.json
    cache: manual
```

```json
{
  "version": 1,
  "kind": "generic",
  "home": {
    "markdown": "# Example site\n\nA static landing page loaded from JSON."
  },
  "supplemental": {
    "markdown": "## More detail\n\nThis content is optional."
  },
  "changelog": {
    "markdown": "# Changelog\n\n- First JSON-backed release"
  },
  "title": "Example site",
  "themeCss": ".szd-brand { color: rebeccapurple; }",
  "publicDir": "site/public"
}
```

Run `subzerodev-platform-ui-landing-page build`. The builder renders the
Markdown with the same sanitization used by the legacy README mode, copies
`site/public`, and writes `site/dist`.

## The same model from a file or from a URL

The builder never branches on where a source lives. Replacing `path:` with
`url:` for the same id builds the identical site from a published artifact:

```yaml
# site/sources.public.yml
version: 1
sources:
  landing-page:
    at: build
    url: https://the-running-dev.github.io/Data/landing/landing.json
    cache: manual
    maxBytes: 2000000
```

That is the property the Data repository is built around: content is authored as
YAML, converted to JSON artifacts with `data-json-yaml`, and published. A
consumer then reads a bundled file during development and the published URL in
CI by changing one line of the source map, with no code change and no second
loader. `test/json-source.test.ts` asserts the two forms produce byte-identical
output.

## Falling back to a bundled copy

By default a declared source that fails ends the build, and the previous
deployment stands. Where a site should keep building when its publisher is
briefly unreachable, declare a bundled copy beside the remote one and name it:

```yaml
# site/sources.public.yml
version: 1
sources:
  landing-page:
    at: build
    url: https://the-running-dev.github.io/Data/landing/landing.json
    cache: manual
  landing-page-bundled:
    at: build
    path: site/landing.json
    cache: manual
```

```powershell
subzerodev-platform-ui-landing-page build --fallback-source-id landing-page-bundled
```

This is Docs-Template's bundled-default behaviour, with two deliberate
differences. It is **opt-in** — with no flag the build still fails. And it is
**loud**: the substitution is written to stderr naming the failed source, its
reason and the fallback used, because a landing site that quietly serves stale
copy is worse than one that fails to build. Nobody watches a static site the way
a maintainer watches a docs app.

The fallback applies only when the root model is the single source that failed.
An auxiliary source failing says nothing about whether the root is trustworthy,
so it still ends the build.

A model fetched over HTTP is trusted to the same degree as the code that
composes the page. For `kind: "generic"` the Markdown is sanitized, so a
compromised source can change copy but cannot introduce script. For
`kind: "adapter"` a route's `body` and `stylesheet` are emitted verbatim, so a
source you do not control can put arbitrary markup on the page.

The builder does not verify a published artifact for you, and it is the wrong
layer to: integrity belongs to whatever publishes the JSON.
`SubZeroDev.Adventures.Content` is the worked example — it publishes a
`manifest.json` naming every document with its `version` and a `sha-256:`
digest, validates each one against a JSON-Schema contract before deploying, and
fails the build if the exported JSON has drifted from its source. A landing site
reading such a feed checks the manifest itself, in its own build. Where no such
manifest exists, prefer `path:` for any model carrying markup.

Every Markdown property is `{ "markdown": string, "assetBase"?: string }`.
`assetBase` is repository-relative and defaults to the repository root. Use it
when local Markdown links or images should resolve from another directory.

## Use JSON with an entry route

An adapter model carries the same route shape as `defineLandingPage`. `entry`
paths are relative to the directory containing `sources.public.yml`; `publicDir`
and `allow` are relative to the repository root.

The entry module is yours to write — the example below names `src/main.ts`
relative to `site/`, so create `site/src/main.ts` before building. `publicDir` is
optional and skipped when the directory does not exist.

```yaml
# site/sources.public.yml
version: 1
sources:
  landing-page:
    at: build
    path: site/landing.json
    cache: manual
  status:
    at: runtime
    url: https://status.example.com/data.json
    cache: manual
```

```json
{
  "version": 1,
  "kind": "adapter",
  "publicDir": "site/public",
  "routes": [
    {
      "path": "/",
      "entry": "src/main.ts",
      "dataSourceIds": ["status"],
      "metadata": {
        "title": "Example status",
        "description": "An entry route with declared runtime data."
      }
    },
    {
      "path": "/legal/",
      "body": "<main><h1>Legal</h1><p>Static content.</p></main>",
      "stylesheet": "main { max-width: 60rem; margin: 2rem auto; }",
      "metadata": {
        "title": "Legal",
        "description": "A static body route."
      }
    }
  ]
}
```

`dataSourceIds` is valid only on an `entry` route. The generated entry document
contains its declared sources, and no others, in an inert element immediately
before its module script:

```html
<script type="application/json" id="szd-json-sources">
  …
</script>
```

The landing builder never creates a browser loader or a React provider. Entry
code owns that choice. For example, it can parse the element and construct a
loader from the public map:

```ts
import { createJsonLoader, type SourceMap } from "subzerodev-data-json";

const element = document.querySelector<HTMLScriptElement>("#szd-json-sources");
// Absent on generic and body routes by contract, and on an entry route that
// declared no `dataSourceIds` — check rather than letting JSON.parse("") throw.
if (!element?.textContent)
  throw new Error("No #szd-json-sources on this route.");
const sources = JSON.parse(element.textContent) as SourceMap;
const loader = createJsonLoader(sources, {
  fetch,
  schedule(ms) {
    let timer: ReturnType<typeof setTimeout>;
    return {
      promise: new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      cancel: () => clearTimeout(timer),
    };
  },
});

const status = await loader.loadById("status");
```

## Rules and fallback

- `site/sources.public.yml` takes precedence over `site/landing.config.ts` and
  legacy Markdown. Supply `--source-map` or `--source-id` to select another
  map or root source. The one exception is an adapter module declaring its own
  build-time sources through `defineLandingPageData`: it is that data's
  consumer, so it outranks the root model. An adapter declaring none does not.
- A declared map, source, or model that cannot load or validate fails the build.
  It falls back only where `--fallback-source-id` names a replacement and the
  root model is the single source that failed.
- Sources declared through `defineLandingPageData` must use `at: build`. Missing,
  non-build, resolution, and validation failures are collected in the adapter's
  declaration order; route composition is never invoked after any failure.
- Models are strict: unknown fields, unsupported versions, invalid or duplicate
  paths, malformed metadata, and both/neither `entry` and `body` are errors.
- Public source maps cannot declare headers. Runtime filesystem sources are
  rejected. Build-time sources are prefetched; runtime sources stay declared
  until entry code reads them.
- Generic and body routes are static. They cannot declare runtime data and emit
  no `#szd-json-sources` element.
