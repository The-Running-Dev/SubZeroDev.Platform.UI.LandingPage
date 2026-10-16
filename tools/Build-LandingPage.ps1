#Requires -Version 7.0
<#
.SYNOPSIS
    Builds the self-hosted landing page with the published package and merges it into the
    docs build.

.DESCRIPTION
    The Pages deploy's post-build step (.github/workflows/pages.yml), run from the repository
    root after docs/ has been built into docs/build.

    The published package is installed globally rather than run through npx: from this
    repository's root, npm exec resolves the package name to this repository's own unbuilt
    package.json (same name, same bin) instead of the registry tarball. A global install puts
    the published bin on PATH directly. See design/90-decisions.md (2026-08-19) and issue #43.

    CHANGELOG.md is generated for the build only and never committed.

.PARAMETER Version
    Published package version. Defaults to LANDING_PAGE_VERSION.

.PARAMETER BasePath
    Path the site is served under, with leading and trailing slashes. Defaults to
    PAGES_BASE_PATH, which the shared pages.yml workflow exports from the Pages settings.
#>
[CmdletBinding()]
param(
    [string] $Version = $env:LANDING_PAGE_VERSION,
    [string] $BasePath = $env:PAGES_BASE_PATH
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

if (-not $Version) { throw 'No package version: pass -Version or set LANDING_PAGE_VERSION.' }
if (-not $BasePath) { throw 'No base path: pass -BasePath or set PAGES_BASE_PATH.' }

$cli = 'subzerodev-platform-ui-landing-page'

npm install --global "$cli@$Version"
& $cli generate-changelog
# --docs-url must match `baseUrl` in docs/docusaurus.config.ts; --base-path prefixes the
# shell's own stylesheet links and Home/Changelog nav (issues #48 and #50).
& $cli build --docs-url "${BasePath}docs/" --base-path $BasePath
& $cli merge --docs-output docs/build
