# Decisions

### 2026-08-19 — The reusable Pages workflow owns its permissions and environment

Context: `/contract` compared `AGENTS.md` § _Project identity_ against the tree
and found the line "callers provide permissions, triggers, concurrency, and
environments" false of two of its four items. `.github/workflows/deploy-pages.yml`
declares neither a trigger nor concurrency, so those halves hold; its `deploy`
job declares both `permissions` and `environment: github-pages`. The environment
half is not a choice the workflow made — `workflow_call` exposes only `inputs`
and `secrets`, so no caller has a mechanism to supply a called job's environment,
and `actions/deploy-pages` requires one.

Chosen: narrow the identity line to triggers and concurrency, and state that the
deploy job's permissions and environment are the workflow's own, with the reason.
The document was the side that was wrong.

Rejected: dropping `permissions` from the called job so it inherits the caller's
— it only closes half the gap, since `environment` cannot move regardless, and it
breaks every existing caller that does not already declare `pages: write` and
`id-token: write`. Rejected: leaving both and filing an issue — the misleading
line sits in the binding agent contract meanwhile, and the answer was not in
doubt. Rejected: reading "callers provide" as policy-in-spirit — an identity
statement that cannot be checked against the tree is the kind that rots.

Reversibility: cheap — one paragraph in `AGENTS.md`.

### 2026-08-19 — The dev server owes the built document's stylesheet links, but not its source map

Context: `/reconcile` found two contract statements true of `build` and false of
the adapter dev server. Site-wide `styles` are stated over "every custom-adapter
route, entry and body alike"; `szd-json-sources` over "every entry route with
`dataSourceIds`". The dev middleware passed neither to the document generator, so
one config produced a styled page with a source map under `build` and an
unstyled page with none under `dev`. Both had been missed across UI5, UI7 and
UI8 — UI8.3 names site-wide stylesheet links explicitly and still only checked
built output.
Chosen: fix the stylesheets, scope the source map. The two look symmetrical and
are not. A stylesheet is a file the package has already read into memory and
already contained, so the dev server answers the emitted href from those bytes —
no sandbox change, no new field, no resolution step. The emitted source map is
the _prefetched_ map, whose build-time entries carry resolved payloads inline
rather than the declared path or URL, so a faithful one cannot exist before a
build has run; emitting the public map instead would hand a consumer's loader a
different shape than production does, which is worse than emitting nothing.
Rejected: **scoping both to built output** — consistent on the page and worse in
the tree, since it leaves a consumer's dev pages unstyled for no reason beyond
symmetry with a limitation that does not apply to them. **Fixing both** — a
faithful dev `szd-json-sources` means `dev` acquiring a prefetch step, and so a
decision about whether `dev` resolves declared sources at all; that is `/design`'s
question, not a reconciliation's, and it is filed under `## Open` rather than
answered here. **Serving the stylesheet through Vite by widening `fs.allow`** —
it would reopen the `fs.allow`-stays-package-owned entry below to serve a file
the package is already holding.
Reversibility: cheap both ways. The dev styles are one call site; the scoping is
one paragraph over a property no consumer can have depended on, since it has
never been true.

### 2026-08-19 — `dev` resolves a data-backed adapter once, at startup

Context: `/reconcile` found that `dev` could not serve a `defineLandingPageData`
site at all. `devAdapter` loads the adapter through `loadAdapter`, which refuses a
data-backed export with "declares build-time data sources, which need a JSON
source map" — while the map sat beside it and `build` used it successfully. This
is the same defect shape as the 2026-08-15 composed-runtime-sources entry: a
message asserting an absence that is not there.
Chosen: `dev` resolves the declared sources once before starting the server and
hands `devAdapter` the composed configuration to hold. The absent-source-map
error is kept, moved to where it is actually true — no map present — so the
message and the condition finally agree.
Rejected: **resolving per request, as the middleware already reloads a plain
adapter's module** — it would refetch every declared source on every navigation,
including remote ones, turning a page reload into network traffic proportional to
the site's data. **Leaving `dev` unsupported and narrowing the design to say so**
— it withdraws nothing a consumer could want less, and still needs a code change
to stop the message claiming something false, so it is not the cheaper option it
looks like.
Reversibility: cheap. One optional parameter on an internal function and one
branch in the CLI.
Known cost, retained: a data-backed adapter's `dev` does not hot-reload its
configuration, because reloading means re-resolving. Editing one needs a restart,
the same trade generic `dev` already makes.

### 2026-08-19 — `preview` forwards input flags and suppresses only the mode flags

