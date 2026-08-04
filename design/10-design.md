# UI1 design

The CLI resolves consumer files into either a generic Markdown model or an
adapter configuration. Generic builds render sanitized static HTML. Custom
builds generate Vite entry HTML from declared routes, including each route's
declared static-head metadata and `<noscript>` content. The merge command
guards the documentation subtree with per-file SHA-256 fingerprints.
