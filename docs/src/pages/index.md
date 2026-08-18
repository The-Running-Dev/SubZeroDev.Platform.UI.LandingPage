---
title: SubZeroDev Platform UI Landing Page
---

<!--
  Exists only so Docusaurus has a route at the site root — its
  onBrokenLinks/onBrokenAnchors checks are 'throw', and the navbar brand
  links here. `.github/workflows/pages.yml`'s `merge` step overwrites this
  page's built output with the real landing page (built from the
  repository's own README.md by the package's generic mode) on every
  deploy. Same reason and same fix as GameEngine's docs/src/pages/index.md.

  That overwrite replaces the static index.html only. This page is also
  compiled into the client bundle as the route for the site root, so a
  visitor already inside the docs SPA who clicks the navbar brand gets this
  content client-side rather than the merged landing page; only a fresh
  load of the URL hits the overwritten file. So keep this a truthful, if
  brief, stand-in for the landing page rather than placeholder filler.
-->

# SubZeroDev Platform UI Landing Page

A static landing-site builder you can drop into a repository without a
consumer-specific frontend project.

[View the documentation](/SubZeroDev.Platform.UI.LandingPage/docs/)