Context: the contract said `preview` "honours `--out-dir` and `--port` and no
other flag". Verified false: on a generic site every input flag reaches the build
it runs, so `preview --title X` serves a site titled X. The narrower gloss in the
same sentence — that `--adapter` and `--source-map` are read past — is what the
code holds.
Chosen: correct the contract to the code. `preview` builds before serving, so it
must read the flags that describe _what to build_; suppressing them would make
`preview` and `build` given identical flags produce different sites, which is the
disagree-about-mode hazard the ladder entry above exists to close, arriving by the
other door. Only the two flags that select which _mode_ a site is in stay
suppressed, because mode is `build`'s to resolve once.
Rejected: **suppressing every flag but `--out-dir` and `--port`** — it makes the
sentence true by making the command less useful and less consistent with `build`,
and a consumer inspecting a site built with flags could no longer inspect that
site.
Reversibility: cheap. The sentence describes behaviour that has shipped since
`preview` did.

### 2026-08-19 — The two plugin guards added as UI8 hardening are stated invariants

Context: `/reconcile` found `buildOutDirGuardPlugin` and the `server.fs.strict`
checks implemented, documented in `README.md`, and absent from both
`20-contract.md` and UI8's acceptance criteria. They arrived in a hardening commit
closing bypasses found in review; the commit message is the only place the
reasoning existed outside a source comment.
Chosen: state both in the contract's plugin section, with the reason each is an
invariant rather than a check. `fs.strict` is inseparable from `fs.allow` — it is
what gives the list force — so refusing one and permitting the other would be a
sandbox with a documented way out. `build.outDir` is trusted unconditionally by
the step that lifts generated documents into place, so a redirected build is not a
different output location but an unpredictable one.
Rejected: **leaving them to `README.md`** — the contract owns invariants and the
README owns CLI input and error behaviour; an invariant living only in the README
is a promise the document that governs promises does not make. **Enforcing only
at the `config` hook** — Vite never freezes the resolved configuration, so a
plugin can mutate the running server from `configureServer` after every config
hook has passed, which is the bypass the hardening commit closed.
Reversibility: cheap for the wording. Withdrawing either guard is not: a consumer
whose plugin works today does so because the guard permits it.

### 2026-08-19 — `preview` builds before serving

Context: issue #5's own "one real decision," left open when the rest of
`preview`'s contract was drafted. Not building leaves an existing `outDir`
alone and makes the served tree unambiguously whatever produced it; building
first removes the absent-`outDir` error and always shows the current source,
at the cost that `build` clears `outDir` before writing, so a build failing
after the clear leaves `preview` with nothing to serve.
Chosen: `preview` always builds first, then serves. No `--no-build` flag, no
absent-`outDir` error path.
Rejected: **serve-only, requiring an existing build** — avoids the clear-then-
fail hazard entirely, and was the recommendation when this fork was raised, but
was not the owner's choice: shown the tradeoff, the owner chose the command
that always reflects current source over the one that cannot destroy an
existing build.
Reversibility: expensive once consumers depend on `preview` always building —
withdrawing that and requiring a separate `build` step first is a breaking
behaviour change to a shipped command.

### 2026-08-19 — Consumer Vite plugins reach both `build` and `dev`

Context: issue #4's own flagged design question, left open when the rest of
the plugin contract was drafted: whether `LandingPageConfig` plugins apply to
`build`, `dev`, or both, and what that implies for the package's output
guarantees.
Chosen: one field, `plugins?: readonly PluginOption[]`, spread into both Vite
calls identically. Declaring plugins affects the shipped artifact, not only
the dev experience; the static-head, route-path and output-layout guarantees
hold only where no plugins are declared.
Rejected: **dev-only (`devPlugins`)** — keeps the built-output guarantees
unconditional regardless of whether plugins are declared, and was the
recommendation when this fork was raised, but was not the owner's choice: a
consumer needing a build-time transform (an SVG-as-component or i18n plugin,
not only Fast Refresh) would have had no route without reopening this
decision. **Two separate lists (`buildPlugins`/`devPlugins`)** — no capability
loss, most explicit at the call site, but the widest surface to maintain and
later withdraw, for a need issue #4 demonstrated only for `dev`.
Reversibility: expensive. Once a consumer's `build` depends on a declared
plugin, narrowing the field to dev-only is a breaking change.

### 2026-08-19 — `preview` holds no ladder of its own and shares one static server with `dev`

