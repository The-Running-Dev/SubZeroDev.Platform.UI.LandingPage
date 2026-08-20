import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGeneric, buildGenericData } from "../src/generic.js";

const roots: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "szd-generic-"));
  roots.push(root);
  await mkdir(join(root, "site"), { recursive: true });
  await writeFile(
    join(root, "README.md"),
    "# Example\n\nA concise example project.\n\n![Mark](site/mark.txt)\n",
    "utf8",
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n- First release\n",
    "utf8",
  );
  await writeFile(
    join(root, "site", "README.md"),
    "## Detail\n\nExtra site copy.\n",
    "utf8",
  );
  await writeFile(
    join(root, "site", "theme.css"),
    ".szd-brand { color: purple; }",
    "utf8",
  );
  await writeFile(join(root, "site", "mark.txt"), "asset", "utf8");
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("generic build", () => {
  it("escapes the navigation URLs it is handed", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-generic-escape-"));
    roots.push(root);
    const outDir = join(root, "site", "dist");
    await buildGenericData(root, outDir, {
      version: 1,
      kind: "generic",
      home: { markdown: "# Home\n\nA description paragraph." },
      changelog: { markdown: "# Changelog\n\n- one" },
      docsUrl: '"><script>alert(1)</script><a href="',
      repositoryUrl: '" onmouseover="steal()',
    });
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).not.toContain("<script>alert(1)</script>");
    expect(home).not.toContain('onmouseover="steal()"');
    expect(home).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("builds sanitized JSON Markdown with inline theme CSS", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-generic-json-"));
    roots.push(root);
    const outDir = join(root, "site", "dist");
    await buildGenericData(root, outDir, {
      version: 1,
      kind: "generic",
      home: {
        markdown: "# JSON home\n\nSafe prose.\n\n<script>alert(1)</script>",
      },
      changelog: { markdown: "# Changelog\n\n- JSON release" },
      themeCss: "body { color: rebeccapurple; }",
    });
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain("JSON home");
    expect(home).not.toContain("<script>alert");
    expect(
      await readFile(join(outDir, "assets", "theme.css"), "utf8"),
    ).toContain("rebeccapurple");
  });

  it("renders both pages, appends site README, copies assets, and loads theme last", async () => {
    const root = await fixture();
    const outDir = join(root, "site", "dist");
    await buildGeneric({
      root,
      readme: "README.md",
      siteReadme: "site/README.md",
      changelog: "CHANGELOG.md",
      css: "site/theme.css",
      publicDir: "site/public",
      outDir,
    });
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain("Extra site copy");
    expect(home).toContain(
      '/assets/szd-base.css"><link rel="stylesheet" href="/assets/theme.css"',
    );
    expect(
      await readFile(
        join(outDir, "assets", "source", "site", "mark.txt"),
        "utf8",
      ),
    ).toBe("asset");
    expect(
      await readFile(join(outDir, "changelog", "index.html"), "utf8"),
    ).toContain("First release");
  });

  it("rejects a local Markdown asset resolving outside the repository root through a symbolic link (UI11.3)", async () => {
    const root = await fixture();
    const outer = await mkdtemp(join(tmpdir(), "szd-generic-outer-"));
    roots.push(outer);
    await writeFile(join(outer, "outside.txt"), "leaked", "utf8");
    await symlink(join(outer, "outside.txt"), join(root, "site", "linked.txt"));
    await writeFile(
      join(root, "README.md"),
      "# Example\n\nA concise example project.\n\n![Linked](site/linked.txt)\n",
      "utf8",
    );
    await expect(
      buildGeneric({
        root,
        readme: "README.md",
        siteReadme: "site/README.md",
        changelog: "CHANGELOG.md",
        css: "site/theme.css",
        publicDir: "site/public",
        outDir: join(root, "site", "dist"),
      }),
    ).rejects.toThrow("site/linked.txt");
  });

  it("rejects a local Markdown asset path beginning '../' (UI11.8)", async () => {
    const root = await fixture();
    const outer = await mkdtemp(join(tmpdir(), "szd-generic-outer-"));
    roots.push(outer);
    await writeFile(join(outer, "escape.txt"), "leaked", "utf8");
    await writeFile(
      join(root, "README.md"),
      `# Example\n\nA concise example project.\n\n![Escape](${relative(
        root,
        join(outer, "escape.txt"),
      ).replaceAll("\\", "/")})\n`,
      "utf8",
    );
    await expect(
      buildGeneric({
        root,
        readme: "README.md",
        siteReadme: "site/README.md",
        changelog: "CHANGELOG.md",
        css: "site/theme.css",
        publicDir: "site/public",
        outDir: join(root, "site", "dist"),
      }),
    ).rejects.toThrow("escapes the repository root");
  });

  it("accepts a local Markdown asset reached through a symbolic link that stays inside the repository root (UI11.6)", async () => {
    const root = await fixture();
    await symlink(
      join(root, "site", "mark.txt"),
      join(root, "site", "linked.txt"),
    );
    await writeFile(
      join(root, "README.md"),
      "# Example\n\nA concise example project.\n\n![Linked](site/linked.txt)\n",
      "utf8",
    );
    const outDir = join(root, "site", "dist");
    await buildGeneric({
      root,
      readme: "README.md",
      siteReadme: "site/README.md",
      changelog: "CHANGELOG.md",
      css: "site/theme.css",
      publicDir: "site/public",
      outDir,
    });
    expect(
      await readFile(
        join(outDir, "assets", "source", "site", "linked.txt"),
        "utf8",
      ),
    ).toBe("asset");
  });

  it("prefixes its own self-links with basePath, for subpath deploys", async () => {
    const root = await fixture();
    const outDir = join(root, "site", "dist");
    await buildGeneric({
      root,
      readme: "README.md",
      siteReadme: "site/README.md",
      changelog: "CHANGELOG.md",
      css: "site/theme.css",
      publicDir: "site/public",
      outDir,
      basePath: "SubZeroDev.Platform.UI.LandingPage",
    });
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain(
      '<link rel="stylesheet" href="/SubZeroDev.Platform.UI.LandingPage/assets/szd-base.css">',
    );
    expect(home).toContain(
      '<link rel="stylesheet" href="/SubZeroDev.Platform.UI.LandingPage/assets/theme.css">',
    );
    expect(home).toContain(
      '<a class="szd-brand" href="/SubZeroDev.Platform.UI.LandingPage/">',
    );
    expect(home).toContain(
      '<a href="/SubZeroDev.Platform.UI.LandingPage/changelog/"',
    );
  });

  it("defaults basePath to root-absolute when omitted", async () => {
    const root = await fixture();
    const outDir = join(root, "site", "dist");
    await buildGeneric({
      root,
      readme: "README.md",
      siteReadme: "site/README.md",
      changelog: "CHANGELOG.md",
      css: "site/theme.css",
      publicDir: "site/public",
      outDir,
    });
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain(
      '/assets/szd-base.css"><link rel="stylesheet" href="/assets/theme.css"',
    );
    expect(home).toContain('<a class="szd-brand" href="/">');
  });

  it("prefixes JSON-generic self-links with basePath, for subpath deploys", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-generic-json-base-"));
    roots.push(root);
    const outDir = join(root, "site", "dist");
    await buildGenericData(
      root,
      outDir,
      {
        version: 1,
        kind: "generic",
        home: { markdown: "# JSON home\n\nA description paragraph." },
        changelog: { markdown: "# Changelog\n\n- one" },
      },
      "SubZeroDev.Platform.UI.LandingPage",
    );
    const home = await readFile(join(outDir, "index.html"), "utf8");
    expect(home).toContain(
      '<link rel="stylesheet" href="/SubZeroDev.Platform.UI.LandingPage/assets/szd-base.css">',
    );
    expect(home).toContain(
      '<a class="szd-brand" href="/SubZeroDev.Platform.UI.LandingPage/">',
    );
  });

  it("rejects README files without exactly one level-one heading", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "README.md"),
      "## Not a title\n\nDescription\n",
      "utf8",
    );
    await expect(
      buildGeneric({
        root,
        readme: "README.md",
        siteReadme: "site/README.md",
        changelog: "CHANGELOG.md",
        css: "site/theme.css",
        publicDir: "site/public",
        outDir: join(root, "out"),
      }),
    ).rejects.toThrow("exactly one");
  });

  it("sanitizes raw script markup from rendered Markdown", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "README.md"),
      "# Safe\n\nDescription.\n\n<script>alert('no')</script>\n",
      "utf8",
    );
    const outDir = join(root, "out");
    await buildGeneric({
      root,
      readme: "README.md",
      siteReadme: "site/README.md",
      changelog: "CHANGELOG.md",
      css: "site/theme.css",
      publicDir: "site/public",
      outDir,
    });
    expect(await readFile(join(outDir, "index.html"), "utf8")).not.toContain(
      "alert('no')",
    );
  });
});
