import { assertRoute } from "./route.js";

/** Static Open Graph fields emitted for a custom-adapter route. */
export type LandingPageOpenGraphMetadata = {
  title: string;
  description: string;
  type: string;
  url: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
};

/** Static X/Twitter card fields emitted for a custom-adapter route. */
export type LandingPageTwitterMetadata = {
  card: string;
  imageUrl?: string;
};

/** A route-specific favicon or touch-icon link. */
export type LandingPageIcon = {
  rel: "icon" | "apple-touch-icon";
  href: string;
  type?: string;
  sizes?: string;
};

export type LandingPageMetadata = {
  title: string;
  description: string;
  canonicalUrl?: string;
  repositoryUrl?: string;
  socialImageUrl?: string;
  openGraph?: LandingPageOpenGraphMetadata;
  twitter?: LandingPageTwitterMetadata;
  icons?: readonly LandingPageIcon[];
  themeColor?: string;
  noScript?: string;
};

/** A route whose document body is the toolkit shell filled by an entry module. */
export type LandingPageEntryRoute = {
  path: "/" | `/${string}/`;
  entry: string;
  metadata: LandingPageMetadata;
  hydrate?: boolean;
  dataSourceIds?: readonly string[];
};

export type {
  AdapterLandingPageData,
  GenericLandingPageData,
  LandingPageData,
  LandingPageDataRoute,
  LandingPageMarkdown,
} from "./data.js";
export { validateLandingPageData } from "./data.js";

/** A route whose document body is supplied by the caller and loads no script. */
export type LandingPageBodyRoute = {
  path: "/" | `/${string}/`;
  body: string;
  stylesheet?: string;
  metadata: LandingPageMetadata;
};

export type LandingPageRoute = LandingPageEntryRoute | LandingPageBodyRoute;

export type LandingPageConfig = {
  routes: readonly LandingPageRoute[];
  allow?: readonly string[];
  publicDir?: string;
  styles?: readonly string[];
};

/** Declares a consumer-owned site without exposing a Vite configuration. */
export function defineLandingPage(
  config: LandingPageConfig,
): LandingPageConfig {
  if (config.routes.length === 0) {
    throw new Error("LandingPageConfig must declare at least one route.");
  }
  for (const route of config.routes) assertRoute(route);
  return config;
}
