import type {
  LandingPageConfig,
  LandingPageEntryRoute,
  LandingPageMetadata,
} from "./index.js";
import { assertRoute, assertUniquePaths } from "./route.js";

export type LandingPageMarkdown = {
  markdown: string;
  assetBase?: string;
};

export type GenericLandingPageData = {
  version: 1;
  kind: "generic";
  home: LandingPageMarkdown;
  supplemental?: LandingPageMarkdown;
  changelog: LandingPageMarkdown;
  title?: string;
  description?: string;
  repositoryUrl?: string;
  canonicalUrl?: string;
  docsUrl?: string;
  themeCss?: string;
  publicDir?: string;
};

export type LandingPageDataRoute = LandingPageConfig["routes"][number] & {
  dataSourceIds?: readonly string[];
};

export type AdapterLandingPageData = {
  version: 1;
  kind: "adapter";
  allow?: readonly string[];
  publicDir?: string;
  routes: readonly LandingPageDataRoute[];
};

export type LandingPageData = GenericLandingPageData | AdapterLandingPageData;

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`LandingPageData ${label} must be an object.`);
  return value as RecordValue;
}

function keys(
  value: RecordValue,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Error(`LandingPageData ${label} has unknown field '${key}'.`);
}

function string(
  value: unknown,
  label: string,
  required = true,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string")
    throw new Error(`LandingPageData ${label} must be a string.`);
  return value;
}

function strings(
  value: unknown,
  label: string,
  required = false,
): readonly string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`LandingPageData ${label} must be an array of strings.`);
  return value;
}

function markdown(value: unknown, label: string): LandingPageMarkdown {
  const item = record(value, label);
  keys(item, ["markdown", "assetBase"], label);
  return {
    markdown: string(item.markdown, `${label}.markdown`)!,
    ...(item.assetBase === undefined
      ? {}
      : { assetBase: string(item.assetBase, `${label}.assetBase`)! }),
  };
}

function metadata(value: unknown, label: string): LandingPageMetadata {
  const item = record(value, label);
  keys(
    item,
    [
      "title",
      "description",
      "canonicalUrl",
      "repositoryUrl",
      "socialImageUrl",
      "openGraph",
      "twitter",
      "icons",
      "themeColor",
      "noScript",
    ],
    label,
  );
  if (typeof item.title !== "string" || typeof item.description !== "string")
    throw new Error(
      `LandingPageData ${label} requires string title and description.`,
    );
  for (const field of [
    "canonicalUrl",
    "repositoryUrl",
    "socialImageUrl",
    "themeColor",
    "noScript",
  ])
    if (item[field] !== undefined) string(item[field], `${label}.${field}`);
  if (item.openGraph !== undefined) {
    const openGraph = record(item.openGraph, `${label}.openGraph`);
    keys(
      openGraph,
      [
        "title",
        "description",
        "type",
        "url",
        "imageUrl",
        "imageWidth",
        "imageHeight",
      ],
      `${label}.openGraph`,
    );
    for (const field of ["title", "description", "type", "url"])
      string(openGraph[field], `${label}.openGraph.${field}`);
    for (const field of ["imageUrl"])
      if (openGraph[field] !== undefined)
        string(openGraph[field], `${label}.openGraph.${field}`);
    for (const field of ["imageWidth", "imageHeight"])
      if (
        openGraph[field] !== undefined &&
        typeof openGraph[field] !== "number"
      )
        throw new Error(
          `LandingPageData ${label}.openGraph.${field} must be a number.`,
        );
  }
  if (item.twitter !== undefined) {
    const twitter = record(item.twitter, `${label}.twitter`);
    keys(twitter, ["card", "imageUrl"], `${label}.twitter`);
    string(twitter.card, `${label}.twitter.card`);
    if (twitter.imageUrl !== undefined)
      string(twitter.imageUrl, `${label}.twitter.imageUrl`);
  }
  if (item.icons !== undefined) {
    if (!Array.isArray(item.icons))
      throw new Error(`LandingPageData ${label}.icons must be an array.`);
    item.icons.forEach((icon, index) => {
      const value = record(icon, `${label}.icons[${index}]`);
      keys(value, ["rel", "href", "type", "sizes"], `${label}.icons[${index}]`);
      if (value.rel !== "icon" && value.rel !== "apple-touch-icon")
        throw new Error(
          `LandingPageData ${label}.icons[${index}].rel is invalid.`,
        );
      string(value.href, `${label}.icons[${index}].href`);
      if (value.type !== undefined)
        string(value.type, `${label}.icons[${index}].type`);
      if (value.sizes !== undefined)
        string(value.sizes, `${label}.icons[${index}].sizes`);
    });
  }
  return item as unknown as LandingPageMetadata;
}

