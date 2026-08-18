import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

/**
 * `merge` (subzerodev-platform-ui-landing-page's own CLI command) overlays the
 * generic-mode landing build onto this build's root `index.html` and other
 * root-level output, and fingerprints the `docs/` subtree to prove it is left
 * untouched. So `baseUrl` names the whole deployed site's path — the GitHub
 * Pages project subpath, since this repository has no custom domain — and
 * `routeBasePath: "docs"` is what keeps the doc pages under that unmerged
 * subtree.
 */
const baseUrl = "/SubZeroDev.Platform.UI.LandingPage/";

const config: Config = {
  title: "SubZeroDev Platform UI Landing Page",
  tagline: "A static landing-site builder for repositories without a frontend",
  url: "https://the-running-dev.github.io",
  baseUrl,

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebar.ts",
          routeBasePath: "docs",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: "SubZeroDev Platform UI Landing Page",
      items: [
        { to: "/docs/", label: "Docs", position: "left" },
        {
          href: "https://github.com/The-Running-Dev/SubZeroDev.Platform.UI.LandingPage",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} The Running Dev.`,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
