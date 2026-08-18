import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild, createServer } from "vite";
import { tsImport } from "tsx/esm/api";
import type { LandingPageConfig, LandingPageDataConfig } from "./index.js";
import type { SourceMap } from "subzerodev-data-json";
import { assertRoute, assertUniquePaths, isBodyRoute } from "./route.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

type AdapterExport = LandingPageConfig | LandingPageDataConfig<unknown>;

/**
 * A data-backed adapter is recognised structurally rather than by a marker
 * field, so a configuration written as a plain object literal — with no import
 * of this package — is detected exactly as one built by `defineLandingPageData`.
 */
export function isDataBacked(
  value: AdapterExport,
): value is LandingPageDataConfig<unknown> {
  const candidate = value as Partial<LandingPageDataConfig<unknown>>;
  return (
    typeof candidate.config === "function" &&
    typeof candidate.sources === "object" &&
    candidate.sources !== null
  );
}

/** Loads the adapter module's default export in either of its two forms. */
export async function loadAdapterExport(path: string): Promise<AdapterExport> {
  const adapterUrl = pathToFileURL(path).href;
  const value = (await tsImport(adapterUrl, adapterUrl)) as {
    default?: AdapterExport | { default?: AdapterExport };
  };
  const candidate = (
    value.default && "default" in value.default
      ? value.default.default
      : value.default
  ) as AdapterExport | undefined;
  if (!candidate)
    throw new Error(
      `Adapter '${path}' must have a default export from defineLandingPage() or defineLandingPageData().`,
    );
  if (isDataBacked(candidate)) return candidate;
  if (!Array.isArray((candidate as LandingPageConfig).routes))
    throw new Error(
      `Adapter '${path}' must have a default export from defineLandingPage() or defineLandingPageData().`,
    );
  return candidate;
}

async function loadAdapter(path: string): Promise<LandingPageConfig> {
  const candidate = await loadAdapterExport(path);
  if (isDataBacked(candidate))
    throw new Error(
      `Adapter '${path}' declares build-time data sources, which need a JSON source map.`,
    );
  for (const route of candidate.routes) assertRoute(route);
  return candidate;
}

function outputEntry(path: string): string {
  return path === "/" ? "index.html" : `${path.replace(/^\//, "")}index.html`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entity: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entity[character];
  });
}

function meta(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeHtml(content)}">`;
}

/** Not part of the package's public npm surface; exported for direct testing. */
export function html(
  route: LandingPageConfig["routes"][number],
  root: string,
  styleHrefs: readonly string[] = [],
  runtimeMap?: SourceMap,
): string {
  const { metadata } = route;
  const canonical = metadata.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">`
    : "";
  const image = metadata.socialImageUrl
    ? meta("og:image", metadata.socialImageUrl)
    : "";
  const openGraph = metadata.openGraph
    ? [
        meta("og:title", metadata.openGraph.title),
        meta("og:description", metadata.openGraph.description),
        meta("og:type", metadata.openGraph.type),
        meta("og:url", metadata.openGraph.url),
        metadata.openGraph.imageUrl
          ? meta("og:image", metadata.openGraph.imageUrl)
          : "",
        metadata.openGraph.imageWidth === undefined
          ? ""
          : meta("og:image:width", String(metadata.openGraph.imageWidth)),
        metadata.openGraph.imageHeight === undefined
          ? ""
          : meta("og:image:height", String(metadata.openGraph.imageHeight)),
      ].join("")
    : "";
  const twitter = metadata.twitter
    ? [
        `<meta name="twitter:card" content="${escapeHtml(metadata.twitter.card)}">`,
        metadata.twitter.imageUrl
          ? `<meta name="twitter:image" content="${escapeHtml(metadata.twitter.imageUrl)}">`
          : "",
      ].join("")
    : "";
  const icons = (metadata.icons ?? [])
    .map(
      (icon) =>
        `<link rel="${escapeHtml(icon.rel)}" href="${escapeHtml(icon.href)}"${icon.type ? ` type="${escapeHtml(icon.type)}"` : ""}${icon.sizes ? ` sizes="${escapeHtml(icon.sizes)}"` : ""}>`,
    )
    .join("");
  const themeColor = metadata.themeColor
    ? `<meta name="theme-color" content="${escapeHtml(metadata.themeColor)}">`
    : "";
  const noScript = metadata.noScript
    ? `<noscript>${escapeHtml(metadata.noScript)}</noscript>`
    : "";
  const styleLinks = styleHrefs
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("");
  const stylesheet =
    isBodyRoute(route) && route.stylesheet !== undefined
      ? `<style>${route.stylesheet}</style>`
      : "";
  const body = isBodyRoute(route)
    ? `${route.body}${noScript}`
    : `<div id="root"></div>${noScript}${runtimeMap ? `<script type="application/json" id="szd-json-sources">${JSON.stringify(runtimeMap).replaceAll("<", "\\u003c")}</script>` : ""}<script type="module" src="/${escapeHtml(relative(root, resolve(root, route.entry)).replaceAll("\\", "/"))}"></script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(metadata.title)}</title><meta name="description" content="${escapeHtml(metadata.description)}">${canonical}${image}${openGraph}${twitter}${themeColor}${icons}${styleLinks}${stylesheet}</head><body>${body}</body></html>`;
}

