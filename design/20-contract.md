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

Every invariant closes with how it is held, and the four are not
interchangeable:

- _code_ — a check runs and refuses. Trustworthy without reading the tree.
- _structurally_ — no check runs; the arrangement of the modules leaves no
  other outcome. Trustworthy until someone rearranges them.
- _instruction only_ — nothing enforces it. A reader must verify it themselves.
- _decided, not yet in the tree_ — [`10-design.md`](10-design.md) specifies it
  and [`90-decisions.md`](90-decisions.md) records the choice, but no slice has
  landed it. **The tree currently does something else, and this document says
  which.** These are the statements a slice implements against, not statements
  about today's behaviour.

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
reason the optional fields are optional rather than defaulted. Absence is the
meaningful state here, and it is the only entity where that is true. Two fields
were withdrawn deliberately and must not return by accident: `hydrate` on an
entry route and `repositoryUrl` on metadata, both of which validated without
ever changing a generated page (`90-decisions.md`, 2026-08-15).

**Route forms** (`LandingPageEntryRoute`, `LandingPageBodyRoute`,
`LandingPageRoute`, `src/index.ts`). The union is discriminated structurally, by
which of `entry` and `body` is a string, not by a tag field — so a plain object
literal that never imported this package is classified exactly as one built by
`defineLandingPage`. The accepted cost of that choice is that "neither form" and
"both forms" are both representable, so they are rejected at validation
(**C3**) rather than being unrepresentable. `stylesheet` is meaningful only on
the body form; on the entry form it is an error rather than an ignored field
(**C4**).

**Site configuration** (`LandingPageConfig`, `src/index.ts`). Exactly one exists
per invocation. It is never named, never addressed and never persisted, so it
has no identity and needs none — the consumer owns every value in it and the
package owns only whether the value is admissible. `plugins` is consumer code
and therefore exists only here, never on the JSON model (**C24**). `allow`
widens the dev server's filesystem sandbox and is the only thing that may
(**C20**). `styles` and `publicDir` are filesystem references resolved against
the repository root, not strings carried in a payload.

**Build-time data declaration** (`LandingPageDataSource`,
`LandingPageDataSources`, `LandingPageDataConfig`, `src/index.ts`). `validate`
is required, not optional: `T` is the consumer's claim about JSON the package
never authored, and an unchecked cast would make the type a lie the package
cannot support. Ownership is split down one line — the package owns resolution,
validation timing and failure reporting; `T`, `config` and the validator that
earns the type are the consumer's.

**The JSON site model** (`LandingPageData` and its two members, `src/data.ts`).
Covered as a persisted schema below.

**Types exported by a module but not by the package.** `GenericOptions`
([`src/generic.ts`](../src/generic.ts)) is the generic shell's resolved input.
It is exported — `src/cli.ts` imports it — but `src/index.ts` does not re-export
it, so it is not on the npm surface and a consumer reaches it only through CLI
flags.

**Types with no export at all.** `SiteStyle`
([`src/adapter.ts`](../src/adapter.ts)) pairs a stylesheet's bytes with the href
that will address them. It exists as an entity because of ordering: the pairing
is what lets every stylesheet be read and contained before anything is written
(**C16**), and what lets the dev server answer the emitted href from memory
instead of widening its filesystem sandbox (**C18**). `BuildFlags`
([`src/cli.ts`](../src/cli.ts)) is one parameter rather than three because a
parameter default fires on an explicit `undefined` too: suppressing a flag
positionally would silently restore it (**C28**).

**Entities with no type declaration anywhere.** The prefetched runtime map is
`SourceMap` from `subzerodev-data-json`, structurally identical to the public
map and semantically not the same thing — resolution replaces every build-time
entry with its resolved payload inline and passes runtime entries through
untouched. It cannot exist before resolution has run, and it is the map that
reaches a document (**C10**), because handing a consumer's loader a path in one
environment and an inline payload in another is a difference that consumer's
code would have to know about. The built output tree has no type at all and is
constrained by the persisted-schema section below.

