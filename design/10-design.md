# UI1 design

This document carries what the tree cannot: what each entity is _for_, which
direction the dependencies run and why, what happens when something outside the
process fails, and which alternatives were rejected. Shapes — declarations,
field lists, paths, counts — live in the tree and are pointed at rather than
copied (`AGENTS.md`, _Single ownership_). Invariants and error semantics live in
[`20-contract.md`](20-contract.md) and are cited by id rather than restated.

## Data model

Nothing here is a database. The package's persisted state is three things it
does not author — the JSON site model, the public source map, and the
consumer's Markdown — and one thing it writes and owns outright, the built
output tree. Everything between them is per-invocation memory.

**Site configuration** ([`src/index.ts`](../src/index.ts)). The whole
description of one site, whichever input form produced it. It has no identity:
exactly one exists per invocation, it is never named, never addressed and never
persisted. The consumer owns every value in it; the package owns only whether
the value is admissible. Its lifecycle is the invocation — constructed during
resolution, consumed by its family's document writer, discarded.

**Route.** The addressable unit, and the only entity with a real identity: its
`path`. The path is identity in two senses that must not come apart — it is the
uniqueness key (**C2**) and it is the output location, since the document's
directory is derived from it and from nothing else. That derivation is why the
path grammar is a filesystem question rather than a URL question (**C1**). The
two route forms are discriminated structurally rather than by a tag field, so a
plain object literal that never imported this package classifies identically;
the cost of that choice is that "neither form" and "both forms" are
representable and must be rejected at validation (**C3**) rather than being
unrepresentable.

**Route metadata.** Purely declarative, and the one entity where _absence_ is
the meaningful state: no field is derived, defaulted or inferred, so an absent
declaration emits no element rather than a guessed one. A field the package
would populate from another field is a field that silently changes a
consumer's social card, which is why the optional fields are optional rather
than defaulted.

**JSON site model** ([`src/data.ts`](../src/data.ts)). Persisted, versioned,
authored elsewhere, read and never written. Its identity is the source id it
resolves under in the public map. Its lifecycle is shorter than it looks: it is
fetched, validated, projected into a site configuration, and dropped — nothing
downstream holds it. Strictness is not fussiness but the migration mechanism:
because the model may arrive over HTTP from a publisher on its own release
cadence, a field this version does not know must be an error rather than a
silent drop, or a consumer learns its model outran its package by noticing a
missing section on a live page.

**Public source map.** Persisted, and owned by `subzerodev-data-json` rather
than by this package, which reads it through that dependency and parses nothing
itself. Identity is a path plus per-entry ids. Two constraints exist here and
not in the owning package, both because _public_ is a property of this map and
not of maps in general (**C14**).

**Prefetched runtime map.** Derived, in-memory, and the entity whose derivation
explains most of the runtime-data design: resolution replaces every build-time
entry with its resolved payload inline and passes runtime entries through
untouched. Being derived by resolution is why it cannot exist before resolution
has run, and why what reaches a document is this map rather than the public one
(**C10**) — the public map names a path or URL, and handing a consumer's loader
that shape in one environment and inline payloads in another is a difference
the consumer's code would have to know about.

**Build-time data declaration** ([`src/index.ts`](../src/index.ts)). The
consumer's claim about JSON this package never authored. Ownership is split
deliberately down one line: the package owns resolution, validation timing and
failure reporting; the consumer owns the type and the validator that earns it.
The validator is required because the alternative is a cast, and a cast makes
the type a promise the package cannot keep.

**Generic site inputs** ([`src/generic.ts`](../src/generic.ts)). Markdown
documents plus optional overrides — the only mode where the package derives
copy rather than receiving it. Title and description are derived from the home
document when not declared, which is the entire reason the single top-level
heading and the first prose paragraph are requirements rather than conveniences:
a derivation with no input is a blank page, and the failure has to land at build
time. The repository is derived from the git remote and the changelog from
first-parent history; both are derived from state outside the working tree, and
both therefore have a defined behaviour when that state is absent (below).

