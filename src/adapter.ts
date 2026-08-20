import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild, createServer, type PluginOption } from "vite";
import { tsImport } from "tsx/esm/api";
import type { LandingPageConfig, LandingPageDataConfig } from "./index.js";
import type { SourceMap } from "subzerodev-data-json";
import { assertRoute, assertUniquePaths, isBodyRoute } from "./route.js";
import { assertWithinOrThrow, assertWithinResolved } from "./paths.js";

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

type SiteStyle = { href: string; content: Buffer; relativePath: string };

/**
 * Reads every declared site-wide stylesheet before anything is written, so a
 * path that cannot be read ends the build with no output directory written.
 *
 * A declared path is repository-relative and becomes both an output path and a
 * URL, so — as for a route path — one that a resolver treats as a traversal is
 * rejected rather than resolved: it would publish a file from outside the
 * repository and emit an href that leaves the output directory. The href is
 * built per segment so a path holding `#`, `?` or `%` addresses the file that
 * was written rather than a different one.
 */
async function readStyles(
  root: string,
  styles: readonly string[] | undefined,
): Promise<SiteStyle[]> {
  const result: SiteStyle[] = [];
  if (!styles?.length) return result;
  // Resolved once per call rather than once per declared stylesheet — `root`
  // is invariant across the whole loop, including across the many calls this
  // makes per request under `dev`.
  const realRoot = await realpath(root);
  for (const stylePath of styles) {
    const resolved = resolve(root, stylePath);
    // Checked before reading, when the path exists, so a stylesheet outside
    // the root is refused without buffering its content into memory first.
    // Left unchecked when the path doesn't exist (e.g. a dangling symlink) so
    // that case reaches the read below and reports as unreadable, not as an
    // escape.
    if (await exists(resolved)) {
      await assertWithinOrThrow(
        () =>
          assertWithinResolved(
            realRoot,
            resolved,
            `Site-wide stylesheet '${stylePath}'`,
          ),
        `Site-wide stylesheet '${stylePath}' resolves outside the repository root.`,
      );
    }
    let content: Buffer;
    try {
      content = await readFile(resolved);
    } catch (cause) {
      throw new Error(
        `Site-wide stylesheet '${stylePath}' could not be read.`,
        {
          cause,
        },
      );
    }
    const relativePath = relative(root, resolved).replaceAll("\\", "/");
    const href = `/assets/styles/${relativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
    result.push({ href, content, relativePath });
  }
  return result;
}

/**
 * Resolves the public directory Vite copies, staging the site-wide stylesheets
 * into a copy of it when any are declared. Writing them to the output directory
 * after the build instead would leave every emitted href unresolved at build
 * time — Vite warns once per stylesheet and validates none of them, so a href
 * naming a file that was never written would reach production silently.
 */
async function stagePublicDir(
  root: string,
  siteRoot: string,
  declared: string | undefined,
  styles: readonly SiteStyle[],
  temporary: string,
): Promise<string> {
  const publicDir = declared
    ? resolve(root, declared)
    : join(siteRoot, "public");
  if (styles.length === 0) return publicDir;
  const staged = join(temporary, ".public");
  await mkdir(staged, { recursive: true });
  if (await exists(publicDir))
    await cp(publicDir, staged, { recursive: true, force: true });
  for (const style of styles) {
    const target = join(
      staged,
      "assets",
      "styles",
      ...style.relativePath.split("/"),
    );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, style.content);
  }
  return staged;
}

/**
 * Refuses a consumer plugin's attempt to redirect build output away from the
 * caller-supplied `outDir`. The post-build copy step below trusts `outDir`
 * unconditionally, so a redirected build would either leave nothing there to
 * copy (an ENOENT) or, if something already exists at that path for unrelated
 * reasons, risk operating on it instead.
 */
function buildOutDirGuardPlugin(
  siteRoot: string,
  outDir: string,
): PluginOption {
  return {
    name: "szd-adapter-build-outdir-guard",
    enforce: "post",
    config(userConfig) {
      const configured = userConfig.build?.outDir;
      if (configured === undefined) return;
      if (resolve(siteRoot, configured) !== resolve(outDir))
        throw new Error(
          `A declared Vite plugin changed build.outDir to '${configured}'. Vite plugins may not redirect build output.`,
        );
    },
  };
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
    const publicDir = await stagePublicDir(
      root,
      siteRoot,
      config.publicDir,
      styles,
      temporary,
    );
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
      publicDir,
      plugins: [
        ...(config.plugins ?? []),
        buildOutDirGuardPlugin(siteRoot, outDir),
      ],
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

function normalizeFsPath(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function widenedAllowError(extra: readonly string[]): Error {
  return new Error(
    `A declared Vite plugin widened server.fs.allow with: ${extra.join(", ")}. Widen the adapter's own 'allow' field instead.`,
  );
}