## Persisted schemas

Nothing here is a database. The package reads three things it does not author —
the JSON site model, the public source map, and the consumer's Markdown — and
writes one thing it owns outright, the built output tree.

**The JSON site model.** `LandingPageData` — declared in
[`src/data.ts`](../src/data.ts), validated by `validateLandingPageData` in the
same file — is a document the package reads and never writes. It is strict and
versioned: `version: 1`, exactly one `kind` of `"generic"` or `"adapter"`, and
unknown fields are rejected rather than ignored (**C30**). Strictness is the
migration mechanism, not fussiness: the model may arrive over HTTP from a
publisher on its own release cadence, so a field this version does not know must
be an error rather than a silent drop — otherwise a consumer learns its model
outran its package by noticing a missing section on a live page.

_Migration story: none, deliberately._ There is one version and no reader for
any other; an unsupported `version` ends the build. This is a constraint rather
than an absence — a package that silently accepted a version it did not
understand would be the quiet staleness this design exists to refuse.

**The public source map.** Owned by `subzerodev-data-json`, not by this package,
which reads it through `readSourceMap` and parses no YAML and fetches no JSON
itself. Its identity is a path plus per-entry ids. Two constraints exist here
and not in the owning package, both because _public_ is a property of this map
and not of maps in general: no entry may declare headers, and no entry may be a
runtime file source (**C14**). _Migration story: none — the map's schema is that
package's._

**Built output.** The written tree is a persisted artifact with a layout
consumers address by URL, and the only thing this package writes that outlives
the process: `index.html` at the site root, one `<path>/index.html` per route
path, generic assets under `assets/` (`szd-base.css`, `theme.css`, copied
Markdown references under `assets/source/`), and site-wide stylesheets under
`assets/styles/`. Layout is identical across route forms because one writer
produces every custom-adapter document (**C27**,
[`src/adapter.ts`](../src/adapter.ts) `buildAdapterConfig`). _Migration story:
replace, not merge. `build` clears `outDir` before writing, so there is no
stale-file merge to reason about; the accepted cost is that a build failing
after the clear leaves `preview` nothing to serve (`90-decisions.md`,
2026-08-19)._

**The emitted source-map element.** `<script type="application/json"
id="szd-json-sources">` is part of the public DOM contract: the id, the type,
and its position immediately before the route module script. It carries the
prefetched map — build-time entries hold their resolved payload, not the path or
URL the public map declared — which is why it exists only where a prefetch has
run (**C10**). A consumer entry that reads it must tolerate its absence, the
same tolerance a body or generic route already requires.

**The generic DOM and CSS surface.** Emitted by
[`src/baseCss.ts`](../src/baseCss.ts) and
[`src/generic.ts`](../src/generic.ts). The semver-governed names are **classes
and custom properties**: every owned class begins `szd-` and every owned custom
property begins `--szd-` (**C31**). Two things inside the same markup are
deliberately outside that rule and must not be read as covered by it: the bare
element selectors `baseCss` sets (`:root`, `*`, `body`, `a`, `a:focus-visible`),
which own no name to prefix; and the `id="content"` the skip link targets, which
is emitted DOM the prefix rule does not govern. _Migration story: none during
`0.x`, where consumers pin exact versions; a later `1.0.0` moves breaking DOM or
CSS changes to semver majors._

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
sources outranks the root model, because such an adapter is that data's consumer
rather than a competing description of the site. An adapter declaring no sources
is not selected, so a consumer holding both a map and an ordinary adapter builds
exactly what it built before the seam existed. The ladder lives in one module
and one function; a second command growing its own is a structural regression
rather than a duplication of a few lines (**C28**).

**`--source-map`** defaults to `site/sources.public.yml` and **`--source-id`**
to `landing-page`. An explicitly named but missing map is an error; an absent
_default_ map is not, and legacy resolution continues. That asymmetry is the
whole reason `BuildFlags` tracks whether the flag was given rather than only its
value.

