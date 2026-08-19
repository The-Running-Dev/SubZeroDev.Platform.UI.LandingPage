import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LandingPageConfig } from "../src/index.js";
import {
  buildAdapter,
  buildAdapterConfig,
  devAdapter,
  html,
} from "../src/adapter.js";

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
    const legalBaseIndex = legal.indexOf(
      '<link rel="stylesheet" href="/assets/styles/site/styles/base.css">',
    );
    const legalLinkIndex = legal.indexOf(
      '<link rel="stylesheet" href="/assets/styles/site/styles/type.css">',
    );
    const legalStyleIndex = legal.indexOf(
      "<style>main { color: red; }</style>",
    );
    expect(legalBaseIndex).toBeGreaterThan(-1);
    expect(legalLinkIndex).toBeGreaterThan(legalBaseIndex);
    expect(legalStyleIndex).toBeGreaterThan(legalLinkIndex);
  });

  it("rejects a declared stylesheet resolving outside the repository root, writing no output (UI7.4)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    await writeFile(join(root, "outside.css"), "body{}", "utf8");
    const site = join(root, "repo", "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["../outside.css"], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await expect(
      buildAdapter(join(root, "repo"), "site/landing.config.ts", outDir),
    ).rejects.toThrow("resolves outside the repository root");
    await expect(readdir(outDir)).rejects.toThrow();
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

  it("rejects a declared stylesheet resolving outside the repository root through a symbolic link, writing no output (UI11.1)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    await writeFile(join(root, "outside.css"), "body{}", "utf8");
    const site = join(root, "repo", "site");
    await mkdir(site, { recursive: true });
    await symlink(join(root, "outside.css"), join(site, "linked.css"));
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["site/linked.css"], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await expect(
      buildAdapter(join(root, "repo"), "site/landing.config.ts", outDir),
    ).rejects.toThrow("site/linked.css");
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("ends the build with the unreadable-stylesheet message for a dangling symlink, not a resolution failure (UI11.2)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await symlink(join(site, "does-not-exist.css"), join(site, "dangling.css"));
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["site/dangling.css"], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await expect(
      buildAdapter(root, "site/landing.config.ts", outDir),
    ).rejects.toThrow("site/dangling.css");
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("accepts a declared stylesheet reached through a symbolic link that stays inside the repository root (UI11.6)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "styles"), { recursive: true });
    await writeFile(join(site, "styles", "real.css"), "body{}", "utf8");
    await symlink(join(site, "styles", "real.css"), join(site, "linked.css"));
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["site/linked.css"], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain(
      '<link rel="stylesheet" href="/assets/styles/site/linked.css">',
    );
  });

  it("still refuses an absolute stylesheet path and one relative to exactly '..' (UI11.8)", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "szd-adapter-outside-"));
    roots.push(outsideRoot);
    const absoluteTarget = join(outsideRoot, "outside.css");
    await writeFile(absoluteTarget, "body{}", "utf8");

    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: [${JSON.stringify(absoluteTarget)}], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await expect(
      buildAdapter(root, "site/landing.config.ts", join(site, "dist")),
    ).rejects.toThrow("resolves outside the repository root");

    const site2 = join(root, "site2");
    await mkdir(site2, { recursive: true });
    await writeFile(
      join(site2, "landing.config.ts"),
      `export default { styles: [".."], routes: [{ path: "/", body: "<p>page</p>", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    // Asserted on message, not just rejection: `resolve(root, "..")` is a real,
    // readable directory, so a check that only ran after an unconditional read
    // would instead fail here with "could not be read" — this pins the
    // containment check, specifically, as what rejects this case.
    await expect(
      buildAdapter(root, "site2/landing.config.ts", join(site2, "dist")),
    ).rejects.toThrow("resolves outside the repository root");
  });

  it("rejects a pre-resolved config with duplicate route paths under dev, the same as build (UI11.9)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(site, { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      "export default {};",
      "utf8",
    );
    const config: LandingPageConfig = {
      routes: [
        {
          path: "/",
          body: "<p>a</p>",
          metadata: { title: "A", description: "A" },
        },
        {
          path: "/",
          body: "<p>b</p>",
          metadata: { title: "B", description: "B" },
        },
      ],
    };
    await expect(
      devAdapter(root, "site/landing.config.ts", config),
    ).rejects.toThrow(/duplicate/i);
  });

  it("serves a config-based adapter's routes over the dev server, reloading the config on each request (#10)", async () => {
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
    const server = await devAdapter(root, "site/landing.config.ts");
    try {
      const base = server.resolvedUrls?.local[0];
      if (!base) throw new Error("dev server did not resolve a local URL");

      const home = await (await fetch(base)).text();
      expect(home).toContain("<title>Home</title>");
      expect(home).toContain('<script type="module" src="/src/main.ts">');

      await writeFile(
        join(site, "landing.config.ts"),
        `export default { routes: [{ path: "/", body: "<main>Updated</main>", metadata: { title: "Updated", description: "Home page" } }, { path: "/roadmap/", body: "<main>Roadmap</main>", metadata: { title: "Roadmap", description: "Roadmap page" } }] };`,
        "utf8",
      );

      const updated = await (await fetch(base)).text();
      expect(updated).toContain("<title>Updated</title>");
      expect(updated).toContain("<main>Updated</main>");

      const roadmap = await (await fetch(`${base}roadmap/`)).text();
      expect(roadmap).toContain("<main>Roadmap</main>");
    } finally {
      await server.close();
    }
  });

  it("links and serves every declared site-wide stylesheet over the dev server, not only in built output", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    // Declared at the repository root rather than under the site root, so a dev
    // server reaching it through Vite's own file serving would need
    // `server.fs.allow` widened. The package answers the href itself instead.
    await mkdir(join(root, "branding"), { recursive: true });
    await writeFile(
      join(root, "branding", "base.css"),
      "body{color:rebeccapurple}",
      "utf8",
    );
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { styles: ["branding/base.css"], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    const server = await devAdapter(root, "site/landing.config.ts");
    try {
      const base = server.resolvedUrls?.local[0];
      if (!base) throw new Error("dev server did not resolve a local URL");

      const home = await (await fetch(base)).text();
      expect(home).toContain(
        '<link rel="stylesheet" href="/assets/styles/branding/base.css">',
      );

      const css = await fetch(`${base}assets/styles/branding/base.css`);
      expect(css.status).toBe(200);
      expect(css.headers.get("content-type")).toContain("text/css");
      expect(await css.text()).toBe("body{color:rebeccapurple}");

      // The resolved sandbox is untouched by serving that file.
      expect(server.config.server.fs.allow).not.toContain(
        join(root, "branding"),
      );
    } finally {
      await server.close();
    }
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

  it("runs a declared plugin's transform during build (UI8.1)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { plugins: [{ name: "marker", transform(code, id) { if (id.endsWith("main.ts")) return code.replace("__MARKER__", "REPLACED_BY_PLUGIN"); } }], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = '__MARKER__';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const assetFiles = (await readdir(join(outDir, "assets"))).filter((name) =>
      name.endsWith(".js"),
    );
    const bundled = (
      await Promise.all(
        assetFiles.map((name) =>
          readFile(join(outDir, "assets", name), "utf8"),
        ),
      )
    ).join("\n");
    expect(bundled).toContain("REPLACED_BY_PLUGIN");
    expect(bundled).not.toContain("__MARKER__");
  });

  it("applies the same declared plugin's transform to the dev server's module (UI8.2)", async () => {
    // Resolved so it matches the realpath Vite itself compares against a
    // symlinked macOS temp dir — otherwise transformRequest 404s on a path
    // that does exist, a test-environment quirk unrelated to this slice.
    const root = await realpath(await mkdtemp(join(tmpdir(), "szd-adapter-")));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { plugins: [{ name: "marker", transform(code, id) { if (id.endsWith("main.ts")) return code.replace("__MARKER__", "REPLACED_BY_PLUGIN"); } }], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = '__MARKER__';",
      "utf8",
    );
    const server = await devAdapter(root, "site/landing.config.ts");
    try {
      const result = await server.transformRequest("/src/main.ts");
      expect(result?.code).toContain("REPLACED_BY_PLUGIN");
      expect(result?.code).not.toContain("__MARKER__");
    } finally {
      await server.close();
    }
  });

  it("produces byte-identical output whether plugins is absent or an empty array (UI8.3)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const config = (plugins: string) =>
      `export default { ${plugins}routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`;

    await writeFile(join(site, "landing.config.ts"), config(""), "utf8");
    const noPluginsField = join(site, "dist-none");
    await buildAdapter(root, "site/landing.config.ts", noPluginsField);

    await writeFile(
      join(site, "landing.config.ts"),
      config("plugins: [], "),
      "utf8",
    );
    const emptyPlugins = join(site, "dist-empty");
    await buildAdapter(root, "site/landing.config.ts", emptyPlugins);

    const noneHtml = await readFile(join(noPluginsField, "index.html"), "utf8");
    const emptyHtml = await readFile(join(emptyPlugins, "index.html"), "utf8");
    expect(emptyHtml).toBe(noneHtml);
    expect(noneHtml).toContain('<script type="module"');
  });

  it("keeps the package's route middleware ahead of consumer plugins, which run in declaration order (UI8.4)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default {
        plugins: [
          { name: "a", configureServer(server) { server.middlewares.use((req, res, next) => { res.setHeader("x-order-a", "yes"); next(); }); } },
          { name: "b", configureServer(server) { server.middlewares.use((req, res, next) => { res.setHeader("x-order-b", res.getHeader("x-order-a") ? "after-a" : "first"); next(); }); } },
        ],
        routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }],
      };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const server = await devAdapter(root, "site/landing.config.ts");
    try {
      const base = server.resolvedUrls?.local[0];
      if (!base) throw new Error("dev server did not resolve a local URL");

      const home = await (await fetch(base)).text();
      expect(home).toContain("<title>Home</title>");

      const other = await fetch(`${base}not-a-route`);
      expect(other.headers.get("x-order-a")).toBe("yes");
      expect(other.headers.get("x-order-b")).toBe("after-a");
    } finally {
      await server.close();
    }
  });

  it("refuses to start when a declared plugin widens server.fs.allow (UI8.5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { plugins: [{ name: "widen", config() { return { server: { fs: { allow: ["/etc"] } } }; } }], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(join(site, "src", "main.ts"), "export {};", "utf8");
    await expect(devAdapter(root, "site/landing.config.ts")).rejects.toThrow(
      "/etc",
    );
  });

  it("starts normally with no plugin widening server.fs.allow (UI8.6)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await mkdir(join(root, "extra"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { allow: ["../extra"], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const server = await devAdapter(root, "site/landing.config.ts");
    try {
      const base = server.resolvedUrls?.local[0];
      if (!base) throw new Error("dev server did not resolve a local URL");
      const home = await (await fetch(base)).text();
      expect(home).toContain("<title>Home</title>");
    } finally {
      await server.close();
    }
  });

  it("holds configFile: false unconditionally even with a throwing vite.config.ts, with plugins declared (UI8.8)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-adapter-"));
    roots.push(root);
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "vite.config.ts"),
      "throw new Error('this config must never be evaluated');",
      "utf8",
    );
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { plugins: [{ name: "noop" }], routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    expect(await readFile(join(outDir, "index.html"), "utf8")).toContain(
      "<title>Home</title>",
    );
    const server = await devAdapter(root, "site/landing.config.ts");
    await server.close();
  });
});
