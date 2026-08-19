# UI1 contract

## How this document is kept

Invariants carry stable ids `C<n>`. **Ids are never reused or renumbered** —
withdrawing an invariant leaves a gap, because the id is what a slice, a test
name, or a review thread refers to. A reworded invariant is the same invariant.

The declarations this document once carried as scaffolds now live in the tree,
and are pointed at rather than restated (`AGENTS.md`, _Single ownership_). What
is written here is what a declaration cannot carry: when a value is meaningful,
what must never be normalised away, what a consumer may not assume, and what
each rule exists to prevent.

## Types

The exported type surface is declared in [`src/index.ts`](../src/index.ts) and
[`src/data.ts`](../src/data.ts); `src/index.ts` re-exports the latter, so the
package's `.` entry point is the single import site. What the declarations
cannot state:

**Route metadata** (`LandingPageMetadata` and its Open Graph, Twitter and icon
members, `src/index.ts`). `title` and `description` are required because every
generated document emits both unconditionally; every other field is emitted only
when declared. The package invents no defaults — an absent `openGraph` produces
no `og:` element rather than one derived from `title`, and this is the whole
reason the optional fields are optional rather than defaulted. Two fields were
withdrawn deliberately and must not return by accident: `hydrate` on an entry
route and `repositoryUrl` on metadata, both of which validated without ever
changing a generated page (`90-decisions.md`, 2026-08-15).

**Route forms** (`LandingPageEntryRoute`, `LandingPageBodyRoute`,
`LandingPageRoute`, `src/index.ts`). The union is discriminated structurally, by
which of `entry` and `body` is a string, not by a tag field — so a plain object
literal that never imported this package is classified exactly as one built by
`defineLandingPage`. `stylesheet` is meaningful only on the body form; on the
entry form it is an error rather than an ignored field (**C4**).

**Site configuration** (`LandingPageConfig`, `src/index.ts`). `plugins` is
consumer code and therefore exists only here, never on the JSON model
(**C24**). `allow` widens the dev server's filesystem sandbox and is the only
thing that may (**C20**). `styles` and `publicDir` are filesystem references
resolved against the repository root, not strings carried in a payload.

**Build-time data declaration** (`LandingPageDataSource`,
`LandingPageDataSources`, `LandingPageDataConfig`, `src/index.ts`). `validate`
is required, not optional: `T` is the consumer's claim about JSON the package
never authored, and an unchecked cast would make the type a lie the package
cannot support. The package owns resolution and validation timing and nothing
about `T`'s shape; `T` and `config` are the consumer's.

**The JSON site model** (`LandingPageData` and its two members, `src/data.ts`).
Covered as a persisted schema below.

**Internal types with no export.** `GenericOptions`
([`src/generic.ts`](../src/generic.ts)) is the generic shell's resolved input
and is not public — a consumer reaches it only through CLI flags. `SiteStyle`
([`src/adapter.ts`](../src/adapter.ts)) pairs a stylesheet's bytes with the href
that will address them, and exists so the bytes are read once, before anything
is written (**C16**), and answered from memory on the dev server (**C18**).
`BuildFlags` ([`src/cli.ts`](../src/cli.ts)) is one parameter rather than three
because a parameter default fires on an explicit `undefined` too: suppressing a
flag positionally would silently restore it (**C28**).

## Persisted schemas

**The JSON site model.** `LandingPageData` — declared in
[`src/data.ts`](../src/data.ts), validated by `validateLandingPageData` in the
same file — is a document the package reads and never writes. It is strict and
versioned: `version: 1`, exactly one `kind` of `"generic"` or `"adapter"`, and
unknown fields are rejected rather than ignored (**C30**). Strictness is the
migration mechanism: a field a future version adds is an error under this one,
so a consumer learns at build time that its model outruns its package rather
than watching the field be silently dropped.

_Migration story: none, deliberately._ There is one version and no reader for
any other; an unsupported `version` ends the build. This is a constraint rather
than an absence — the model is fetched, possibly over HTTP, and a package that
silently accepted a version it did not understand would be the quiet staleness
this design exists to refuse.