**`--fallback-source-id`** has no default, and must not acquire one. It opts
into replacing a failed root model, and only where the root is the single source
that failed (**C12**) — a failure elsewhere says nothing about whether the root
is trustworthy.

**`--base-path`** normalises to a leading and trailing `/`, defaulting to `/`.
It prefixes the generic shell's own self-links and stylesheet hrefs so a site
deployed under a project subpath addresses its own documents; it does not reach
the custom-adapter forms, whose entry paths are `/`-relative to the site root
Vite is given. It is a deployment flag rather than a content one, which is why
it is a flag and not a field on the JSON model: the same model deployed at a
domain root and under a project subpath needs two different prefixes and is one
document. _Decided, not yet in the tree_ (`90-decisions.md`, 2026-08-19): today
the flag reaches only the legacy generic form (**C29**).

**`dev` selects the site through the same ladder, then branches on family.** The
ladder decides _which_ site; the site's family decides which server — an
adapter-family site is served by the Vite dev server however it was selected, a
generic-family site is built and served statically. _Decided, not yet in the
tree_ (`90-decisions.md`, 2026-08-19): today `dev` tests for an adapter file
first and never reads the map when a plain adapter is present, so a repository
holding both serves one site locally and ships another.

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
refuse a collision someone thought to look for.

**`generate-changelog`** derives entries from first-parent Git history, newest
first, inferring the repository from `origin` unless `--repository` names it.
Three behaviours the declaration cannot carry: an entry is emitted per
first-parent commit, and becomes a pull-request link only where the subject ends
in `(#<digits>)`; a subject matching `update changelog` is dropped, so the
command's own commits do not accumulate in its output; and `--check` compares
instead of writing, normalising CRLF before comparing so the check passes on a
Windows checkout.

### GitHub delivery

[`action.yml`](../action.yml) is a composite action taking `command`,
`docs-output` and `package-version`.
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) is
a `workflow_call` workflow taking `docs-artifact` and `package-version` and
returning `page_url`. It declares no trigger and no concurrency: those stay the
caller's, which is what makes one workflow serve repositories with different
deployment policies. Its `deploy` job's `permissions` and its `github-pages`
`environment` are **not** caller-provided and cannot become so — `workflow_call`
exposes only `inputs` and `secrets`, so a caller has no mechanism to supply
either, and `actions/deploy-pages` requires the environment
(`90-decisions.md`, 2026-08-19).

### Cross-module surface

Not published to npm, but crossing a module boundary within the package, so a
change to one is a change to a contract another module depends on. The
dependency graph and each module's ownership are
[`10-design.md`](10-design.md) § _Module boundaries_; what is here is only the
constraint each surface carries beyond its signature.

