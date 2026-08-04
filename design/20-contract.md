# UI1 contract

The public executable is `subzerodev-platform-ui-landing-page`. It exports
`defineLandingPage`, `LandingPageConfig`, `LandingPageRoute`,
`LandingPageMetadata`, `LandingPageOpenGraphMetadata`,
`LandingPageTwitterMetadata`, and `LandingPageIcon`. Generic selectors start
`szd-`; generic tokens start `--szd-`. CLI input and error behavior is
specified in the repository README.

## Custom-adapter static head

Each custom-adapter route has a required `metadata.title` and
`metadata.description`. It may also declare a canonical URL, a social image,
Open Graph title/description/type/URL/image/dimensions, an X/Twitter card and
image, favicon or Apple-touch-icon links, a theme colour, and route-specific
`<noscript>` text. The adapter emits exactly the optional elements declared by
the route; it invents no defaults. Attribute and text values are HTML-escaped.