**The public source map.** Owned by `subzerodev-data-json`, not by this package,
which reads it through `readSourceMap` and never parses YAML or fetches JSON
itself. Two constraints this package adds on top, because the map is public:
no entry may declare headers, and no entry may be a runtime file source
(**C14**). _Migration story: none — the map's schema is that package's._

**Built output.** The written tree is a persisted artifact with a layout
consumers address by URL: `index.html` at the site root, one
`<path>/index.html` per route path, generic assets under `assets/`
(`szd-base.css`, `theme.css`, copied Markdown references under
`assets/source/`), and site-wide stylesheets under `assets/styles/`. Layout is
identical across route forms because one writer produces both (**C27**,
[`src/adapter.ts`](../src/adapter.ts) `buildAdapterConfig`). _Migration story:
`build` clears `outDir` before writing, so there is no stale-file merge to
reason about; the accepted cost is that a build failing after the clear leaves
`preview` nothing to serve (`90-decisions.md`, 2026-08-19)._

**The emitted source-map element.** `<script type="application/json"
id="szd-json-sources">` is part of the public DOM contract: the id, the type,
and its position immediately before the route module script. It carries the
prefetched map — build-time entries hold their resolved payload, not the path
or URL the public map declared — which is why it exists only in built output
(**C10**). A consumer entry that reads it must tolerate its absence, the same
tolerance a body or generic route already requires.

**The generic DOM and CSS surface.** Selectors and custom properties emitted by
[`src/baseCss.ts`](../src/baseCss.ts) and
[`src/generic.ts`](../src/generic.ts). All owned classes begin `szd-` and all
owned tokens begin `--szd-` (**C31**). _Migration story: none during `0.x`,
where consumers pin exact versions; a later `1.0.0` moves breaking DOM or CSS
changes to semver majors._

## Public surface

### npm package

Declared by [`package.json`](../package.json): one `.` export resolving to
`dist/index.js`, and one `bin`. The exported names are declared in
[`src/index.ts`](../src/index.ts). Constraints the declarations cannot express:

- `defineLandingPage` validates eagerly and returns its argument unchanged. It
  is a validation seam, not a builder — a caller that bypasses it reaches the
  same checks at the write path (**C2**), which is what makes bypassing it safe
  rather than a hole.
- `defineLandingPageData`'s `sources` parameter must not acquire an "optional
  validator" overload. That would defeat the reason `validate` is required at
  all, and the resulting `T` would be a cast rather than a check.
- `validateLandingPageData` accepts `unknown` and must keep accepting it. A
  narrower parameter type would let a caller's assertion stand in for the
  validation, which is the one thing this function exists to prevent.

### CLI

Commands and flags are declared by `parseArgs` in
[`src/cli.ts`](../src/cli.ts); the human-facing description is in
[`README.md`](../README.md) § _Commands_. Six commands: `build`, `dev`,
`preview`, `check`, `generate-changelog`, `merge`. What the declaration cannot
state:

**Input resolution is a precedence, and it is additive.** A public JSON source
map outranks a TypeScript adapter module, which outranks the legacy README and
changelog files. The one inversion: an adapter that declares its own build-time
sources outranks the root model, because such an adapter is that data's
consumer rather than a competing description of the site. An adapter declaring
no sources is not selected, so a consumer holding both a map and an ordinary
adapter builds exactly what it built before the seam existed.

**`--source-map`** defaults to `site/sources.public.yml` and **`--source-id`**
to `landing-page`. An explicitly named but missing map is an error; an absent
_default_ map is not, and legacy resolution continues. That asymmetry is the
whole reason `BuildFlags` tracks whether the flag was given rather than only
its value.

**`--fallback-source-id`** has no default, and must not acquire one. It opts
into replacing a failed root model, and only where the root is the single
source that failed (**C12**) — a failure elsewhere says nothing about whether
the root is trustworthy.