Context: issue #5. The static file server exists but only on `dev`'s generic
branch, so an adapter consumer cannot look at its built output without
reinstating the direct `vite` dependency the package exists to remove. Two
shapes were available: a `preview` that resolves input mode the way `build`
does and serves accordingly, or one that treats the built tree as its whole
input.
Chosen: `preview` holds no precedence ladder of its own. `--out-dir` and
`--port` are the only flags it honours; `--adapter` and `--source-map` are read
past, not forwarded. One static server implementation serves both `preview` and
generic `dev`.
Rejected: **resolving input mode in `preview`** — it would duplicate `build`'s
precedence ladder in a command that serves files, and give the two a way to
disagree about which mode a site is in while one of them is being used to check
the other's output. **A second server implementation for adapter mode** — the
duplication issue #5 explicitly rules out, and the copies would drift on the
three things that decide whether the built site actually runs: resolution,
containment and content type.
Reversibility: cheap for the server sharing. Adding a second, `preview`-owned
ladder later would be a behaviour change to a shipped command, so that
direction is not.

Amended 2026-08-19, same day. As first written, `Chosen` read "`preview` reads
no adapter module and no source map. `outDir` is the input" and `Rejected`
ruled out resolving input mode at all — which the build-before-serving decision
above, taken later the same day, contradicts outright, since building requires
resolving mode. Build-first is the one in force, and the wording here is
narrowed to what this decision was actually protecting, which still holds: mode
is resolved once, in `build`. `preview` calls `build` rather than reimplementing
its ladder, so the duplication and the disagree-about-mode hazard named under
`Rejected` are both closed — more firmly than a serve-only `preview` would have
closed them. Read `Rejected` as ruling out a _second_ ladder, not the one
`build` already owns.

### 2026-08-19 — The shared static server normalises directory URLs, contains resolution to `outDir`, and sets `Content-Type`

Context: writing `preview`'s contract against the existing server surfaced three
properties it does not have. It appends `index.html` only when the URL already
ends in `/`, so `/roadmap` 404s while `/roadmap/` works — the adapter's own dev
middleware normalises exactly this case, so the three servers disagree. It joins
the raw `request.url` to `outDir`, so a query string reaches the filename and a
`..` segment resolves outside the directory. It sets no `Content-Type` at all,
which a built adapter route does not survive: a module script served without a
JavaScript type does not execute.
Chosen: state all three as invariants of the shared server — pathname only,
percent-decoded once, directory URLs resolving to `index.html`, anything
resolving outside `outDir` answered as a 404 with no filesystem detail, and a
`Content-Type` on every 200. Issue #5's non-goal forbids changing `dev`'s
behaviour, and sharing the server does change it: a request that 404s today may
answer 200, and responses gain a header. Each of those changes is on a path that
is currently a defect rather than a behaviour anyone can be relying on.
Rejected: **keeping the server exactly as it is and reading the non-goal
literally** — it ships a `preview` that cannot serve the adapter output it was
written for, since the module scripts would not execute. **Fixing containment
and content type but not directory normalisation** — it leaves `preview`
disagreeing with the adapter dev server about the same URL, which is the
divergence sharing the implementation is meant to prevent.
Reversibility: cheap. Each is a property of one server function, and none is a
declared public field.

### 2026-08-19 — Consumer Vite plugins are a TypeScript-adapter surface only, never a JSON-model field

Context: issue #4. The 2026-08-15 `styles` entry established the opposite
default — a capability carried on `LandingPageConfig` should also be carried on
`AdapterLandingPageData` so a TypeScript adapter, a JSON model and a
`defineLandingPageData` site express it identically. Plugins cannot follow that
rule.
Chosen: the plugin declaration lives on `LandingPageConfig` alone. A plugin is
code; the JSON model is data the package may fetch over HTTP; a fetched document
that could name code the builder then executes is a different class of surface
from one that names a CSS path. A `defineLandingPageData` site returns a
`LandingPageConfig` and so declares plugins like any other adapter, which is why
the exclusion costs no capability.
Rejected: **a plugin-specifier field on `AdapterLandingPageData`** (a module
path resolved at build time) — it is the parity the `styles` entry would
predict, and it turns the JSON model into remote code selection. **Widening the
model later if a consumer asks** — recording the exclusion now is what stops the
question being reopened as an oversight; it is a stated boundary, not a gap.
Reversibility: cheap in the chosen direction — nothing is added to the model.
Expensive to reverse: adding a code-naming field to a fetched model is a
security decision, not an additive one.

### 2026-08-19 — `fs.allow` stays package-owned, and a plugin cannot widen it

