import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export function resolveFrom(root: string, value: string): string {
  return resolve(root, value);
}

export function isWithin(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

export async function assertWithin(
  parent: string,
  candidate: string,
  label: string,
): Promise<void> {
  const [actualParent, actualCandidate] = await Promise.all([
    realpath(parent),
    realpath(candidate),
  ]);
  if (!isWithin(actualParent, actualCandidate)) {
    throw new Error(`${label} must stay within '${actualParent}'.`);
  }
}
