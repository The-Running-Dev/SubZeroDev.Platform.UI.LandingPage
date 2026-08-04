import { access, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild, createServer } from "vite";
import { tsImport } from "tsx/esm/api";
import type { LandingPageConfig } from "./index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadAdapter(path: string): Promise<LandingPageConfig> {
  const value = (await tsImport(pathToFileURL(path).href, import.meta.url)) as {
    default?: LandingPageConfig | { default?: LandingPageConfig };
  };
  const candidate =
    value.default && "default" in value.default
      ? value.default.default
      : value.default;
  if (!candidate || !Array.isArray((candidate as LandingPageConfig).routes))
    throw new Error(
      `Adapter '${path}' must have a default export from defineLandingPage().`,
    );
  return candidate as LandingPageConfig;
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

function html(
  route: LandingPageConfig["routes"][number],
  root: string,
): string {
  const entry = `/${relative(root, resolve(root, route.entry)).replaceAll("\\", "/")}`;
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
        `<link rel="${icon.rel}" href="${escapeHtml(icon.href)}"${icon.type ? ` type="${escapeHtml(icon.type)}"` : ""}${icon.sizes ? ` sizes="${escapeHtml(icon.sizes)}"` : ""}>`,
    )
    .join("");
  const themeColor = metadata.themeColor
    ? `<meta name="theme-color" content="${escapeHtml(metadata.themeColor)}">`
    : "";
  const noScript = metadata.noScript
    ? `<noscript>${escapeHtml(metadata.noScript)}</noscript>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(metadata.title)}</title><meta name="description" content="${escapeHtml(metadata.description)}">${canonical}${image}${openGraph}${twitter}${themeColor}${icons}</head><body><div id="root"></div>${noScript}<script type="module" src="${entry}"></script></body></html>`;
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
  const siteRoot = dirname(adapterPath);
  const temporary = join(siteRoot, `.szd-tmp-${process.pid}`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    const input: Record<string, string> = {};
    for (const route of config.routes) {
      const output = outputEntry(route.path);
      const entryFile = join(temporary, output);
      await mkdir(dirname(entryFile), { recursive: true });
      await writeFile(entryFile, html(route, siteRoot), "utf8");
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