| Module                                          | Surface                                                                                                       | The constraint that is not in the signature                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/route.ts`](../src/route.ts)               | `assertRoutePath`, `assertRoute`, `assertUniquePaths`, `isBodyRoute`                                          | Every caller that can reach the write path must call these; the write path calls them again regardless (**C1**–**C4**)                                                                                                          |
| [`src/adapter.ts`](../src/adapter.ts)           | `html`, `buildAdapterConfig`, `buildAdapter`, `devAdapter`, `hasAdapter`, `loadAdapterExport`, `isDataBacked` | `html` is exported for direct testing, not for consumers. `buildAdapterConfig` is the single document writer every custom-adapter route form and input mode reaches (**C27**)                                                   |
| [`src/generic.ts`](../src/generic.ts)           | `buildGeneric`, `buildGenericData`, `GenericOptions`                                                          | Two entry points, one `documentHtml` — the legacy and JSON generic forms may not drift on markup (**C27**). Each entry point still composes the `GenericOptions` it feeds in, which is where they do currently differ (**C29**) |
| [`src/staticServer.ts`](../src/staticServer.ts) | `createStaticServer`                                                                                          | One implementation serves `preview` and generic `dev`; a second copy is what would let them diverge on resolution, containment or content type                                                                                  |
| [`src/data.ts`](../src/data.ts)                 | `validateLandingPageData`, and the model types `src/index.ts` re-exports                                      | Rejects unknown fields; every rejection branch carries a negative test                                                                                                                                                          |
| [`src/paths.ts`](../src/paths.ts)               | `resolveFrom`, `isWithin`, `assertWithin`                                                                     | **Crosses no boundary today: no module and no test imports it.** It is the designated owner of containment and is not yet wired up (**C33**). `isWithin` does not resolve symlinks and is not a containment check on its own    |
| [`src/merge.ts`](../src/merge.ts)               | `mergeLanding`                                                                                                | Fingerprints before and after rather than trusting the copy (**C25**)                                                                                                                                                           |
| [`src/git.ts`](../src/git.ts)                   | `git`, `inferRepository`, `repositoryFromRemote`                                                              | `git` collapses every failure into one message naming the remedy; callers that can proceed without history catch it                                                                                                             |
| [`src/changelog.ts`](../src/changelog.ts)       | `generateChangelog`                                                                                           | Escapes `\`, `[` and `]` in subjects so a commit message cannot forge a Markdown link                                                                                                                                           |
| [`src/baseCss.ts`](../src/baseCss.ts)           | `baseCss`                                                                                                     | The `szd-` prefixes here are the semver-governed surface (**C31**)                                                                                                                                                              |

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
same command against the same inputs produces the same failure. The one apparent
exception is not one: a network source that failed transiently is retried by
re-running the build, but the package neither retries internally nor reports the
failure as transient, because it cannot tell the difference between a flaky host
and a wrong URL.

| Module            | Raised when                                                                                                                                                                                                                                                                                                              | Caller does                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `index.ts`        | A `LandingPageConfig` declares no routes; a `LandingPageDataConfig` declares no sources, or a source is missing a string `id` or a `validate` function                                                                                                                                                                   | Corrects the adapter module's declaration                                                 |
| `route.ts`        | A route path is not a directory path, holds an invalid segment, declares neither or both route forms, misplaces `stylesheet`, carries `</style`, or duplicates a path                                                                                                                                                    | Corrects the route declaration                                                            |
| `data.ts`         | The model is not an object, `version` is not `1`, `kind` is neither member, a field is unknown, a value has the wrong type, or a body route declares `dataSourceIds`                                                                                                                                                     | Corrects the JSON model                                                                   |
| `adapter.ts`      | The adapter has no usable default export; a data-backed adapter is loaded with no map; a route names an unknown or runtime-file source; a stylesheet is unreadable or escapes the root; a plugin redirects `outDir`, widens `fs.allow`, or disables `fs.strict`                                                          | Corrects the adapter, the map, or the plugin                                              |
| `cli.ts`          | A named source map is missing; a source id is undeclared; the root or fallback source is not `at: build`; a public entry declares headers or a runtime file source; the root payload fails validation; declared adapter sources fail                                                                                     | Corrects the flag, the map, or the payload                                                |
| `generic.ts`      | README or CHANGELOG is absent; the home Markdown has other than exactly one level-one heading; no prose paragraph yields a description; a local Markdown link is broken; a local asset is missing or escapes the root                                                                                                    | Corrects the Markdown or passes `--title` / `--description`                               |
| `git.ts`          | `git` is unavailable or the command fails                                                                                                                                                                                                                                                                                | Supplies a full checkout, or `--repository`; both generic entry points catch and continue |
| `changelog.ts`    | No repository can be inferred from `origin`                                                                                                                                                                                                                                                                              | Passes `--repository owner/name`                                                          |
| `merge.ts`        | The landing build has no `index.html`; the target has no protected subtree; the landing build contains the protected path; the protected subtree changed                                                                                                                                                                 | Corrects the build or the deployment tree — a changed-subtree failure is a defect         |
| `staticServer.ts` | Never for a request. A path outside `outDir`, an undecodable path, and a path naming no file are all a 404 with no body detail. A bind failure reaches the caller as an `'error'` event on the returned server, not a throw — `src/cli.ts` `serve` subscribes to it, because it fires after `main`'s promise has settled | Nothing; the response carries no filesystem detail by design                              |
| `paths.ts`        | `assertWithin` throws where the candidate resolves outside the parent, both resolved through `realpath` first. **No caller reaches it today** (**C33**)                                                                                                                                                                  | Corrects the declared path                                                                |

## Invariants

Each is stated so it could become an assertion, names the module responsible,
and closes with how it is held, in the four senses defined at the top of this
document. Only the code-enforced ones may be trusted without checking.

### Document integrity

- **C1** A route path starts and ends with `/`, and every segment between them
  matches `[A-Za-z0-9._-]+` and is neither `.` nor `..`. _`src/route.ts`
  `assertRoutePath`; code._ The grammar excludes `%`, so no percent-escape
  survives to decode into a separator. The grammar is a filesystem question
  rather than a URL question because the document's output directory is derived
  from the path and from nothing else.
- **C2** No two routes in one site declare the same path. _`src/route.ts`
  `assertUniquePaths`, called from `defineLandingPage`, `validateLandingPageData`
  and `buildAdapterConfig`; code._ The third call site is what makes this hold
  for a plain object literal that never imported the package.
- **C3** A route declares exactly one of `entry` and `body`. _`src/route.ts`
  `assertRoute`; code._ Structural discrimination makes "neither" and "both"
  representable, so this is where they are refused.
- **C4** `stylesheet` is declared only on a body route and never contains
  `</style` in any case. _`src/route.ts` `assertRoute`; code._ Declared on an
  entry route it is rejected, never dropped — a dropped field is a consumer
  believing a page changed when it did not.
- **C7** Every value the package interpolates into a document it owns is
  HTML-escaped, and each exception is named and made safe elsewhere rather than
  left to a reader to notice. At the adapter writer the exceptions are a body
  route's `body` and its `stylesheet`, validated by **C4**, and the source-map
  payload, escaped for the carrier that holds it by **C9**. At the generic
  writer the single exception is rendered Markdown, sanitized by **C8**. There
  is no fourth. _`src/adapter.ts` `html`, `src/generic.ts` `documentHtml`;
  code._
- **C8** Generic Markdown is sanitized, not escaped. _`src/generic.ts` `render`
  via `rehype-sanitize`; code._ Escaping it would defeat the one thing it is
  for.
- **C9** The emitted source-map payload escapes `<`, so no payload can terminate
  the script element that carries it. _`src/adapter.ts` `html`; code._
- **C27** There are exactly two document writers, one per site family, and a
  third is the regression. Every custom-adapter route form and input mode
  converges on `src/adapter.ts` `buildAdapterConfig`, so output layout,
  public-asset staging and static head cannot drift apart by route form; both
  generic forms converge on `src/generic.ts` `documentHtml`, so the legacy and
  JSON generic sites cannot drift on markup. _Structurally._ **C1**, **C2** and
  **C7** are enforced at the adapter writer rather than at each caller that
  reaches it. The two families are not merged because a generic document emits
  no script and reaches no bundler, so a shared writer would be a switch rather
  than a convergence.
- **C31** Every owned generic class begins `szd-` and every owned custom
  property begins `--szd-`. _`src/baseCss.ts`, `src/generic.ts`; instruction
  only, with a partial code check._
  [`test/css-contract.test.ts`](../test/css-contract.test.ts) asserts that
  `baseCss` contains each documented token and class, so it catches a **removal
  or rename** of a governed name. Nothing catches an **addition** of an
  unprefixed one, which is the direction the invariant is actually about.
  Element selectors and the `#content` skip-link target are outside this rule,
  as stated under _Persisted schemas_.

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
  than trusting the landing build not to contain a colliding path: a path check
  refuses only the collisions someone predicted, a digest refuses all of them.
  The guarantee is **detection, not rollback** — a failure leaves a partially
  merged tree.