**Site style** ([`src/adapter.ts`](../src/adapter.ts)). A stylesheet's bytes
paired with the href that will address them, the href derived from the path.
In-memory, and it exists as an entity at all because of ordering: pairing the
bytes with the href is what lets every stylesheet be read and contained before
anything is written (**C16**), and what lets the dev server answer the emitted
href from memory instead of widening its filesystem sandbox (**C18**).

**Built output tree.** The persisted artifact, addressed by URL, and the only
thing this package writes that outlives the process. Its lifecycle is
replace-not-merge: the output directory is cleared before a build writes, so
there is never a stale-file merge to reason about, and the accepted cost is that
a build failing after the clear leaves nothing behind (**C32**).

**Protected-subtree fingerprint** ([`src/merge.ts`](../src/merge.ts)). Derived
per file by digest, in-memory, and alive only for the span of one merge. It
exists to be compared against itself, which is the point: a path check can only
refuse a collision someone thought to look for, and a digest refuses every
collision including the ones nobody predicted.

## Module boundaries

Dependencies run one way, from a base of modules that depend on nothing in the
package toward a single composition module that depends on every one of them
that composes something. Each module's exposed surface, and the constraint each
surface carries beyond its signature, is [`20-contract.md`](20-contract.md) § _Cross-module surface_; what
follows is ownership and direction only.

| Module                                          | Owns                                                                           | Depends on (in-package)                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [`src/baseCss.ts`](../src/baseCss.ts)           | The semver-governed generic style surface (**C31**)                            | nothing                                                            |
| [`src/git.ts`](../src/git.ts)                   | The subprocess boundary, and collapsing every failure of it into one message   | nothing                                                            |
| [`src/staticServer.ts`](../src/staticServer.ts) | Serving a built tree: resolution, containment, content type                    | `paths`                                                            |
| [`src/merge.ts`](../src/merge.ts)               | The documentation-tree guard                                                   | nothing                                                            |
| [`src/paths.ts`](../src/paths.ts)               | Filesystem containment, symlinks resolved before comparing                     | nothing                                                            |
| [`src/route.ts`](../src/route.ts)               | The route grammar, the form discrimination, and uniqueness                     | type-only on `index`                                               |
| [`src/index.ts`](../src/index.ts)               | The public type surface and the eager validation seam                          | `route`, re-exports `data`                                         |
| [`src/data.ts`](../src/data.ts)                 | The persisted schema and its strictness                                        | `route`, types from `index`                                        |
| [`src/changelog.ts`](../src/changelog.ts)       | Deriving entries from history, and escaping what a commit message can carry    | `git`                                                              |
| [`src/generic.ts`](../src/generic.ts)           | The generic shell: rendering, sanitization, derived copy                       | `baseCss`, `git`, `data`, `paths`                                  |
| [`src/adapter.ts`](../src/adapter.ts)           | The single document writer, both Vite invocations, the guards over them        | `route`, `paths`, types from `index`                               |
| [`src/cli.ts`](../src/cli.ts)                   | Flags, the precedence ladder, and every decision about which mode a site is in | `adapter`, `generic`, `data`, `changelog`, `merge`, `staticServer` |

The graph is acyclic at runtime. It has one apparent cycle — `index` imports
`route` for values while `route` imports `index` for types — which is erased at
compilation and so is not a cycle in anything that executes. It is acceptable
only while the arrow stays type-only in that direction; the moment `route`
needed a _value_ from `index`, the shared declarations would have to move below
both rather than the import being permitted.

Three boundaries carry the load and are worth naming as boundaries rather than
as modules:

**`cli` is the only module that knows what mode a site is in.** Every other
module is handed a resolved input and does not ask where it came from. This is
what makes the precedence a single ladder rather than a rule each command
re-derives, and it is why a second command growing its own ladder is a
structural regression rather than a duplication of a few lines (**C28**).

**There are exactly two document writers, one per site family**, and the split
is the generic shell against the custom adapter — not the ladder, and not the
route form. Every custom-adapter form converges on `adapter`, which is what
makes output layout, public asset staging and static head impossible to drift
apart by route form (**C27**), and why the document invariants are enforced
there rather than at each caller that reaches it; both generic forms converge on
`generic`, which is what keeps the legacy and JSON generic sites from drifting
on markup. The two families are not merged because a generic document emits no
script and reaches no bundler, so a shared writer would be a switch, not a
convergence. **The number to hold on to is two, and any third writer is the
regression** — the property being protected is that no input mode gets a private
write path, and it is a property of each family, not of the package.

