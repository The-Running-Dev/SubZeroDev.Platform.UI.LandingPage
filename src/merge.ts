import { access, cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fingerprint(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for (const item of await readdir(directory)) {
      const path = join(directory, item);
      const info = await stat(path);
      if (info.isDirectory()) await visit(path);
      else
        files.set(
          relative(root, path).replaceAll("\\", "/"),
          createHash("sha256")
            .update(await readFile(path))
            .digest("hex"),
        );
    }
  }
  await visit(root);
  return files;
}

function compare(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => before.get(key) !== after.get(key)).sort();
}

export async function mergeLanding(
  landingDist: string,
  docsOutput: string,
  protectedPath = "docs",
): Promise<void> {
  const landing = resolve(landingDist);
  const target = resolve(docsOutput);
  const docs = join(target, protectedPath);
  if (!(await exists(join(landing, "index.html"))))
    throw new Error(`Landing build at '${landing}' has no index.html.`);
  if (!(await exists(docs)))
    throw new Error(
      `Documentation output '${target}' has no protected '${protectedPath}' subtree.`,
    );
  const before = await fingerprint(docs);
  await cp(join(landing, "index.html"), join(target, "index.html"), {
    force: true,
  });
  for (const item of await readdir(landing)) {
    if (item === "index.html") continue;
    const source = join(landing, item);
    const destination = join(target, item);
    if (item === protectedPath)
      throw new Error(
        `Landing build must not contain protected path '${protectedPath}'.`,
      );
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
  }
  const after = await fingerprint(docs);
  const changed = compare(before, after);
  if (changed.length)
    throw new Error(
      `Landing merge changed protected '${protectedPath}' content: ${changed.join(", ")}`,
    );
}