- **C33** Every check that a declared path stays inside its root routes through
  [`src/paths.ts`](../src/paths.ts) `assertWithin`, which resolves both sides
  through `realpath` before comparing. _`src/paths.ts`; **decided, not yet in
  the tree** (`90-decisions.md`, 2026-08-19)._ Today the module is imported by
  nothing and three modules each implement their own check, and not the same
  check: `src/generic.ts` tests only for a leading `../` on the asset path,
  `src/adapter.ts` `readStyles` additionally rejects an exact `..` and an
  absolute result, and `src/staticServer.ts` `resolveWithinRoot` compares
  against a resolved boundary. **None resolves symlinks**, so a symlinked
  stylesheet or asset pointing outside the root is accepted on two of the three
  paths. That the three disagree is the argument against leaving them as three.
  Routing them through one owner is a narrowing and needs a release that says
  so; `assertWithin` is also async where two of the three call sites are
  currently synchronous.

### Input resolution and failure

- **C12** A declared source that cannot be read or validated ends the run — the
  build, or `dev`'s startup — with nothing served. The single recovery is
  `--fallback-source-id`, which replaces the root model only where the root is
  the one source that failed. _`src/cli.ts` `prefetchWithFallback`,
  `withDataBackedConfig`; code for `build` and for `dev` on a data-backed
  adapter. The `dev` startup rule is **decided, not yet in the tree** for the
  path where `dev` does not consult the ladder at all
  (`90-decisions.md`, 2026-08-19)._ Silence is the failure mode being avoided:
  nobody watches a static site the way a maintainer watches an app, and starting
  degraded would make `dev` the only path in this package that continues past a
  failed declared source — the page developed against would not be the page that
  ships.