function route(value: unknown, index: number): LandingPageDataRoute {
  const item = record(value, `routes[${index}]`);
  keys(
    item,
    [
      "path",
      "entry",
      "body",
      "stylesheet",
      "metadata",
      "hydrate",
      "dataSourceIds",
    ],
    `routes[${index}]`,
  );
  const result = {
    ...item,
    metadata: metadata(item.metadata, `routes[${index}].metadata`),
    ...(item.dataSourceIds === undefined
      ? {}
      : {
          dataSourceIds: strings(
            item.dataSourceIds,
            `routes[${index}].dataSourceIds`,
          )!,
        }),
  } as LandingPageDataRoute;
  if (typeof item.path !== "string")
    throw new Error(`LandingPageData routes[${index}].path must be a string.`);
  if (item.entry !== undefined && typeof item.entry !== "string")
    throw new Error(`LandingPageData routes[${index}].entry must be a string.`);
  if (item.body !== undefined && typeof item.body !== "string")
    throw new Error(`LandingPageData routes[${index}].body must be a string.`);
  if (item.stylesheet !== undefined && typeof item.stylesheet !== "string")
    throw new Error(
      `LandingPageData routes[${index}].stylesheet must be a string.`,
    );
  if (item.hydrate !== undefined && typeof item.hydrate !== "boolean")
    throw new Error(
      `LandingPageData routes[${index}].hydrate must be a boolean.`,
    );
  assertRoute(result);
  if (
    "dataSourceIds" in result &&
    typeof (result as LandingPageEntryRoute).entry !== "string"
  )
    throw new Error(
      `LandingPageData routes[${index}] declares dataSourceIds on a body route.`,
    );
  return result;
}

export function validateLandingPageData(raw: unknown): LandingPageData {
  const item = record(raw, "root");
  if (item.version !== 1) throw new Error("LandingPageData version must be 1.");
  if (item.kind === "generic") {
    keys(
      item,
      [
        "version",
        "kind",
        "home",
        "supplemental",
        "changelog",
        "title",
        "description",
        "repositoryUrl",
        "canonicalUrl",
        "docsUrl",
        "themeCss",
        "publicDir",
      ],
      "generic",
    );
    return {
      version: 1,
      kind: "generic",
      home: markdown(item.home, "generic.home"),
      ...(item.supplemental === undefined
        ? {}
        : {
            supplemental: markdown(item.supplemental, "generic.supplemental"),
          }),
      changelog: markdown(item.changelog, "generic.changelog"),
      ...(item.title === undefined
        ? {}
        : { title: string(item.title, "generic.title")! }),
      ...(item.description === undefined
        ? {}
        : { description: string(item.description, "generic.description")! }),
      ...(item.repositoryUrl === undefined
        ? {}
        : {
            repositoryUrl: string(item.repositoryUrl, "generic.repositoryUrl")!,
          }),
      ...(item.canonicalUrl === undefined
        ? {}
        : { canonicalUrl: string(item.canonicalUrl, "generic.canonicalUrl")! }),
      ...(item.docsUrl === undefined
        ? {}
        : { docsUrl: string(item.docsUrl, "generic.docsUrl")! }),
      ...(item.themeCss === undefined
        ? {}
        : { themeCss: string(item.themeCss, "generic.themeCss")! }),
      ...(item.publicDir === undefined
        ? {}
        : { publicDir: string(item.publicDir, "generic.publicDir")! }),
    };
  }
  if (item.kind !== "adapter")
    throw new Error("LandingPageData kind must be 'generic' or 'adapter'.");
  keys(item, ["version", "kind", "allow", "publicDir", "routes"], "adapter");
  if (!Array.isArray(item.routes) || item.routes.length === 0)
    throw new Error(
      "LandingPageData adapter.routes must be a non-empty array.",
    );
  const routes = item.routes.map(route);
  assertUniquePaths(routes);
  return {
    version: 1,
    kind: "adapter",
    routes,
    ...(item.allow === undefined
      ? {}
      : { allow: strings(item.allow, "adapter.allow")! }),
    ...(item.publicDir === undefined
      ? {}
      : { publicDir: string(item.publicDir, "adapter.publicDir")! }),
  };
}
