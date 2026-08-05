import type {
  LandingPageBodyRoute,
  LandingPageEntryRoute,
  LandingPageRoute,
} from "./index.js";

type RouteFields = Partial<LandingPageEntryRoute & LandingPageBodyRoute>;

/** A `<style>` element ends at this string, so CSS carrying it escapes the head. */
const styleEnd = /<\/style/i;

export function isBodyRoute(
  route: LandingPageRoute,
): route is LandingPageBodyRoute {
  return typeof (route as RouteFields).body === "string";
}

/** Rejects a route that declares neither route form, both, or a misplaced stylesheet. */
export function assertRoute(route: LandingPageRoute): void {
  const fields = route as RouteFields;
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
