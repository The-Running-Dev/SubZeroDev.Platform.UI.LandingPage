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
  it("builds distinct static routes with their complete static head contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page", canonicalUrl: "https://example.test/", openGraph: { title: "Home social", description: "Home social description", type: "website", url: "https://example.test/", imageUrl: "https://example.test/og.png", imageWidth: 1200, imageHeight: 630 }, twitter: { card: "summary_large_image", imageUrl: "https://example.test/og.png" }, icons: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }, { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" }], themeColor: "#f3f4f6", noScript: "JavaScript is required." } }, { path: "/roadmap/", entry: "src/roadmap.ts", metadata: { title: "Roadmap", description: "Roadmap page" } } ] };`,
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
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain("<title>Home</title>");
    expect(home).toContain('property="og:title" content="Home social"');
    expect(home).toContain('property="og:image:width" content="1200"');
    expect(home).toContain('name="twitter:card" content="summary_large_image"');
    expect(home).toContain(
      'rel="apple-touch-icon" href="/apple-touch-icon.png"',
    );
    expect(home).toContain('name="theme-color" content="#f3f4f6"');
    expect(home).toContain("<noscript>JavaScript is required.</noscript>");
    expect(
      await readFile(join(outDir, "roadmap", "index.html"), "utf8"),
    ).toContain("Roadmap");
  });

  it("omits optional static-head elements rather than inventing defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).not.toContain("og:title");
    expect(home).not.toContain("twitter:card");
    expect(home).not.toContain("theme-color");
    expect(home).not.toContain("<noscript>");
  });
});
