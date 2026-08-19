import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveFrom(root: string, value: string): string {
  return resolve(root, value);
}

export function isWithin(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  );
}

/**
 * Checks containment against an already-resolved `realParent`, so a caller
 * that would otherwise re-resolve the same root on every call in a loop or
 * per request can resolve it once and reuse it here.
 */
export async function assertWithinResolved(
  realParent: string,
  candidate: string,
  label: string,
): Promise<void> {
  const actualCandidate = await realpath(candidate);
  if (!isWithin(realParent, actualCandidate)) {
    throw new Error(`${label} must stay within '${realParent}'.`);
  }
}

export async function assertWithin(
  parent: string,
  candidate: string,
  label: string,
): Promise<void> {
  const actualParent = await realpath(parent);
  await assertWithinResolved(actualParent, candidate, label);
}

/** Runs `check`, rethrowing any failure as a new `Error(message, { cause })`. */
export async function assertWithinOrThrow(
  check: () => Promise<void>,
  message: string,
): Promise<void> {
  try {
    await check();
  } catch (cause) {
    throw new Error(message, { cause });
  }
}
