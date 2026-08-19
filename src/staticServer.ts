import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, resolve, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf(sep);
  if (dot <= slash) return DEFAULT_CONTENT_TYPE;
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * Resolves a request pathname to a path inside `root`, or `undefined` when it
 * decodes to something outside it. Percent-decoded once before resolution, so
 * a `..` segment — literal or percent-escaped — can never escape `root`.
 */
function resolveWithinRoot(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const target = resolve(root, `.${decoded}`);
  const boundary = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(boundary)) return undefined;
  return target;
}

async function resolveTarget(
  root: string,
  pathname: string,
): Promise<string | undefined> {
  const target = resolveWithinRoot(root, pathname);
  if (!target) return undefined;
  if (pathname.endsWith("/")) return join(target, "index.html");
  const stats = await stat(target).catch(() => undefined);
  if (stats?.isDirectory()) return join(target, "index.html");
  return target;
}

/**
 * Serves an already-built site directory over `node:http`. `preview` and
 * generic `dev` share this implementation (design/20-contract.md, "Serving
 * built output") so the two can never diverge on resolution, containment, or
 * content type — the built tree is the artifact that ships.
 */
export function createStaticServer(outDir: string): Server {
  const root = resolve(outDir);
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    void (async () => {
      const target = await resolveTarget(root, url.pathname);
      const data = target
        ? await readFile(target).catch(() => undefined)
        : undefined;
      if (!data || !target) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": contentTypeFor(target) });
      response.end(data);
    })();
  });
}