**Containment has one owner, `paths`, and the three modules that need it route
through it.** It is stated as a boundary rather than left to each caller because
an invariant implemented once per caller holds wherever someone remembered it —
and the three implementations that preceded this decision were not even the same
check, which is the argument against three rather than an accident of three.
Resolving symlinks before comparing is the property that only a shared owner
can be relied on to have. The owner is two functions rather than one, because a
per-request server and a per-stylesheet loop must not re-resolve the same root
on every call; both resolve both sides before comparing, which is the property
that matters (`90-decisions.md`, 2026-08-19).

## Control flow

**Building a site.** Triggered by `build`, and reached identically by `check`,
by the build that `preview` runs first, and by generic `dev`. The output
directory is cleared, the precedence ladder selects exactly one resolver, the
resolver produces a site configuration, and that family's document writer turns
it into a tree. The ladder has four rungs and the input forms number five,
because the source-map rung splits once more on the model's own declared kind —
a distinction the ladder does not make, since by then the site has already been
selected and only its family is still in question. The ladder is a precedence
and not a mode flag because each level exists to express something the level
below cannot, and it is additive by construction: a consumer that acquires a
source map without an adapter that declares sources builds exactly what it built
before the seam existed. The one
inversion — a data-declaring adapter outranking the root model — is not an
exception to that reasoning but an application of it, since such an adapter is
that data's consumer rather than a competing description of the same site.

**Developing a site.** Triggered by `dev`, which resolves input mode through
the same ladder `build` owns rather than a rule of its own — the ladder decides
_which_ site, and the site's family then decides which server: an adapter-family
site is served by the Vite dev server however it was selected, a generic-family
site is built and served statically. Where `dev` has prefetched declared
sources, it emits the resulting runtime map, so a consumer entry finds the same
element with the same shape locally and in production; a declared source that is
unreachable at startup ends the command rather than starting the server without
it, because no path in this package continues past a failed declared source
(`90-decisions.md`, 2026-08-19).

A Vite dev server holds the site root; the package's own route middleware
registers ahead of Vite's built-ins because neither a route path nor a
stylesheet href names a file on disk, so anything registered later would 404
first (**C22**). Documents are generated per request by the same
generator the build uses. A plain adapter's module is re-read per request, which
is what makes editing it take effect; a data-backed adapter is resolved once at
startup instead, because re-resolving per request would refetch every declared
source on every navigation. The retained cost of that is stated rather than
hidden: editing a data-backed adapter needs a restart.

**Serving built output, and shipping it.** `preview` builds and then serves;
generic `dev` does the same. Both reach one server implementation, so the three
things that decide whether a built site actually runs — path resolution,
containment, and content type — cannot differ between the command that inspects
the output and the environment that ships it. Delivery continues outside the
package: `generate-changelog` derives entries from history, `merge` folds the
landing build into a documentation tree under the fingerprint guard, and the
composite action and reusable workflow carry that into Pages. The workflow
declares no trigger and no concurrency, which is what lets one workflow serve
repositories with different deployment policies; its deploy job's permissions
and environment are not caller-provided because `workflow_call` gives a caller
no mechanism to provide them.

## Failure modes

Every failure is a thrown error carrying a message written for whoever declared
the input, and nothing in this package is retryable by its caller: each
condition below is a declaration or an environment that must change first, so
the same command over the same inputs fails the same way. A network source that
failed transiently looks like an exception to that and is not — re-running the
build retries it, but the package neither retries internally nor labels the
failure transient, because it cannot distinguish a flaky host from a wrong URL.