- **C13** A substitution is announced on stderr, naming the failed source, its
  reason and the fallback used. It is never silent. _`src/cli.ts`; code._
- **C14** No public source-map entry declares headers, and none is a runtime
  file source. _`src/cli.ts` `validatePublicSources`; code._ Both constraints
  belong to this package rather than to the map's owner, because _public_ is a
  property of this map and not of maps in general.
- **C15** Every source a data-backed adapter declares exists in the map and
  declares `at: build`; each resolves through its own validator; failures are
  collected and reported in declaration order, each naming the adapter key and
  source id; any failure ends the build before `config` runs. _`src/cli.ts`
  `withDataBackedConfig`; code._ Declaration order rather than failure class,
  because grouping would order the list by something the consumer never wrote.
  Consumer composition code never sees a partially resolved set.
- **C28** Mode is resolved exactly once per invocation, by the single ladder in
  `src/cli.ts` `build`. `check` and `preview` reach it by running that `build`,
  and `preview` passes `BuildFlags` omitting the two mode flags rather than
  re-resolving. _`src/cli.ts`; structurally for `build`, `check` and `preview`.
  **Decided, not yet in the tree** for `dev`, which holds its own resolution
  (`90-decisions.md`, 2026-08-19)._ A second ladder is a structural regression,
  not a duplicated few lines: it is what lets two commands disagree about which
  site a repository describes.
- **C30** A JSON site model is `version: 1` with exactly one `kind`, and unknown
  fields are rejected. _`src/data.ts`; code._

### Runtime data

- **C10** `#szd-json-sources` is emitted on an entry route that declared
  `dataSourceIds`, wherever a prefetch has produced a runtime map — built output
  on every input mode, and `dev` where it has prefetched. Generic routes and body
  routes emit none. _`src/adapter.ts` `filteredMap`, `src/cli.ts`
  `resolveDataBackedConfig`; code for built output. **Decided, not yet in the
  tree** for `dev`, which resolves the map and discards it
  (`90-decisions.md`, 2026-08-19)._ The map emitted is always the prefetched
  one, whose build entries are inline values and therefore depend on no scratch
  directory — so a consumer entry finds the same element with the same shape
  locally and in production. A map that had not been prefetched would send that
  consumer's loader down a path production never takes.