export async function hasAdapter(
  root: string,
  adapter: string,
): Promise<boolean> {
  return exists(resolve(root, adapter));
}

export async function buildAdapter(
  root: string,
  adapter: string,
  outDir: string,
): Promise<void> {
  const adapterPath = resolve(root, adapter);
  const config = await loadAdapter(adapterPath);
  await buildAdapterConfig(root, dirname(adapterPath), config, outDir);
}

function filteredMap(
  route: LandingPageConfig["routes"][number],
  map: SourceMap | undefined,
): SourceMap | undefined {
  if (isBodyRoute(route) || route.dataSourceIds === undefined) return undefined;
  if (!map)
    throw new Error(
      `Route '${route.path}' declares dataSourceIds without a JSON source map.`,
    );
  const sources: Record<string, SourceMap["sources"][string]> = {};
  for (const id of route.dataSourceIds) {
    const source = map.sources[id];
    if (!source)
      throw new Error(
        `Route '${route.path}' declares unknown data source '${id}'.`,
      );
    if ("path" in source && source.at === "runtime")
      throw new Error(
        `Route '${route.path}' declares runtime file source '${id}'.`,
      );
    sources[id] = source;
  }
  return { version: 1, sources };
}

type SiteStyle = { href: string; content: Buffer };

/**
 * Reads every declared site-wide stylesheet before anything is written, so a
 * path that cannot be read ends the build with no output directory written.
 */
async function readStyles(
  root: string,
  styles: readonly string[] | undefined,
): Promise<SiteStyle[]> {
  const result: SiteStyle[] = [];
  for (const stylePath of styles ?? []) {
    const resolved = resolve(root, stylePath);
    let content: Buffer;
    try {
      content = await readFile(resolved);
    } catch {
      throw new Error(`Site-wide stylesheet '${stylePath}' could not be read.`);
    }
    const relativePath = relative(root, resolved).replaceAll("\\", "/");
    result.push({ href: `/assets/styles/${relativePath}`, content });
  }
  return result;
}

export async function buildAdapterConfig(
  root: string,
  siteRoot: string,
  config: LandingPageConfig,
  outDir: string,
  runtimeSourceMap?: SourceMap,
): Promise<void> {
  for (const route of config.routes) assertRoute(route);
  assertUniquePaths(config.routes);
  const styles = await readStyles(root, config.styles);
  const styleHrefs = styles.map((style) => style.href);
  const temporary = join(siteRoot, `.szd-tmp-${process.pid}`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    const input: Record<string, string> = {};
    for (const route of config.routes) {
      const output = outputEntry(route.path);
      const entryFile = join(temporary, output);
      // `assertRoutePath` already rejects every traversal form; this refuses to
      // write at all if a later path form ever escapes the generated directory.
      if (relative(temporary, entryFile).startsWith(".."))
        throw new Error(
          `Route '${route.path}' would write outside the generated entry directory.`,
        );
      await mkdir(dirname(entryFile), { recursive: true });
      await writeFile(
        entryFile,
        html(route, siteRoot, styleHrefs, filteredMap(route, runtimeSourceMap)),
        "utf8",
      );
      input[output.replaceAll("/", "_").replace(/\.html$/, "")] = entryFile;
    }
    await viteBuild({
      root: siteRoot,
      configFile: false,
      publicDir: config.publicDir
        ? resolve(root, config.publicDir)
        : join(siteRoot, "public"),
      build: { outDir, emptyOutDir: false, rollupOptions: { input } },
    });
    const emitted = join(outDir, basename(temporary));
    for (const item of await readdir(emitted)) {
      await cp(join(emitted, item), join(outDir, item), {
        recursive: true,
        force: true,
      });
    }
    await rm(emitted, { recursive: true, force: true });
    for (const style of styles) {
      const target = join(outDir, ...style.href.split("/").filter(Boolean));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, style.content);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function devAdapter(root: string, adapter: string): Promise<void> {
  const config = await loadAdapter(resolve(root, adapter));
  const siteRoot = dirname(resolve(root, adapter));
  const allowed = [
    siteRoot,
    ...(config.allow ?? []).map((item) => resolve(root, item)),
  ];
  const server = await createServer({
    root: siteRoot,
    configFile: false,
    server: { fs: { allow: allowed } },
  });
  await server.listen();
  server.printUrls();
}
