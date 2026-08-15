# UI1 design

Input resolution is a precedence, and each level exists because the one below it
cannot express something: a public JSON source map outranks a TypeScript adapter
module, which outranks the legacy README and changelog files. An adapter that
declares its own build-time sources is the exception in the other direction — it
outranks the root model, because such an adapter is that data's consumer rather
than a competing description of the site. Precedence is additive by
construction: a consumer holding both a map and an adapter that declares no
sources builds exactly what it built before the seam existed.

A declared source that cannot be read or validated ends the build. The single
recovery is opt-in and announced on stderr: a named fallback may replace the
root model, and only where the root is the one source that failed, since a
failure elsewhere says nothing about whether the root is trustworthy. Silence is
the failure mode being avoided — a landing site quietly serving stale copy is
worse than one that fails to build, because nobody watches a static site the way
a maintainer watches an app.

Sources resolve at build time. An entry route alone may additionally name public
sources for its own runtime use; the package emits those declarations inertly
and never loads them, so the consumer's entry owns any loader. The generic and
body forms cannot participate: they emit no script, so a runtime source would
have nothing to read it. Generic Markdown is sanitized rather than escaped,
because it exists to become markup and escaping it would defeat the one thing it
is for.

One document generator composes both route forms and both pass through the same
bundler, so output layout, public assets and static head cannot drift apart by
route form. That single write path is where the route-path and escaping
invariants stated in `20-contract.md` are enforced, rather than at each caller
that reaches it.

The merge command guards the documentation subtree by fingerprinting every file
in it before and after the copy and failing on any difference, rather than by
trusting the landing build not to contain a colliding path.