| Dependency or boundary                  | What fails                                                                       | Detected by                                     | What the system does                                                                                                                                 | Residue                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Filesystem — reads                      | A declared stylesheet, asset, or Markdown file is absent or outside the root     | An explicit check before any write              | Ends the build naming the declaration                                                                                                                | None: every declared stylesheet is read before anything is written (**C16**) |
| Filesystem — writes                     | The output directory cannot be written, or a write fails partway                 | The failing call                                | Ends the build                                                                                                                                       | A partially written output tree, already cleared of its predecessor          |
| Network / JSON dependency               | A declared build-time source cannot be fetched or does not validate              | Resolution, before any artifact is written      | Ends the build — or, under `dev`, the startup; recovers only where `--fallback-source-id` opts in and the root model is the single failure (**C12**) | The resolution scratch directory is removed on every path                    |
| Network — an auxiliary source           | A source other than the root fails                                               | Same                                            | Ends the build with no fallback, deliberately: a failure elsewhere says nothing about whether the root is sound                                      | Same                                                                         |
| Adapter-declared sources                | One or more of a data-backed adapter's sources is missing, non-build, or invalid | Resolution                                      | Collects every failure, reports them in declaration order, and never runs composition (**C15**)                                                      | Same                                                                         |
| Consumer adapter module                 | The module throws, or exports nothing usable                                     | Module load                                     | Ends the command naming the module and the two valid export forms                                                                                    | None                                                                         |
| Consumer Vite plugins                   | A plugin redirects output, widens the sandbox, or disables its strictness        | Guards over both the merged and resolved config | Ends the run naming what was refused (**C19**–**C21**)                                                                                               | Whatever the build wrote before the guard fired                              |
| Consumer Vite plugins — everything else | A plugin rewrites emitted HTML or asset URLs                                     | **Nothing.** Stated, not enforced (**C23**)     | The output is the consumer's; the package's layout and head guarantees no longer hold                                                                | n/a                                                                          |
| `git`                                   | The binary is absent, or the command fails                                       | The subprocess boundary                         | One message naming the remedy; the generic build catches it and continues without a repository link, `generate-changelog` does not                   | None                                                                         |
| Socket bind                             | The port is in use                                                               | An asynchronous `'error'` event                 | Reported as a message and a non-zero exit, because the event fires after the command's promise has settled                                           | None                                                                         |
| Static server — a request               | A path resolves outside the tree, will not decode, or names nothing              | Resolution inside the server                    | 404 with no body detail; all three are indistinguishable to the client by design (**C6**)                                                            | None                                                                         |
| `merge`                                 | The protected subtree changed under the copy                                     | Per-file digests taken before and after         | Ends the command (**C25**)                                                                                                                           | **A partially merged tree.** The guarantee is detection, not rollback        |
| GitHub Pages                            | The deploy fails                                                                 | The workflow                                    | Outside this package; the caller owns triggers and concurrency                                                                                       | Whatever Pages holds                                                         |

Two of those rows are the design's real positions rather than incidental
behaviour, and both are the same position twice. **Silence is the failure being
avoided.** A landing site that quietly serves stale copy, or serves unstyled, is
worse than one that fails to build, because nobody watches a static site the way
a maintainer watches an application — so a declared input that cannot be
honoured ends the build, and the single recovery is opt-in and announced
(**C13**). And **partial failure is admitted where it exists rather than
claimed away**: a build that fails after clearing its output, and a merge that
fails after copying, both leave a tree behind. Neither is transactional, and
saying so is what stops a future reader assuming a rollback that is not there.

## Concurrency and ordering

**Within one invocation, nothing this package does is concurrent, and what
enforces it is that every step is sequentially awaited** — there is no work
queue, no worker pool, and nothing resolved in parallel: even the two `realpath`
calls a containment check makes are awaited one after the other. Concurrency
that does exist comes from outside: the two servers handle overlapping requests
on the event loop — which is why the static server's request handler is the one
promise this package deliberately does not await — and the bundler parallelises
internally within a build the package has already serialised around.

Ordering, by contrast, does real work, and in five places it _is_ the
enforcement mechanism rather than an implementation detail:

- **Every stylesheet is read and contained before anything is written.** That
  ordering is what makes an unreadable stylesheet a build failure with no output
  rather than a site published unstyled (**C16**).
- **The output directory is cleared before the build writes**, which is what
  removes stale-file merging as a category of problem, at the stated cost.
- **Resolution completes before composition runs.** Every declared source
  resolves, or the build ends; consumer composition code never sees a partially
  resolved set (**C15**).
