import type { Validator } from "subzerodev-data-json";
import type { PluginOption } from "vite";
import { assertRoute, assertUniquePaths } from "./route.js";

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
  plugins?: readonly PluginOption[];
};

/**
 * One declared build-time source and the validator that gives it a type. The
 * validator is required, not optional: `T` is the consumer's claim about JSON
 * the package never authored, and an unchecked cast would make the type a lie.
 */
export type LandingPageDataSource<T> = {
  id: string;
  validate: Validator<T>;
};

/** One declared source per key of `T`, each carrying that key's validator. */
export type LandingPageDataSources<T> = {
  [K in keyof T]: LandingPageDataSource<T[K]>;
};

/**
 * A site whose routes are composed from build-time data. The package resolves
 * and validates the declared sources and owns nothing about their shape; `T` is
 * the consumer's, and so is `config`.
 */
export type LandingPageDataConfig<T> = {
  sources: LandingPageDataSources<T>;
  config: (data: T) => LandingPageConfig;
};

/**
 * Declares a site composed from validated build-time JSON. Selected over the
 * root `LandingPageData` model when a source map and an adapter module both
 * exist, because such an adapter is itself that data's consumer.
 */
export function defineLandingPageData<T>(
  sources: LandingPageDataSources<T>,
  config: (data: T) => LandingPageConfig,
): LandingPageDataConfig<T> {
  const ids = Object.values(sources) as LandingPageDataSource<unknown>[];
  if (ids.length === 0)
    throw new Error("LandingPageDataConfig must declare at least one source.");
  for (const source of ids)
    if (
      typeof source?.id !== "string" ||
      typeof source?.validate !== "function"
    )
      throw new Error(
        "Every LandingPageDataConfig source needs a string 'id' and a 'validate' function.",
      );
  return { sources, config };
}

/** Declares a consumer-owned site without exposing a Vite configuration. */
export function defineLandingPage(
  config: LandingPageConfig,
): LandingPageConfig {
  if (config.routes.length === 0) {
    throw new Error("LandingPageConfig must declare at least one route.");
  }
  for (const route of config.routes) assertRoute(route);
  assertUniquePaths(config.routes);
  return config;
}