- **C11** The package emits runtime source declarations inertly and never loads
  one. The consumer's entry owns parsing the element and constructing any
  loader. _Whole package; enforced by absence — no runtime fetch exists._

### Consumer build steps

- **C17** Site-wide stylesheet links are emitted on every custom-adapter route,
  entry and body alike, in declaration order, and precede a body route's own
  `stylesheet`, which the head places last. _`src/adapter.ts` `html`; code._ A
  route's own CSS overrides site-wide rules and never the reverse. No route opts
  out and no route adds one of its own. This ordering is a public promise, not
  an internal sequence.
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
  _`src/adapter.ts` `devAdapter`; code._ Neither a route path nor a stylesheet
  href names a file on disk, so anything registered later would 404 first.
- **C23** Where a site declares plugins, the static-head, route-path and
  output-layout guarantees no longer hold: a plugin can rewrite emitted HTML and
  asset URLs, and its output is the consumer's. _**Instruction only** — nothing
  detects it._ Plugins reach both `build` and `dev` as one list, so declaring
  them affects the shipped artifact and not only the dev experience.
- **C24** `AdapterLandingPageData` carries no `plugins` field. _`src/data.ts`
  `keys`; code._ A plugin is code and the JSON model is data the package may
  fetch over HTTP; a fetched document must never name something the builder then
  executes. The asymmetry with `styles` is deliberate — it breaks the parity that
  governs every other capability, and that is the point.

### Delivery

- **C26** Every 200 from the static server carries a `Content-Type` derived from
  the file extension, and an unmapped extension still carries one.
  _`src/staticServer.ts`; code._ Not cosmetic: a module script served without a
  JavaScript type does not execute, so the built site would fail in the one
  command written to inspect it.
- **C29** Generic self-links and stylesheet hrefs are prefixed with the
  normalised `--base-path`, which defaults to `/` — on both generic forms.
  _`src/generic.ts` `normalizeBasePath`, `documentHtml`; code for the legacy
  README/CHANGELOG form. **Decided, not yet in the tree** for the JSON generic
  form (`90-decisions.md`, 2026-08-19)._ Today `buildGenericData` composes the
  options it writes from the model alone and sets no base path, and `src/cli.ts`
  hands it no flags, so a JSON-generic site emits root-absolute links whatever
  the flag says. Breaking under a project subpath is a property of the
  deployment and not of the input form that produced the site, so the two forms
  cannot correctly differ here. **C27**'s convergence does not cover this:
  sharing `documentHtml` fixes the markup, and leaves each entry point free to
  compute a different value to feed it.
- **C32** `preview` builds before serving, and serves the `outDir` that build
  produced. There is no `--no-build` escape and no absent-`outDir` error.
  _`src/cli.ts`; structurally._ The accepted cost is that a build failing after
  `outDir` is cleared leaves nothing to serve — currency was chosen over the
  guarantee that an existing build cannot be destroyed
  (`90-decisions.md`, 2026-08-19).

### Not invariants, and deliberately so

Two hazards are known, unguarded, and stated here so a reader does not assume a
protection that is absent. Neither carries an id, because an id implies
something to check.

- **Nothing serialises two invocations against the same output directory** — no
  lock, no marker, no detection. A build racing a build, or a build racing the
  server reading what it wrote, interleaves destructively. Accepted because the
  commands are run by a person or by one CI job, not scheduled.
- **Generic `dev` and `preview` share a default port** (`4173`), so running both
  is the ordinary collision. It surfaces asynchronously, after the command's
  promise has settled, which is why the bind failure is subscribed to rather
  than awaited.

## Unresolved

None.
