# UI1 design

The CLI resolves consumer files into either a generic Markdown model or an
adapter configuration. Generic builds render sanitized static HTML. Custom
builds generate Vite entry HTML from declared routes, including each route's
declared static-head metadata and `<noscript>` content. A route declares either
an entry module, which receives the toolkit shell and a module script, or its
own document body, which is emitted verbatim with no script and may carry an
inline stylesheet. One document generator composes both forms and both pass
through the same Vite build, so output layout, public assets and static head do
not vary by route form. The merge command guards the documentation subtree with
per-file SHA-256 fingerprints.
