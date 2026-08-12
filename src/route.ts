import type {
  LandingPageBodyRoute,
  LandingPageEntryRoute,
  LandingPageRoute,
} from "./index.js";

type RouteFields = Partial<LandingPageEntryRoute & LandingPageBodyRoute>;

/** A `<style>` element ends at this string, so CSS carrying it escapes the head. */
const styleEnd = /<\/style/i;

/**
 * A route path becomes a filesystem path under the generated entry directory,
 * so a segment that a path resolver treats as a traversal, or that carries a
 * separator in any encoding, would write the document outside that directory.
 * The allowed segment excludes `%`, so no percent-escape survives to decode.
 */
const segment = /^[A-Za-z0-9._-]+$/;

/** Rejects a route path that does not name exactly one directory per segment. */
export function assertRoutePath(path: unknown): void {
  if (typeof path !== "string" || !path.startsWith("/") || !path.endsWith("/"))
    throw new Error(
      `Route path '${String(path)}' must start and end with '/'.`,
    );
  if (path === "/") return;
  for (const part of path.slice(1, -1).split("/"))
    if (!segment.test(part) || part === "." || part === "..")
      throw new Error(`Route path '${path}' has an invalid segment '${part}'.`);
}

export function isBodyRoute(
  route: LandingPageRoute,
): route is LandingPageBodyRoute {
  return typeof (route as RouteFields).body === "string";
}

/** Rejects a route set in which two routes would generate one output document. */
export function assertUniquePaths(routes: readonly LandingPageRoute[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.path))
      throw new Error(`Duplicate route path '${route.path}'.`);
    seen.add(route.path);
  }
}

/** Rejects a route that declares neither route form, both, or a misplaced stylesheet. */
export function assertRoute(route: LandingPageRoute): void {
  const fields = route as RouteFields;
  assertRoutePath(fields.path);
  const entry = typeof fields.entry === "string";
  const body = typeof fields.body === "string";
  if (entry === body)
    throw new Error(
      `Route '${fields.path}' must declare exactly one of 'entry' and 'body'.`,
    );
  if (fields.stylesheet === undefined) return;
  if (entry)
    throw new Error(
      `Route '${fields.path}' declares 'stylesheet' with 'entry'; a stylesheet belongs to a body route.`,
    );
  if (styleEnd.test(fields.stylesheet))
    throw new Error(
      `Route '${fields.path}' declares a stylesheet containing '</style'.`,
    );
}