Context: issue #4's third acceptance criterion. Vite merges plugin-returned
configuration into the inline configuration, and `server.fs.allow` is an array,
so a consumer plugin returning one would extend the sandbox the adapter
narrowed — implicitly, and invisibly to the `allow` field that exists to make
that widening reviewable.
Chosen: the resolved `fs.allow` is exactly the site root plus the resolved
`allow` entries. Plugin-supplied additions do not take effect and end the run
naming the entries refused.
Rejected: **silently re-narrowing after plugin resolution** — the consumer's
dev server then fails to read a file its plugin asked for, with nothing saying
why; a refusal that names the entries points straight at `allow`. **Letting
plugins widen it, since dev is not the shipped artifact** — the narrowing exists
because a dev server serves the filesystem to a browser, and that argument does
not weaken because the output is not published.
Reversibility: cheap. It is a check at one call site with no declared field
attached.

### 2026-08-15 — `LandingPageMetadata.repositoryUrl` is withdrawn

Context: `/contract` found a third public field read by nothing. It is typed on
route metadata and validated by the JSON model, and no code consumes it; the
generic shell's repository link comes from `GenericLandingPageData`'s separate
field of the same name, and the custom-adapter head never reads route metadata's
copy. The contract's static-head section never listed it, so it is unspecified
as well as unused.
Chosen: remove the field and its validation, as `hydrate` was removed the same
day and for the same reason — a validated no-op invites a consumer to set it and
believe the document changed. The contract needs no amendment, having never
claimed it.
Rejected: **specifying and emitting it** as a per-route repository link — the
head has no established `rel` for one, and the generic shell already expresses
the idea as a nav link, so the two forms would diverge on a field neither
consumer asked for. **Recording it as reserved-with-no-effect** — the cheapest
edit today, and it leaves a public interface with no specification, which the
hard rules forbid and the next reconciliation finds again.
Reversibility: cheap. Re-adding an optional field is additive during `0.x`.

### 2026-08-15 — `styles` is specified as ordered site-wide links, and a missing file fails the build

Context: the entry below chose to specify `LandingPageConfig.styles` rather than
withdraw it, and left the amendment to `/contract`. Writing it forced three
questions that entry did not answer: whether the JSON `kind: "adapter"` model
carries the field, where the links sit relative to a body route's `stylesheet`,
and what becomes of a declared path that cannot be read.
Chosen: carry `styles` on `AdapterLandingPageData` too, so a TypeScript adapter,
a JSON model and a `defineLandingPageData` site express it identically; emit the
links in declaration order, ahead of the `<style>` the head already places last,
so a route's own CSS overrides site-wide rules; and end the build on an
unreadable path.
Rejected: **the TypeScript config only** — it leaves a JSON-backed site with no
site-wide stylesheet at all, a capability gap that has to be explained rather
than read. **Emitting the links after a route's `stylesheet`** — a site-wide
file would silently override the route that declared its own CSS, inverting the
specificity a consumer expects from the narrower declaration. **Dropping an
unreadable path with a warning** — a site that builds and serves unstyled is the
silent failure the declared-source rules already reject, and that argument does
not weaken because the value is CSS rather than content.
Reversibility: expensive, as the entry it completes already recorded.
Specifying a public field is additive during `0.x`; withdrawing it after a
consumer adopts it needs a breaking release.

### 2026-08-15 — The document's invariants are enforced where the document is written

Context: `/reconcile` found two halves of one gap. The contract states that every
value the package interpolates into a document it owns is HTML-escaped and names
exactly two verbatim exceptions, but a route's `entry` reached the module-script
`src` unescaped beside attributes that were escaped — and `entry` is reachable
from a JSON model the contract permits to arrive over HTTP. Separately,
duplicate route paths were rejected by `defineLandingPage` and by the JSON model
validator but not by the function that writes the entry documents, so an adapter
object that reached the writer by another route silently produced one document
where two were declared.
Chosen: escape `entry` at its interpolation, and check path uniqueness in the
writer beside the per-route path check already there. Both are idempotent for
callers that already validate, so no valid consumer's output changes.
Rejected: **validating `entry` against a path grammar as well** — it is a
narrowing of a shipped public surface, and escaping already closes the document
hole the contract is stated over; a grammar can be added later as its own
narrowing release if a second reason appears. **Naming `entry` as a third
verbatim value in the contract** — unlike `body` and `stylesheet` it is validated
by nothing else, so the contract would be documenting an injection surface into a
document whose whole promise is that it loads only what the package put there.
**Leaving uniqueness to the two entry points the contract names** — that is the
same asymmetry the 2026-08-13 route-path entry already ruled against, and a
silently wrong build is the worst failure this package can produce.
Reversibility: cheap. Both are single-expression changes with no contract effect.

### 2026-08-15 — A composed adapter's entry routes may carry runtime sources

