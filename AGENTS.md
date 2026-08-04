# Agent contract

`SubZeroDev.Platform.UI.LandingPage` owns the reusable static landing-site build
tool, not any product's copy, visual identity, documentation build, or hosting
policy. Generic consumers provide Markdown and optional CSS; exceptional sites
use the exported adapter contract.

The canonical design files are `design/00-brief.md`, `design/10-design.md`,
`design/20-contract.md`, `design/30-slices.md`, and `design/90-decisions.md`.
Do not add a consumer-specific feature without a contract change. Keep the
generic DOM and CSS API semver-governed: all owned classes begin `szd-` and all
tokens begin `--szd-`.

Before editing, run `git status --short --branch`, inspect the relevant source
completely, and preserve unrelated work. Stage named paths only. Never force
push, rewrite published history, or publish an npm version without explicit
authorization. Every validator needs a positive and a negative test.

The GitHub Pages workflow is reusable but deployment remains caller-owned in
policy: callers provide permissions, triggers, concurrency, and environments.
