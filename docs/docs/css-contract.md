# Generic CSS and DOM contract

The generic renderer owns only selectors beginning `.szd-` and custom
properties beginning `--szd-`. Consumer CSS is loaded after the base stylesheet
and may target any item below.

```text
.szd-shell
  .szd-header
    .szd-brand
    .szd-nav
  .szd-main
    .szd-article
  .szd-footer
```

The document body has a `.szd-skip-link` before `.szd-shell`. Generic Markdown
uses semantic `article`, headings, paragraphs, lists, tables, code and links.
The base tokens are `--szd-bg`, `--szd-surface`, `--szd-text`, `--szd-muted`,
`--szd-accent`, `--szd-border`, and `--szd-measure`.