/**
 * Refuses a consumer plugin's attempt to widen `server.fs.allow`, or disable
 * `server.fs.strict` (the flag that makes `allow` mean anything), beyond what
 * the adapter itself resolved.
 *
 * A plugin can declare either through its `config()` hook, or — since Vite
 * never freezes the resolved config — by mutating the already-resolved server
 * directly from its own `configureServer` hook, after config resolution has
 * run. Both are checked here:
 *
 * `config()` runs with `enforce: "post"`, after every other plugin's `config`
 * hook — including a consumer's own `enforce: "post"` plugin, since Vite
 * preserves array order within an enforce tier — so it sees the fully merged
 * allow list Vite would otherwise use, before Vite's own defaulting (which
 * adds entries such as its client directory) runs. Throwing here rejects
 * `createServer` outright for a widening declared through `config()`.
 *
 * `configureServer` also runs `enforce: "post"`, so — by the same ordering —
 * it runs after every other plugin's `configureServer`, including one that
 * mutates the resolved server directly. It compares the live server against
 * the snapshot taken in `configResolved`, which fires once resolution
 * (including Vite's own defaulting) has completed but before any
 * `configureServer` hook runs, and closes the server before it listens if the
 * live state has drifted from that snapshot.
 */
function fsAllowGuardPlugin(allowed: readonly string[]): PluginOption {
  const normalizedAllowed = allowed.map(normalizeFsPath);
  let trusted: { allow: readonly string[]; strict: boolean | undefined };
  return {
    name: "szd-adapter-fs-allow-guard",
    enforce: "post",
    config(userConfig) {
      const configured = (userConfig.server?.fs?.allow ?? []).map(
        normalizeFsPath,
      );
      const extra = configured.filter(
        (entry) => !normalizedAllowed.includes(entry),
      );
      if (extra.length > 0) throw widenedAllowError(extra);
      if (userConfig.server?.fs?.strict === false)
        throw new Error(
          "A declared Vite plugin disabled server.fs.strict, which enforces the fs.allow list.",
        );
    },
    configResolved(resolvedConfig) {
      trusted = {
        allow: resolvedConfig.server.fs.allow.map(normalizeFsPath),
        strict: resolvedConfig.server.fs.strict,
      };
    },
    configureServer(server) {
      const fs = server.config.server.fs;
      if (fs.strict === false && trusted.strict !== false)
        throw new Error(
          "A declared Vite plugin disabled server.fs.strict, which enforces the fs.allow list.",
        );
      const extra = (fs.allow ?? [])
        .map(normalizeFsPath)
        .filter((entry) => !trusted.allow.includes(entry));
      if (extra.length > 0) throw widenedAllowError(extra);
    },
  };
}

