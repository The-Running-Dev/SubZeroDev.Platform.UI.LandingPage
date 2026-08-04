import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeLanding } from "../src/merge.js";

const roots: string[] = [];
async function setup(): Promise<{
  root: string;
  landing: string;
  docs: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "szd-merge-"));
  roots.push(root);
  const landing = join(root, "landing");
  const docs = join(root, "docs-output");
  await mkdir(join(landing, "assets"), { recursive: true });
  await mkdir(join(docs, "docs"), { recursive: true });
  await writeFile(join(landing, "index.html"), "landing");
  await writeFile(join(landing, "assets", "site.css"), "css");
  await writeFile(join(docs, "index.html"), "old");
  await writeFile(join(docs, "docs", "page.html"), "safe");
  return { root, landing, docs };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
describe("merge", () => {
  it("overlays landing assets without changing protected documentation", async () => {
    const { landing, docs } = await setup();
    await mergeLanding(landing, docs);
    expect(await readFile(join(docs, "index.html"), "utf8")).toBe("landing");
    expect(await readFile(join(docs, "docs", "page.html"), "utf8")).toBe(
      "safe",
    );
  });
  it("rejects a source that carries the protected path", async () => {
    const { landing, docs } = await setup();
    await mkdir(join(landing, "docs"));
    await expect(mergeLanding(landing, docs)).rejects.toThrow(
      "must not contain protected path",
    );
  });
});