Context: the contract promises that every entry route declaring `dataSourceIds`
gets its filtered public map emitted inertly. The path that composes routes from
build-time data did not pass the resolved runtime map to the document writer, so
such a route failed with a message claiming no source map existed — while the map
was open in the calling function. No test or document covered the combination.
Chosen: pass the resolved runtime map through, exactly as the root-model path
already does. One emission mechanism serves both adapter forms, and the contract
becomes true rather than aspirational.
Rejected: **narrowing the contract so a composed route may not declare
`dataSourceIds`** — defensible, since a composed site already holds its data at
build time, but it withdraws a shipped surface and still needs a code change to
make the error message honest, so it is not the cheaper option it appears to be.
**Filing it and deciding later** — the contract stays false in the meantime and
the misleading message stays in front of the next consumer to try it.
Reversibility: cheap. One argument at one call site.

### 2026-08-15 — `styles` becomes site-wide stylesheet links rather than being withdrawn

Context: `LandingPageConfig.styles` has been a public field since the first
commit, consumed by nothing, absent from the contract and from this log. It is a
public interface with no specification, which the hard rules forbid.
Chosen: specify it as repository-relative CSS paths copied to the output and
emitted as `<link rel="stylesheet">` in every route's head, entry and body alike.
It is per-site rather than per-route, so it does not reopen the 2026-08-05
decision, which rejected a second _per-route_ mechanism competing with an entry
route's module graph. The contract amendment belongs to `/contract`; the
implementation follows it.
Rejected: **removing the field** — the cheaper and safer move, and the one
recommended, but it forgoes a genuinely absent capability: a site-wide
stylesheet has no expression today outside the generic shell's theme file.
**Inline CSS strings instead of paths** — it would mirror a body route's
`stylesheet` and keep CSS a string in the JSON model, but it forces every
site-wide rule through the config file and forgoes the bundler's asset handling.
**Body routes only** — the most conservative reading, rejected because a
site-wide field applying to only some routes is a contract that has to be
explained rather than read.
Reversibility: expensive. Specifying and implementing a public field is additive
during `0.x`, but withdrawing it after a consumer adopts it needs a breaking
release — which removing it now would not have.

### 2026-08-15 — `hydrate` is withdrawn rather than implemented

Context: `LandingPageEntryRoute.hydrate` has been typed and validated since the
first commit and read by nothing, while the README told consumers it was
available for a server-rendered mount. A documented no-op is worse than an
absent field: a consumer sets it and believes the page hydrates.
Chosen: remove the field, its validation, and the README claim.
Rejected: **specifying and implementing it** — the package has no prerendering
step to produce the markup a hydrating mount would attach to, so this is a design
question rather than a fix and would belong to `/design`, not to the correction
of a false claim. **Keeping the field and correcting only the README** — it
leaves a public field whose sole effect is to be validated, which is the shape
this entry exists to remove.
Reversibility: cheap. Re-adding an optional field is additive; the README claim
is the part that had to go either way.

### 2026-08-13 — The adapter seam accepts build-time data, typed by the consumer

Context: the entry earlier the same day rejected build-time data injection on the
grounds that the adapter module can already call Data.Json directly, so the seam
"buys nothing it does not have". That reasoning was incomplete. What the adapter
module can do directly is construct `nodePorts()`, call `prefetch`, build a
loader and hold a temporary directory — build plumbing this package already owns
and already performs for the root model. Every consumer composing from content
would write that twice. The `Interface<T>` framing is what made the omission
visible: `Validator<T>` is the seam that keeps the package ignorant of shape, and
it is already in Data.Json's vocabulary, so exposing it costs no new concept.
Chosen: `defineLandingPageData(sources, config)`. `sources` names one id and one
`Validator` per key of the consumer's `T`; `config` receives the resolved `T`.
The package resolves and validates; `T` and `config` are the consumer's. The
validator is required, because an optional one would make `T` an unchecked cast
over JSON this package never authored. Precedence is additive: a data-declaring
adapter outranks the root model, an adapter declaring none behaves exactly as
before.
Rejected: **an optional validator with a bare `T` cast** — it is the same lie
`projects` avoids in SubZeroDev.com by routing through `validateInventory`.
**A marker field on the returned object** — structural detection recognises a
plain object literal identically, so a configuration need not import this package
to be data-backed, which is what keeps the adapter tests free of a package
resolution step. **Changing precedence so any adapter outranks the root model**
— it would alter the build of a consumer holding both files today.
Reversibility: moderate. The export is additive during `0.x`; withdrawing it
after a consumer adopts it needs a breaking release.

### 2026-08-13 — A failed root model may fall back to a declared source, opt-in and loudly

