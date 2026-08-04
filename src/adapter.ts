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

function html(
  route: LandingPageConfig["routes"][number],
  root: string,
): string {
  const entry = `/${relative(root, resolve(root, route.entry)).replaceAll("\\", "/")}`;
  const canonical = route.metadata.canonicalUrl
    ? `<link rel="canonical" href="${route.metadata.canonicalUrl}">`
    : "";
  const image = route.metadata.socialImageUrl
    ? `<meta property="og:image" content="${route.metadata.socialImageUrl}">`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${route.metadata.title}</title><meta name="description" content="${route.metadata.description}">${canonical}${image}</head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`;
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