**`--base-path`** normalises to a leading and trailing `/`, defaulting to `/`.
It prefixes the generic shell's own self-links and stylesheet hrefs so a site
deployed under a project subpath addresses its own documents; it does not reach
the custom-adapter forms, whose entry paths are `/`-relative to the site root
Vite is given.

**`preview` reads past `--adapter` and `--source-map`.** Every other input flag
it forwards, so `preview` and `build` given the same flags describe the same
site. Mode is resolved once, inside the `build` it runs, and never a second time
here: the command holds no precedence ladder of its own, so it cannot disagree
with `build` about which mode a site is in (**C28**).

**`merge`** copies a built site into a documentation deployment tree.
`--landing-dist`, `--docs-output` (default `artifacts/docs`) and
`--protected-path` (default `docs`) govern it. It refuses a landing build with
no `index.html`, a target with no protected subtree, and a landing build that
itself contains the protected path — but the guarantee it actually rests on is
the fingerprint (**C25**), not that refusal, because a path check can only
refuse what it thought to look for.

**`generate-changelog`** writes one entry per merged pull request, newest first,
from first-parent Git history, inferring the repository from `origin` unless
`--repository` names it. `--check` compares instead of writing and normalises
CRLF before comparing, so the check passes on a Windows checkout.

### GitHub delivery

[`action.yml`](../action.yml) is a composite action taking `command`,
`docs-output` and `package-version`.
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) is
a `workflow_call` workflow taking `docs-artifact` and `package-version` and
returning `page_url`. It declares no trigger and no concurrency: those stay the
caller's, which is what makes one workflow serve repositories with different
deployment policies.

### Cross-module surface

Not published to npm, but crossing a module boundary within the package, so a
change to one is a change to a contract another module depends on:

| Module                                          | Surface                                                                                                       | The constraint that is not in the signature                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/route.ts`](../src/route.ts)               | `assertRoutePath`, `assertRoute`, `assertUniquePaths`, `isBodyRoute`                                          | Every caller that can reach the write path must call these; the write path calls them again regardless (**C1**–**C4**)                                             |
| [`src/adapter.ts`](../src/adapter.ts)           | `html`, `buildAdapterConfig`, `buildAdapter`, `devAdapter`, `hasAdapter`, `loadAdapterExport`, `isDataBacked` | `html` is exported for direct testing, not for consumers. `buildAdapterConfig` is the single document writer both route forms and every input mode reach (**C27**) |
| [`src/generic.ts`](../src/generic.ts)           | `buildGeneric`, `buildGenericData`, `GenericOptions`                                                          | Two entry points, one `documentHtml` — the legacy and JSON generic forms may not drift on markup                                                                   |
| [`src/staticServer.ts`](../src/staticServer.ts) | `createStaticServer`                                                                                          | One implementation serves `preview` and generic `dev`; a second copy is what would let them diverge on resolution, containment or content type                     |
| [`src/data.ts`](../src/data.ts)                 | `validateLandingPageData`                                                                                     | Rejects unknown fields; every rejection branch carries a negative test                                                                                             |
| [`src/paths.ts`](../src/paths.ts)               | `resolveFrom`, `isWithin`, `assertWithin`                                                                     | `assertWithin` resolves symlinks through `realpath` before comparing; `isWithin` does not, and is not a containment check on its own                               |
| [`src/merge.ts`](../src/merge.ts)               | `mergeLanding`                                                                                                | Fingerprints before and after rather than trusting the copy (**C25**)                                                                                              |
| [`src/git.ts`](../src/git.ts)                   | `git`, `inferRepository`, `repositoryFromRemote`                                                              | `git` collapses every failure into one message naming the remedy; callers that can proceed without history catch it                                                |
| [`src/changelog.ts`](../src/changelog.ts)       | `generateChangelog`                                                                                           | Escapes `\`, `[` and `]` in subjects so a commit message cannot forge a Markdown link                                                                              |
| [`src/baseCss.ts`](../src/baseCss.ts)           | `baseCss`                                                                                                     | The `szd-` prefixes here are the semver-governed surface (**C31**)                                                                                                 |

## Error semantics

Every failure in this package is a thrown `Error` carrying a message written for
the person who declared the input, and — where a cause exists — the original as
`cause`. There is no enumerated error type and no error code; the only coded
errors handled here are `JsonError` from `subzerodev-data-json`, which
`prefetchWithFallback` and `withDataBackedConfig` discriminate on
`code === "build.failed"`. **This diverges from what an interface contract
should specify, and is recorded as a divergence rather than reconciled here.**

`main().catch` in [`src/cli.ts`](../src/cli.ts) prints `error.message` and sets
exit code 1. Nothing prints a stack trace, and nothing exits non-zero without a
message.

**Nothing raised by this package is retryable by the caller.** Every condition
below is a declaration or an environment that must change first; a retry of the
same command against the same inputs produces the same failure. The one
apparent exception is not one: a network source that failed transiently is
retried by re-running the build, but the package neither retries internally nor
reports the failure as transient, because it cannot tell the difference between
a flaky host and a wrong URL.

| Module            | Raised when                                                                                                                                                                                                                                                                                                              | Caller does                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `route.ts`        | A route path is not a directory path, holds an invalid segment, declares neither or both route forms, misplaces `stylesheet`, carries `</style`, or duplicates a path                                                                                                                                                    | Corrects the route declaration                                                    |
| `data.ts`         | The model is not an object, `version` is not `1`, `kind` is neither member, a field is unknown, a value has the wrong type, or a body route declares `dataSourceIds`                                                                                                                                                     | Corrects the JSON model                                                           |
| `adapter.ts`      | The adapter has no usable default export; a data-backed adapter is loaded with no map; a route names an unknown or runtime-file source; a stylesheet is unreadable or escapes the root; a plugin redirects `outDir`, widens `fs.allow`, or disables `fs.strict`                                                          | Corrects the adapter, the map, or the plugin                                      |
| `cli.ts`          | A named source map is missing; a source id is undeclared; the root or fallback source is not `at: build`; a public entry declares headers or a runtime file source; the root payload fails validation; declared adapter sources fail                                                                                     | Corrects the flag, the map, or the payload                                        |
| `generic.ts`      | README or CHANGELOG is absent; the home Markdown has other than exactly one level-one heading; no prose paragraph yields a description; a local Markdown link is broken; a local asset is missing or escapes the root                                                                                                    | Corrects the Markdown or passes `--title` / `--description`                       |
| `git.ts`          | `git` is unavailable or the command fails                                                                                                                                                                                                                                                                                | Supplies a full checkout, or `--repository`; `buildGeneric` catches and continues |
| `changelog.ts`    | No repository can be inferred from `origin`                                                                                                                                                                                                                                                                              | Passes `--repository owner/name`                                                  |
| `merge.ts`        | The landing build has no `index.html`; the target has no protected subtree; the landing build contains the protected path; the protected subtree changed                                                                                                                                                                 | Corrects the build or the deployment tree — a changed-subtree failure is a defect |
| `staticServer.ts` | Never for a request. A path outside `outDir`, an undecodable path, and a path naming no file are all a 404 with no body detail. A bind failure reaches the caller as an `'error'` event on the returned server, not a throw — `src/cli.ts` `serve` subscribes to it, because it fires after `main`'s promise has settled | Nothing; the response carries no filesystem detail by design                      |

## Invariants

Each is stated so it could become an assertion, names the module responsible,
and says whether code enforces it. Only the code-enforced ones may be trusted
without checking.

### Document integrity

- **C1** A route path starts and ends with `/`, and every segment between them
  matches `[A-Za-z0-9._-]+` and is neither `.` nor `..`. _`src/route.ts`
  `assertRoutePath`; code._ The grammar excludes `%`, so no percent-escape
  survives to decode into a separator.
- **C2** No two routes in one site declare the same path. _`src/route.ts`
  `assertUniquePaths`, called from `defineLandingPage`,
  `validateLandingPageData` and `buildAdapterConfig`; code._ The third call site
  is what makes this hold for a plain object literal that never imported the
  package.
- **C3** A route declares exactly one of `entry` and `body`. _`src/route.ts`
  `assertRoute`; code._
- **C4** `stylesheet` is declared only on a body route and never contains
  `</style` in any case. _`src/route.ts` `assertRoute`; code._ Declared on an
  entry route it is rejected, never dropped — a dropped field is a consumer
  believing a page changed when it did not.
- **C7** Every value the package interpolates into a document it owns is
  HTML-escaped. The two exceptions are named and validated elsewhere: a body
  route's `body` and its `stylesheet` (**C4**). _`src/adapter.ts` `html`,
  `src/generic.ts` `documentHtml`; code._
- **C8** Generic Markdown is sanitized, not escaped. _`src/generic.ts` `render`
  via `rehype-sanitize`; code._ Escaping it would defeat the one thing it is
  for.
- **C9** The emitted source-map payload escapes `<`, so no payload can terminate
  the script element that carries it. _`src/adapter.ts` `html`; code._
- **C27** One writer produces every document, for both route forms and every
  input mode, so output layout, public-asset staging and static head cannot
  drift apart by route form. _`src/adapter.ts` `buildAdapterConfig`;
  structurally._ **C1**, **C2** and **C7** are enforced there rather than at
  each caller that reaches it.
- **C31** Every owned generic selector begins `szd-` and every owned token
  begins `--szd-`. _`src/baseCss.ts`; code, via
  [`test/css-contract.test.ts`](../test/css-contract.test.ts)._

### Filesystem containment

- **C5** No entry document is written outside the generated entry directory.
  _`src/adapter.ts` `buildAdapterConfig`; code._ Redundant with **C1** by
  construction, and kept so a future path form that escapes the grammar refuses
  to write rather than writing somewhere unexpected.
- **C6** No request served by the static server resolves outside `outDir`. A
  path that would is a 404, identical to a path naming no file, and neither
  carries filesystem detail. _`src/staticServer.ts` `resolveWithinRoot`; code._
  The pathname is cut from the request target at the first `?` or `#` and
  percent-decoded exactly once.
