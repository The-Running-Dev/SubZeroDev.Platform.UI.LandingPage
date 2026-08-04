import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAdapter } from "../src/adapter.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("custom adapter", () => {
  it("builds distinct static routes from a TypeScript adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }, { path: "/roadmap/", entry: "src/roadmap.ts", metadata: { title: "Roadmap", description: "Roadmap page" } } ] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    await writeFile(
      join(site, "src", "roadmap.ts"),
      "document.querySelector('#root')!.textContent = 'roadmap';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    expect(await readFile(join(outDir, "index.html"), "utf8")).toContain(
      "Home",
    );
    expect(
      await readFile(join(outDir, "roadmap", "index.html"), "utf8"),
    ).toContain("Roadmap");
  });
});
