# UI1 contract

The public executable is `subzerodev-platform-ui-landing-page`. It exports
`defineLandingPage`, `LandingPageConfig`, `LandingPageRoute`,
`LandingPageEntryRoute`, `LandingPageBodyRoute`, `LandingPageMetadata`,
`LandingPageOpenGraphMetadata`, `LandingPageTwitterMetadata`, and
`LandingPageIcon`. Generic selectors start `szd-`; generic tokens start
`--szd-`. CLI input and error behavior is specified in the repository README.

## Custom-adapter static head

Each custom-adapter route has a required `metadata.title` and
`metadata.description`. It may also declare a canonical URL, a social image,
Open Graph title/description/type/URL/image/dimensions, an X/Twitter card and
image, favicon or Apple-touch-icon links, a theme colour, and route-specific
`<noscript>` text. The adapter emits exactly the optional elements declared by
the route; it invents no defaults. Attribute and text values are HTML-escaped.

## Custom-adapter document body

A custom-adapter route declares exactly one of `entry` and `body`; declaring
both or neither is an error.

An `entry` route emits the toolkit shell — `<div id="root"></div>` followed by a
module script for that entry — as before.

A `body` route emits the supplied markup verbatim as the document body and emits
no script, so the generated document loads nothing. The caller owns that markup;
the package still owns the doctype, the head, and the static-head contract
above, which is identical for both route forms. A `body` route may also declare
a `stylesheet`, which the adapter emits verbatim as the last element of the head
inside a `<style>` element; CSS containing the string `</style` is rejected, and
a `stylesheet` declared on an `entry` route is rejected rather than dropped.