- **C16** A declared site-wide stylesheet that cannot be read, or that resolves
  outside the repository root, ends the build with no output written. _Every
  stylesheet is read by `src/adapter.ts` `readStyles` before anything is
  written; code._ A site that builds and serves unstyled is the silent failure
  the declared-source rules exist to prevent.
- **C25** The `merge` command changes no file under the protected path. The
  subtree is fingerprinted per file with SHA-256 before and after the copy and
  any difference ends the command. _`src/merge.ts`; code._ Fingerprinting rather
  than trusting the landing build not to contain a colliding path.

### Input resolution and failure

- **C12** A declared source that cannot be read or validated ends the build. The
  single recovery is `--fallback-source-id`, which replaces the root model only
  where the root is the one source that failed. _`src/cli.ts`
  `prefetchWithFallback`; code._ Silence is the failure mode being avoided:
  nobody watches a static site the way a maintainer watches an app.
- **C13** A substitution is announced on stderr, naming the failed source, its
  reason and the fallback used. It is never silent. _`src/cli.ts`; code._
- **C14** No public source-map entry declares headers, and none is a runtime
  file source. _`src/cli.ts` `validatePublicSources`; code._
- **C15** Every source a data-backed adapter declares exists in the map and
  declares `at: build`; each resolves through its own validator; failures are
  collected and reported in declaration order, each naming the adapter key and
  source id; any failure ends the build before `config` runs. _`src/cli.ts`
  `withDataBackedConfig`; code._ Declaration order rather than failure class,
  because grouping would order the list by something the consumer never wrote.