Context: Docs-Template resolves each content document from a bundled default or
a configured remote URL, and when the remote fails it keeps the bundled default.
UI4 chose the opposite — a declared source that fails ends the build — so a
consumer moving a landing site to a published artifact loses the property that
its site still builds when the publisher is briefly unreachable. The gap was
first estimated as passing `JsonRequest.fallback` at the loader call. That is
wrong: `prefetch` resolves every `at: build` entry and throws `build.failed`
before returning, so the loader call is never reached and the request-level
fallback governs nothing here.
Chosen: an optional `--fallback-source-id` naming another `at: build` source in
the same public map. When `prefetch` fails and the root model is the _single_
failed source, the root entry is replaced by the fallback entry and the prefetch
is retried. Substitution is written to stderr naming the failed source, its
reason and the fallback. Default behaviour is unchanged: with no flag, a failure
still ends the build.
Rejected: **Docs-Template's implicit fallback** — it is silent, and a landing
site that quietly serves month-old copy is a worse outcome than one that fails
to build, because nobody is watching a static site the way a maintainer watches
a docs app. **Falling back for any failed source** — an auxiliary source failing
says nothing about whether the root is trustworthy, and recovering from it would
hide a broken publisher behind a working home page. **A `--fallback-path` naming
a file directly** — it would be a second source mechanism beside the map, which
is the duplication `subzerodev-data-json` exists to remove.
Reversibility: high. The flag is additive and defaults to the previous
behaviour, so withdrawing it affects only consumers who opted in.

### 2026-08-13 — A consumer owns its own content loader; the package owns the site model

Context: Docs-Template resolves many feature-scoped content documents — projects,
portfolio, CV, navigation, badges — each from a bundled JSON file or a remote URL
selected by configuration. The Data repository authors those in YAML, converts
them with `data-json-yaml`, and publishes the JSON artifacts. The question was
whether the landing package should grow the same per-feature content model so a
consumer like SubZeroDev.com could declare its projects and testimonials in JSON.
Chosen: it should not. The package's JSON path already delivers the loader
property that matters — a root model resolves from `path:` or `url:`
interchangeably, because `subzerodev-data-json` abstracts the difference and the
builder never branches on it. A consumer with structured content calls Data.Json
itself from `site/landing.config.ts`, exactly as Portfolio and Docs-Template do,
and composes its own body. The package keeps owning the site model, the routes
and the emitted document; it never owns product copy or its shape.
Rejected: **a section or component content model in the package** (`kind:
"sections"` with hero, features, projects, testimonials) — it is the most literal
reading of Docs-Template parity, and it moves copy structure and visual identity
into a repository whose brief excludes both. **build-time data injected into
`defineLandingPage`** — a factory receiving resolved sources would save each
consumer a little wiring, at the cost of a contract change and of the package
owning port construction that Data.Json already owns; the adapter module can
already call the loader directly, so the seam buys nothing it does not have.
Reversibility: high. Nothing was added, so nothing has to be withdrawn; the
build-time-injection seam remains available as an additive `0.x` change.

### 2026-08-13 — Route paths are validated as directory names, and every owned value is escaped

Context: the route-path validator accepted `/../`. A model route so declared
generated `../index.html`, which the adapter wrote outside its temporary entry
directory and left behind when the build then failed; `20-contract.md` had
claimed invalid route paths were errors. Separately, the generic shell
interpolated `docsUrl` and `repositoryUrl` into `href` attributes unescaped
while escaping the canonical URL beside them, so either value could close its
attribute and open a script element — in a document whose contract is that it
loads nothing. UI4 made both reachable from a JSON model that may be fetched
over HTTP.
Chosen: validate the path grammar in `assertRoute`, so the TypeScript adapter
and the JSON model enforce one rule rather than two; reject duplicate paths in
both; refuse to write an entry document resolving outside the generated
directory; and escape the two navigation URLs.
Rejected: **validating only the JSON path** — the adapter writes the file, so
the check belongs where the write is, and the asymmetry was itself the defect.
**Escaping a body route's `body` or `stylesheet`** — those are the two values
the contract names as caller-owned and validates by other means.
Reversibility: high for the escaping. The path grammar is a narrowing, so a
consumer using a segment outside `[A-Za-z0-9._-]` would need a widening release.

### 2026-08-13 — UI4 pins Data.Json 0.2.0

Context: the UI4 dependency gate required an immutable npm release exporting
`readSourceMap`; registry `0.1.0` did not include it. The newly published
`subzerodev-data-json@0.2.0` exports the reader from `/node` alongside the
prefetch and Node-port APIs UI4 needs.
Chosen: pin `subzerodev-data-json` exactly at `0.2.0` and implement UI4 against
that package. The landing package reads only the public map through Data.Json,
prefetches build-time values, and emits route-filtered inert runtime maps.
Rejected: a version range — it weakens the immutable consumer boundary; a local
reader — it duplicates the dependency's contract; a Git commit dependency — it
is not a released package artifact.
Reversibility: moderate. A correction requires a new immutable landing-package
release and an exact replacement dependency version.

