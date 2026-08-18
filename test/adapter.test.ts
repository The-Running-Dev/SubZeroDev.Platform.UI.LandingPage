import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAdapter, buildAdapterConfig, html } from "../src/adapter.js";

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

  it("emits a caller-supplied body with no script beside an entry route", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", body: "<main id=\\"supplied\\"><h1>Composed</h1></main>", stylesheet: "#supplied { color: rebeccapurple; }", metadata: { title: "Composed", description: "Composed page", themeColor: "#000000" } }, { path: "/app/", entry: "src/main.ts", metadata: { title: "App", description: "App page" } } ] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'app';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain('<main id="supplied"><h1>Composed</h1></main>');
    expect(home).toContain(
      "<style>#supplied { color: rebeccapurple; }</style>",
    );
    expect(home).toContain('name="theme-color" content="#000000"');
    expect(home).not.toContain('<div id="root">');
    expect(home).not.toContain("<script");
    expect(home).not.toContain('<link rel="stylesheet"');
    const app = await readFile(join(outDir, "app", "index.html"), "utf8");
    expect(app).toContain('<div id="root">');
    expect(app).toContain("<script");
  });

  it("builds a site whose routes are all bodies, with its public assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "public"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", body: "<main>Home</main>", metadata: { title: "Home", description: "Home page" } }, { path: "/legal/", body: "<main>Legal</main>", metadata: { title: "Legal", description: "Legal page" } } ] };`,
      "utf8",
    );
    await writeFile(
      join(site, "public", "robots.txt"),
      "User-agent: *\n",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    expect(await readFile(join(outDir, "index.html"), "utf8")).toContain(
      "<main>Home</main>",
    );
    expect(
      await readFile(join(outDir, "legal", "index.html"), "utf8"),
    ).toContain("<main>Legal</main>");
    expect(await readFile(join(outDir, "robots.txt"), "utf8")).toContain(
      "User-agent",
    );
  });

  it("rejects a route that declares both an entry and a body", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [{ path: "/", entry: "src/main.ts", body: "<p>both</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    await expect(
      buildAdapter(root, "site/landing.config.ts", join(site, "dist")),
    ).rejects.toThrow("exactly one of 'entry' and 'body'");
  });

  it("rejects a route that declares neither an entry nor a body", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [{ path: "/", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await expect(
      buildAdapter(root, "site/landing.config.ts", join(site, "dist")),
    ).rejects.toThrow("exactly one of 'entry' and 'body'");
  });

  it("rejects a stylesheet that would close the style element", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [{ path: "/", body: "<p>page</p>", stylesheet: "a {}</style><script>alert(1)</script>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await expect(
      buildAdapter(root, "site/landing.config.ts", join(site, "dist")),
    ).rejects.toThrow("containing '</style'");
  });

  it("rejects a stylesheet declared on an entry route", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [{ path: "/", entry: "src/main.ts", stylesheet: "a {}", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    await expect(
      buildAdapter(root, "site/landing.config.ts", join(site, "dist")),
    ).rejects.toThrow("belongs to a body route");
  });

  it("rejects unknown and runtime-file data sources before emitting an entry route", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    const config = {
      routes: [
        {
          path: "/",
          entry: "src/main.ts",
          dataSourceIds: ["missing", "runtime-file"],
          metadata: { title: "Home", description: "Home page" },
        },
      ],
    };
    await expect(
      buildAdapterConfig(root, site, config, join(site, "dist"), {
        version: 1,
        sources: {
          "runtime-file": {
            at: "runtime",
            path: "site/runtime.json",
            cache: "manual",
          },
        },
      }),
    ).rejects.toThrow("declares unknown data source 'missing'");
    await expect(
      buildAdapterConfig(
        root,
        site,
        {
          ...config,
          routes: [{ ...config.routes[0], dataSourceIds: ["runtime-file"] }],
        },
        join(site, "dist"),
        {
          version: 1,
          sources: {
            "runtime-file": {
              at: "runtime",
              path: "site/runtime.json",
              cache: "manual",
            },
          },
        },
      ),
    ).rejects.toThrow("declares runtime file source 'runtime-file'");
  });

  it("escapes an entry path so it cannot inject a second script element (UI5.1)", () => {
    const doc = html(
      {
        path: "/",
        entry: 'src/x"><script>alert(1)</script>',
        metadata: { title: "Home", description: "Home page" },
      },
      "/site",
    );
    expect(doc).toContain(
      'src="/src/x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(doc.match(/<script/g)?.length).toBe(1);
  });

  it("rejects a plain-object adapter declaring two routes at the same path, writing no output (UI5.2)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", entry: "src/a.ts", metadata: { title: "A", description: "A page" } }, { path: "/", entry: "src/b.ts", metadata: { title: "B", description: "B page" } } ] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "a.ts"), "export {};", "utf8");
    await writeFile(join(site, "src", "b.ts"), "export {};", "utf8");
    const outDir = join(site, "dist");
    await expect(
      buildAdapter(root, "site/landing.config.ts", outDir),
    ).rejects.toThrow("Duplicate route path '/'");
    await expect(
      readFile(join(outDir, "index.html"), "utf8"),
    ).rejects.toThrow();
  });

  it("emits no runtime data-source script on a body route, even alongside a source map (UI5.4)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    const config = {
      routes: [
        {
          path: "/",
          body: "<p>page</p>",
          metadata: { title: "Home", description: "Home page" },
        },
      ],
    };
    await buildAdapterConfig(root, site, config, join(site, "dist"), {
      version: 1,
      sources: {
        x: {
          at: "runtime",
          url: "https://example.test/x.json",
          cache: "manual",
        },
      },
    });
    const home = await readFile(join(site, "dist", "index.html"), "utf8");
    expect(home).not.toContain("szd-json-sources");
  });

  it("links every declared site-wide stylesheet on every route, before a body route's own style (UI7.1, UI7.2)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await mkdir(join(root, "site", "styles"), { recursive: true });
    await writeFile(join(root, "site", "styles", "base.css"), "body{}", "utf8");
    await writeFile(join(root, "site", "styles", "type.css"), "h1{}", "utf8");
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["site/styles/base.css", "site/styles/type.css"], routes: [ { path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }, { path: "/legal/", body: "<main>Legal</main>", stylesheet: "main { color: red; }", metadata: { title: "Legal", description: "Legal page" } } ] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const home = await readFile(join(outDir, "index.html"), "utf8");
    const baseIndex = home.indexOf(
      '<link rel="stylesheet" href="/assets/styles/site/styles/base.css">',
    );
    const typeIndex = home.indexOf(
      '<link rel="stylesheet" href="/assets/styles/site/styles/type.css">',
    );
    expect(baseIndex).toBeGreaterThan(-1);
    expect(typeIndex).toBeGreaterThan(baseIndex);
    expect(
      await readFile(
        join(outDir, "assets", "styles", "site", "styles", "base.css"),
        "utf8",
      ),
    ).toBe("body{}");
    expect(
      await readFile(
        join(outDir, "assets", "styles", "site", "styles", "type.css"),
        "utf8",
      ),
    ).toBe("h1{}");
    const legal = await readFile(join(outDir, "legal", "index.html"), "utf8");
    const legalLinkIndex = legal.indexOf(
      '<link rel="stylesheet" href="/assets/styles/site/styles/type.css">',
    );
    const legalStyleIndex = legal.indexOf(
      "<style>main { color: red; }</style>",
    );
    expect(legalLinkIndex).toBeGreaterThan(-1);
    expect(legalStyleIndex).toBeGreaterThan(legalLinkIndex);
  });

  it("ends the build with no output directory when a declared stylesheet cannot be read (UI7.4)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["site/missing.css"], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await expect(
      buildAdapter(root, "site/landing.config.ts", outDir),
    ).rejects.toThrow("site/missing.css");
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("emits no stylesheet link and no default when styles is absent or empty (UI7.5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: [], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).not.toContain('<link rel="stylesheet"');
  });
});
