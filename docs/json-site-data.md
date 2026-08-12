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

Every Markdown property is `{ "markdown": string, "assetBase"?: string }`.
`assetBase` is repository-relative and defaults to the repository root. Use it
when local Markdown links or images should resolve from another directory.

## Use JSON with an entry route

An adapter model carries the same route shape as `defineLandingPage`. `entry`
paths are relative to the directory containing `sources.public.yml`; `publicDir`
and `allow` are relative to the repository root.

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
const sources = JSON.parse(element?.textContent ?? "") as SourceMap;
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
  map or root source.
- A declared map, source, or model that cannot load or validate fails the build;
  it never falls back.
- Models are strict: unknown fields, unsupported versions, invalid or duplicate
  paths, malformed metadata, and both/neither `entry` and `body` are errors.
- Public source maps cannot declare headers. Runtime filesystem sources are
  rejected. Build-time sources are prefetched; runtime sources stay declared
  until entry code reads them.
- Generic and body routes are static. They cannot declare runtime data and emit
  no `#szd-json-sources` element.