### 2026-08-13 — Landing data moves through Data.Json without changing static-route ownership

Context: the generic builder reads Markdown directly and custom consumers encode
route primitives in TypeScript, while Docs-Template already carries an
independent YAML-to-JSON loading path. `subzerodev-data-json` exists to make the
source, timing and validation of a JSON payload declarative, but its published
`0.1.0` does not yet export the source-map reader needed to use the public YAML
map safely.
Chosen: define UI4 as an additive, JSON-backed `LandingPageData` path. A public
source map and build-time root source take precedence over the existing adapter
and Markdown inputs; declared JSON errors fail rather than falling back. Entry
routes alone may expose declared public runtime sources through inert
`#szd-json-sources`, and consumer code owns any loader or React provider. Body
and generic routes remain static. UI4 is blocked until the first immutable npm
release exporting `readSourceMap`, which it will pin exactly.
Rejected: **a local YAML reader** — duplicates Data.Json's contract and lets the
two validators drift. **a Git SHA dependency** — does not provide the immutable
package boundary consumers need. **package-owned React wiring** — makes React a
toolkit dependency and narrows the adapter seam. **runtime generic or body
rendering** — reverses their no-script static contract.
Reversibility: moderate. The JSON path is additive during `0.x`; withdrawing it
after consumers adopt it needs a breaking release.

### 2026-08-05 — A route declares either an entry module or its own document body

Context: `0.2.0` composes one body for every custom-adapter route: `<div id="root"></div>` plus a module
script for the route's entry. A consumer whose page is fully composed at build time cannot use the
adapter at all — it would have to ship an empty document plus a bundle whose only job is to fill it,
and it has no valid place for its stylesheet, because `<style>` is not conforming in `<body>`.
Chosen: make `LandingPageRoute` a union of an entry route and a body route. A body route's markup is
emitted verbatim as the document body, no script element is emitted, and an optional `stylesheet` is
emitted as a `<style>` element at the end of the head. Exactly one form must be declared; the
constraint is a type-level fact and is validated again at build time for JavaScript callers. Entry
routes are untouched, so this is additive for existing consumers.
Rejected: **An optional `body` beside the required `entry`** — the two never apply together, so the
type would admit "both" and "neither" and defer every mistake to a build-time error. **Escaping the
supplied body** — escaping is what makes the typed static head safe, and it is exactly what makes a
supplied body useless; the difference from the raw-head escape hatch rejected on 2026-08-04 is that
the head carries package-owned semantics a raw hole could contradict, whereas the body is entirely
consumer-owned content. **A body route that bypasses Vite** — a second output path would let asset
handling, public-directory copying and output layout drift between route forms. **A `stylesheet` on
entry routes too** — an entry route's CSS already travels through its module graph, and a second
mechanism would compete with it.
Reversibility: moderate. The union is easy to extend with further route forms; withdrawing the body
form after a consumer adopts it needs a new breaking package release.

### 2026-08-04 — The custom adapter owns declared static head, not consumer entry HTML

Context: `0.1.0` generated custom-adapter entry HTML but could express only a title, description,
canonical URL and one Open Graph image. A consumer with a complete static-head contract would lose
its Open Graph fields, X/Twitter card, icon links, theme colour and no-script fallback during
migration — a public regression caused by the integration it was meant to remove.
Chosen: add typed, route-local metadata for Open Graph, X/Twitter, icons, theme colour and no-script
content. The adapter emits exactly those declarations and HTML-escapes all supplied text and
attributes. This remains an adapter concern: consumers own values and public assets; the package
owns entry HTML generation.
Rejected: **Keep the fields in consumer-owned HTML** — preserves the values only by retaining the
duplicated mechanism. **Add an untyped raw-head escape hatch** — covers future tags, and makes an
HTML-injection surface part of the public API with no semantic validation. **Have the package infer
metadata from assets or route names** — guesses public copy and can silently change a consumer's
social card.
Reversibility: moderate. The additive `0.x` contract is easy to extend; removing a field after a
consumer adopts it needs a new breaking package release.

### 2026-08-04 — Vite and existing Markdown libraries are adopted

Context: Platform and Game Engine already prove Vite for custom landing pages;
generic Markdown must be safely rendered.
Chosen: Vite owns custom bundles; unified, remark, and rehype own Markdown,
GFM, and sanitization.
Rejected: hand-written parser or sanitizer — security-sensitive duplicate work;
hand-written HTML — no reusable Markdown contract; consumer-owned Vite config —
the duplicate configuration this repository exists to remove.
Reversibility: moderate.