- **C28** Mode is resolved exactly once per invocation, inside `build`.
  _`src/cli.ts`; structurally — `preview` passes `BuildFlags` omitting the two
  mode flags rather than re-resolving._
- **C30** A JSON site model is `version: 1` with exactly one `kind`, and unknown
  fields are rejected. _`src/data.ts`; code._

### Runtime data

- **C10** `#szd-json-sources` is emitted only on an entry route that declared
  `dataSourceIds`, and only in built output. Generic routes, body routes and the
  dev server emit none. _`src/adapter.ts` `filteredMap`, `src/cli.ts`
  `resolveDataBackedConfig`; code._ The map emitted is the prefetched one, so
  nothing that has not built has a faithful map to emit — a dev-server map would
  send a consumer's loader down a path production never takes.
- **C11** The package emits runtime source declarations inertly and never loads
  one. The consumer's entry owns parsing the element and constructing any
  loader. _Whole package; enforced by absence — no runtime fetch exists._

### Consumer build steps

- **C17** Site-wide stylesheet links are emitted on every custom-adapter route,
  entry and body alike, in declaration order, and precede a body route's own
  `stylesheet`, which the head places last. _`src/adapter.ts` `html`; code._ A
  route's own CSS overrides site-wide rules and never the reverse. No route opts
  out and no route adds one of its own.
- **C18** The dev server links and answers every declared site-wide stylesheet,
  from the bytes `readStyles` already read and contained — so a stylesheet
  declared outside the site root reaches the browser without widening
  `server.fs.allow`. _`src/adapter.ts` `devAdapter` middleware; code._
- **C19** `configFile: false` is unconditional. A consumer plugin may not
  reintroduce a Vite configuration file, which is the duplication the adapter
  exists to remove. _`src/adapter.ts`; code._
- **C20** `server.fs.allow` is exactly the site root plus the resolved `allow`
  entries, and `server.fs.strict` stays on. Both are checked over the merged
  configuration and again against the resolved server, because the resolved
  configuration is never frozen. _`src/adapter.ts` `fsAllowGuardPlugin`; code._
  Widening the list and disabling the flag that gives it force are one attempt
  wearing two faces.
- **C21** `build.outDir` stays exactly the directory the adapter was called
  with. _`src/adapter.ts` `buildOutDirGuardPlugin`; code._ The step that lifts
  generated entry documents into place trusts `outDir` unconditionally.
- **C22** The package's route middleware registers ahead of Vite's built-in
  middlewares; consumer plugins follow the package's own, in declaration order.
  _`src/adapter.ts` `devAdapter`; code._
- **C23** Where a site declares plugins, the static-head, route-path and
  output-layout guarantees no longer hold: a plugin can rewrite emitted HTML and
  asset URLs, and its output is the consumer's. _**Instruction only — no code
  enforces this.**_ Plugins reach both `build` and `dev` as one list, so
  declaring them affects the shipped artifact and not only the dev experience.
- **C24** `AdapterLandingPageData` carries no `plugins` field. _`src/data.ts`
  `keys`; code._ A plugin is code and the JSON model is data the package may
  fetch over HTTP; a fetched document must never name something the builder then
  executes. The asymmetry with `styles` is deliberate.

### Delivery

- **C26** Every 200 from the static server carries a `Content-Type` derived from
  the file extension, and an unmapped extension still carries one.
  _`src/staticServer.ts`; code._ Not cosmetic: a module script served without a
  JavaScript type does not execute, so the built site would fail in the one
  command written to inspect it.
- **C29** Generic self-links and stylesheet hrefs are prefixed with the
  normalised `--base-path`, which defaults to `/`. _`src/generic.ts`
  `normalizeBasePath`, `documentHtml`; code._
- **C32** `preview` builds before serving, and serves the `outDir` that build
  produced. There is no `--no-build` escape and no absent-`outDir` error.
  _`src/cli.ts`; structurally._ The accepted cost is that a build failing after
  `outDir` is cleared leaves nothing to serve.

## Unresolved

None.