/**
 * Serves an adapter site through Vite. `adapter` doubles as the path this
 * derives the site root from — a Vite entry path is resolved relative to it —
 * and, when `resolved` is absent, the module this reloads and re-validates per
 * request. `resolved` supplies an already-composed configuration instead: a
 * data-backed adapter's, whose routes exist only once its declared sources have
 * resolved, or a map-selected adapter-family site's, whose routes come from the
 * JSON model rather than from any adapter file (`adapter` then names the
 * source map, so its directory is the site root `build` used for the same
 * site). Either way the route middleware holds the given configuration instead
 * of reloading it per request — reloading would mean re-resolving (and
 * refetching) every declared source on every navigation. `runtimeMap`, given
 * only alongside `resolved`, is the prefetched map `build` writes for the same
 * site; passed to `html` per route so a data-backed entry route emits
 * `#szd-json-sources` byte-identical to built output (UI10.7). `filteredMap`
 * runs whether or not it was given, exactly as the build runs it, so a route
 * declaring `dataSourceIds` with no map ends the request here rather than
 * serving a document `build` refuses to write.
 */
export async function devAdapter(
  root: string,
  adapter: string,
  resolved?: LandingPageConfig,
  runtimeMap?: SourceMap,
): Promise<import("vite").ViteDevServer> {
  const adapterPath = resolve(root, adapter);
  const config = resolved ?? (await loadAdapter(adapterPath));
  // `loadAdapter` already validates a freshly-loaded config's routes
  // (`assertRoute`, but not `assertUniquePaths`); a `resolved` config was
  // composed elsewhere and has been validated by neither, so both run here —
  // the site `dev` serves must reject exactly what `build` would.
  if (resolved) for (const route of resolved.routes) assertRoute(route);
  assertUniquePaths(config.routes);
  const siteRoot = dirname(adapterPath);
  const allowed = [
    siteRoot,
    ...(config.allow ?? []).map((item) => resolve(root, item)),
  ];
  const server = await createServer({
    root: siteRoot,
    configFile: false,
    // Resolved exactly as `stagePublicDir` resolves it for the build, so a
    // declared public directory is served here too; left unset otherwise, where
    // Vite's own default is already the `<siteRoot>/public` the build uses.
    ...(config.publicDir ? { publicDir: resolve(root, config.publicDir) } : {}),
    server: { fs: { allow: allowed } },
    plugins: [
      {
        name: "szd-adapter-dev-routes",
        configureServer(devServer) {
          // Registered directly (not returned) so this runs before Vite's
          // built-in middlewares, which would otherwise 404 first: neither "/"
          // nor a route path like "/roadmap/" names a file on disk, and neither
          // does a site-wide stylesheet's emitted href.
          devServer.middlewares.use(async (request, response, next) => {
            if (request.method !== "GET" && request.method !== "HEAD") {
              next();
              return;
            }
            const pathname = new URL(request.url ?? "/", "http://localhost")
              .pathname;
            try {
              const current = resolved ?? (await loadAdapter(adapterPath));
              if (!resolved) assertUniquePaths(current.routes);
              const styles = await readStyles(root, current.styles);
              // Answered from the bytes `readStyles` already read and
              // contained, so a declared stylesheet outside the site root
              // reaches the browser without widening `server.fs.allow` — which
              // stays exactly the site root plus the resolved `allow` entries
              // (design/20-contract.md, "Consumer Vite plugins").
              const style = styles.find(
                (candidate) => candidate.href === pathname,
              );
              if (style) {
                response.setHeader("Content-Type", "text/css; charset=utf-8");
                response.end(style.content);
                return;
              }
              const routePath =
                pathname === "/" || pathname.endsWith("/")
                  ? pathname
                  : `${pathname}/`;
              const route = current.routes.find(
                (candidate) => candidate.path === routePath,
              );
              if (!route) {
                next();
                return;
              }
              const document = await devServer.transformIndexHtml(
                request.url ?? "/",
                html(
                  route,
                  siteRoot,
                  styles.map((candidate) => candidate.href),
                  filteredMap(route, runtimeMap),
                ),
              );
              response.setHeader("Content-Type", "text/html");
              response.end(document);
            } catch (error) {
              next(error as Error);
            }
          });
        },
      },
      ...(config.plugins ?? []),
      fsAllowGuardPlugin(allowed),
    ],
  });
  await server.listen();
  server.printUrls();
  return server;
}