### 2026-08-04 — UI1 release is pinned at 0.1.0

Context: UI2 must consume an immutable prerelease rather than the toolkit
working tree; Git tags are labels, not an immutability boundary.
Chosen: publish `subzerodev-platform-ui-landing-page@0.1.0` from source commit
`d2625b7be51585371d9f0b6c0b435c25e6ea4ade`, use that SHA for action references,
and provide `v0.1.0` as a convenience tag.
Rejected: a floating npm range or action branch — either can change under a
consumer without review; a Git submodule — preserves duplicated integration
ownership.
Reversibility: moderate; a correction requires a new immutable `0.x` release.

### 2026-08-13 — `AGENTS.md` merged with the kit contract, project identity kept verbatim

Context: `/install` found `AGENTS.md` unchanged since the repository's first
commit (`d2625b7`) — a 20-line project-identity note with no kit sections
(Source of truth, Model/effort, Command routing, Session boundaries, Hard
rules, Single ownership, Verification, Working with me, Git and delivery,
Tracking work, Decision logging, House conventions), even though
`.claude/commands/*`, `tools/*.ps1`, and `design/` were already installed and
in active use. `CLAUDE.md` was already the correct pointer form, so only the
content side needed the merge.
Chosen: keep the target's project-identity paragraph as a new `## Project
identity` section directly under the title, append every kit section
unchanged below it. Two target rules restated the same thing as a kit rule:
"Stage named paths only" folded into Git and delivery's existing "Stage
explicitly, by named path" (kit's fuller wording kept, including "add a
follow-up commit" for the force-push case, which the target's phrasing
lacked); "Every validator needs a positive and a negative test" kept in
Project identity in the target's own words, dropped from Verification's
overlapping "A schema or validator change is not done until it has rejected
something" bullet.
Rejected: leaving `AGENTS.md` as the 20-line file — the repository's commands
already assume concepts (model tiers, session boundaries, the design freeze)
that were nowhere written down; replacing the target's content wholesale with
the kit's `AGENTS.md` — the project-identity paragraph and its two house
rules are real, repository-specific content with no kit equivalent.
Reversibility: cheap — a documentation file, not a public interface.

### 2026-08-18 — This repository dogfoods its own package as a caller; Docusaurus added to `docs/`

Context: the repository had no self-hosted landing page or documentation
site of its own, unlike `SubZeroDev.GameEngine`, which uses this package as a
consumer for both. Setting one up needed a documentation-site generator for
`docs/` (fed by `/make-human-docs`'s `guide.md`, previously written to the
repository root with nowhere to be hosted) and a way to build/deploy this
repository's own `README.md`-driven landing page without changing the
package's public interface.
Chosen: (1) the package's own generic README/CHANGELOG mode, invoked via
`npx` against the last-published version, exactly as any external consumer
would — this repository is a CLI tool with no product UI to justify a custom
`site/landing.config.ts` adapter, unlike GameEngine. (2) `docs/` as a
standalone Docusaurus project with its own `package.json`
(`@docusaurus/core`, `@docusaurus/preset-classic`), built and deployed by a
new caller-owned workflow (`.github/workflows/pages.yml`) that merges the
docs build with the landing build via the package's existing `merge` CLI
command. (3) `CHANGELOG.md` is generated fresh on every deploy by the
package's own `generate-changelog` command and never committed.
Rejected: **GameEngine's docs pattern verbatim** — a private base container
image (`ghcr.io/the-running-dev/docs-template`) with Docusaurus and
PowerShell scripts baked in, and a `docs-deploy.yml` built around that image.
This repository has no PowerShell or Docker tooling today; adopting that
image would be a materially larger infrastructure decision (standing up or
depending on a shared private image) than "add a docs generator," and is out
of scope for this task. **Reusing `.github/workflows/deploy-pages.yml`
as-is** — its `build`/`merge` steps run inside a fresh job checkout that
never sees a `CHANGELOG.md` generated in a prior job, so it cannot be used
without either committing a stale changelog or modifying the reusable
workflow's contract; a new single-job caller workflow avoids both.
**Hand-authoring `CHANGELOG.md`** instead of generating it — duplicates what
`git log` already holds and goes stale, which is the exact failure the
package's own `generate-changelog` command exists to prevent.
Reversibility: moderate. The Docusaurus dependency and the new workflow are
additive and repo-local; removing them is cheap. The `docs/` directory now
means something different (a Docusaurus project, not two loose reference
files) — reverting that shape change means moving files back and fixing the
one relative link in `README.md` that changed with them.

## Open

Staging only. Once an item becomes a GitHub issue, `/track` removes it from here.
