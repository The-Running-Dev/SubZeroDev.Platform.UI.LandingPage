export type LandingPageMetadata = {
  title: string;
  description: string;
  canonicalUrl?: string;
  repositoryUrl?: string;
  socialImageUrl?: string;
};

export type LandingPageRoute = {
  path: "/" | `/${string}/`;
  entry: string;
  metadata: LandingPageMetadata;
  hydrate?: boolean;
};

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
  return config;
}
