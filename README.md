# SubZeroDev.Platform.UI.LandingPage

A static landing-page toolkit for repositories that want a README-driven home
page, a changelog route, optional full CSS control, and an auditable GitHub
Pages deployment path.

## Quick start

```powershell
npm install --save-dev subzerodev-platform-ui-landing-page@0.1.0
subzerodev-platform-ui-landing-page build
```

The default inputs are `README.md`, `CHANGELOG.md`, optional `site/README.md`,
optional `site/theme.css`, and optional `site/public/`. The build writes
`site/dist/` with `/` and `/changelog/`.

## Development

```powershell
npm install
npm run check
```

## Compatibility

Generic-site DOM selectors and CSS custom properties beginning `szd-` are the
public styling contract. During `0.x`, consumers pin exact package versions and
workflow SHAs. A later `1.0.0` will use semantic-versioning major releases for
breaking CSS or DOM changes.
