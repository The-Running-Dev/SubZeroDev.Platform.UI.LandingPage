import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, resolve, sep } from "node:path";
import { assertWithin } from "./paths.js";

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
 * Resolves a request pathname to a candidate path under `root`. Percent-decoded
 * once before resolution, so a `..` segment — literal or percent-escaped — can
 * never escape `root` lexically; containment against a symlinked candidate is
 * decided by `resolveTarget`, through `assertWithin`.
 */
function resolveWithinRoot(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  return resolve(root, `.${decoded}`);
}

/**
 * Resolves a request pathname to a path inside `root`, or `undefined` when the
 * candidate — after any directory-index rewrite — cannot be read (it does not
 * exist) or resolves outside `root` through a symlink. `assertWithin` decides
 * containment for every case; nothing here compares paths itself (**C33**).
 */
async function resolveTarget(
  root: string,
  pathname: string,
): Promise<string | undefined> {
  const candidate = resolveWithinRoot(root, pathname);
  if (!candidate) return undefined;
  let target = candidate;
  if (pathname.endsWith("/")) {
    target = join(candidate, "index.html");
  } else {
    const stats = await stat(candidate).catch(() => undefined);
    if (stats?.isDirectory()) target = join(candidate, "index.html");
  }
  try {
    await assertWithin(root, target, "Requested path");
  } catch {
    return undefined;
  }
  return target;
}

/**
 * Cuts a request target down to its pathname. The target is a path, not a URL:
 * resolving it against a base would read a leading `//` as an authority, which
 * both swallows the first segment and throws `ERR_INVALID_URL` when what
 * follows is not a host — `GET //` would end the process rather than answer.
 * Cutting at the first `?` or `#` is what keeps a query or a fragment off the
 * filesystem, and leaves percent-encoding for `resolveWithinRoot` to decode
 * exactly once.
 */
function pathnameOf(requestTarget: string | undefined): string {
  const target = requestTarget ?? "/";
  const end = target.search(/[?#]/);
  const pathname = end === -1 ? target : target.slice(0, end);
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
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
    void (async () => {
      const target = await resolveTarget(root, pathnameOf(request.url));
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