- **Failures are reported in declaration order**, not grouped by failure class,
  because grouping would order the list by something the consumer never wrote.
- **Site-wide stylesheet links precede a route's own**, in declaration order, so
  the narrower declaration wins the cascade (**C17**). This one is a public
  promise, not just an internal sequence.

Two ordering hazards are known and unguarded. **Nothing serialises two
invocations against the same output directory** — no lock, no marker, and no
detection — so a build racing a build, or a build racing the server reading what
it wrote, interleaves destructively. This is accepted because the commands are
run by a person or by one CI job, not scheduled. And **generic `dev` and
`preview` share a default port**, so running both is the ordinary collision; it
surfaces
asynchronously, which is exactly why the bind failure is subscribed to rather
than awaited.

## Alternatives considered

**One document writer per site family, or one per route form.** Chosen: every
custom-adapter form converges on one writer and both generic forms on another,
so the only split is the one the families force (**C27**). Rejected: a body route
bypassing the bundler, which was the obvious shortcut since such a route needs
no module graph — rejected because a second output path is how asset handling,
public-directory copying and output layout drift apart between route forms, and
the drift would appear only in the mode used less
(`90-decisions.md`, 2026-08-05).

**Input resolution as a precedence, or as an explicit mode.** Chosen: a ladder
in one module, additive by construction. Rejected: any adapter outranking the
root model, because it would change the build of a consumer holding both files
today; and rejected: a mode flag, which moves the decision to every invocation
and to every caller's CI configuration, where the modes would be selected
by hand and get it wrong in exactly the case the ladder makes automatic
(`90-decisions.md`, 2026-08-13).

**Fail on a declared source, or fall back to a bundled default.** Chosen: a
declared source that fails ends the build; the one recovery is opt-in, narrow to
the root model, and announced on stderr. Rejected: the implicit fallback a
neighbouring project uses, which keeps the site building when the publisher is
briefly unreachable — rejected because it is silent, and stale copy served
confidently is the worse of the two outcomes. Also rejected: falling back for
any failed source, which would hide a broken publisher behind a working home
page (`90-decisions.md`, 2026-08-13).

**A content model in the package, or a loader in the consumer.** Chosen: the
package owns the site model, the routes and the emitted document, and never
product copy or its shape. Rejected: a section or component model — hero,
features, projects, testimonials — which is the most literal reading of parity
with the neighbouring docs project, and which moves copy structure and visual
identity into a repository whose brief excludes both
(`90-decisions.md`, 2026-08-13).

**Plugins on both surfaces, or on the TypeScript surface only.** Chosen: plugins
are declared in consumer code and are absent from the JSON model, breaking the
symmetry that governs every other capability. Rejected: a plugin-specifier field
on the model, which is the parity rule's own prediction — rejected because the
model is data the package may fetch over HTTP, and a fetched document that names
code the builder then executes is a different class of surface from one that
names a stylesheet (`90-decisions.md`, 2026-08-19).

**`preview` builds first, or serves what is already there.** Chosen: it always
builds, so what is served always reflects current source. Rejected: serve-only,
which avoids the clear-then-fail hazard entirely and was the recommendation when
the fork was raised; the owner chose currency over the guarantee that an
existing build cannot be destroyed (`90-decisions.md`, 2026-08-19).

**One static server, or one per mode.** Chosen: `preview` and generic `dev`
share an implementation. Rejected: a second implementation for adapter mode,
because the copies would drift on resolution, containment and content type —
the three properties that decide whether the built site runs at all, and the
ones a reader is least likely to check twice
(`90-decisions.md`, 2026-08-19).

## Open questions

None. The three this rewrite raised were put to the owner and answered the same
day; each is logged in [`90-decisions.md`](90-decisions.md) with its rejected
alternatives, and the design above states the decided behaviour rather than the
question. Two of the three are now in the tree — `dev` resolves through the
ladder and emits the prefetched map (UI10), and containment has one owner that
follows symbolic links (UI11). The third is not: `--base-path` still does not
reach the JSON generic form, which [`20-contract.md`](20-contract.md) **C29**
marks _decided, not yet in the tree_ and `90-decisions.md` § _Open_ stages for a
bug issue.
