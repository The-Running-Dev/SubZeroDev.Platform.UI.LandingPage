import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { baseCss } from "./baseCss.js";
import { inferRepository } from "./git.js";
import type { GenericLandingPageData, LandingPageMarkdown } from "./data.js";
import { assertWithin } from "./paths.js";

export type GenericOptions = {
  root: string;
  readme: string;
  siteReadme: string;
  changelog: string;
  css: string;
  publicDir: string;
  outDir: string;
  title?: string;
  description?: string;
  repositoryUrl?: string;
  canonicalUrl?: string;
  docsUrl?: string;
  basePath?: string;
};

type MarkdownDocument = { source: string; path: string; html: string };

const external = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i;

function normalize(url: string): string {
  return url.trim().replace(/^<|>$/g, "");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function h1s(markdown: string): string[] {
  return [...markdown.matchAll(/^# (?!#)(.+)$/gm)].map((match) =>
    match[1].trim(),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstParagraph(markdown: string): string | undefined {
  return markdown
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .find(
      (part) =>
        part.length > 0 &&
        !part.startsWith("#") &&
        !part.startsWith("!") &&
        !part.startsWith("[") &&
        !part.startsWith("```"),
    )
    ?.replace(/\r?\n/g, " ");
}

async function copyReferences(
  markdown: string,
  sourcePath: string,
  root: string,
  outDir: string,
): Promise<string> {
  const sourceDir = dirname(sourcePath);
  const links = [
    ...markdown.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g),
  ];
  let rewritten = markdown;
  for (const match of links) {
    const original = normalize(match[1]);
    if (external.test(original)) continue;
    const withoutFragment = original.split("#", 1)[0];
    if (!withoutFragment || extname(withoutFragment).toLowerCase() === ".md") {
      if (withoutFragment) {
        const destination = resolve(sourceDir, withoutFragment);
        if (!(await exists(destination)))
          throw new Error(
            `Broken local Markdown link '${original}' in '${sourcePath}'.`,
          );
      }
      continue;
    }
    const input = resolve(sourceDir, withoutFragment);
    if (!(await exists(input)))
      throw new Error(`Missing local asset '${original}' in '${sourcePath}'.`);
    try {
      await assertWithin(root, input, `Asset '${original}' in '${sourcePath}'`);
    } catch (cause) {
      throw new Error(`Asset '${original}' escapes the repository root.`, {
        cause,
      });
    }
    const safeRelative = relative(root, input).replaceAll("\\", "/");
    const outputRelative = `assets/source/${safeRelative}`;
    const target = join(outDir, outputRelative);
    await mkdir(dirname(target), { recursive: true });
    await cp(input, target);
    rewritten = rewritten.replaceAll(
      original,
      `/${outputRelative}${original.slice(withoutFragment.length)}`,
    );
  }
  return rewritten;
}

async function render(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}

async function readDocument(
  path: string,
  root: string,
  outDir: string,
): Promise<MarkdownDocument> {
  const source = await readFile(path, "utf8");
  const rewritten = await copyReferences(source, path, root, outDir);
  return { source, path, html: await render(rewritten) };
}

async function readMarkdown(
  document: LandingPageMarkdown,
  root: string,
  outDir: string,
): Promise<MarkdownDocument> {
  const assetBase = resolve(root, document.assetBase ?? ".");
  const sourcePath = join(assetBase, "landing.md");
  const rewritten = await copyReferences(
    document.markdown,
    sourcePath,
    root,
    outDir,
  );
  return {
    source: document.markdown,
    path: sourcePath,
    html: await render(rewritten),
  };
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath) return "/";
  const trimmed = basePath.trim().replace(/^\/*/, "/").replace(/\/*$/, "/");
  return trimmed;
}

function documentHtml(
  title: string,
  description: string,
  body: string,
  options: GenericOptions,
  active: "home" | "changelog",
): string {
  const base = normalizeBasePath(options.basePath);
  const canonical = options.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(options.canonicalUrl)}${active === "changelog" ? "changelog/" : ""}">`
    : "";
  const docs = options.docsUrl
    ? `<a href="${escapeHtml(options.docsUrl)}">Docs</a>`
    : "";
  const repository = options.repositoryUrl
    ? `<a href="${escapeHtml(options.repositoryUrl)}" rel="noreferrer">Repository</a>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">${canonical}
<link rel="stylesheet" href="${escapeHtml(base)}assets/szd-base.css"><link rel="stylesheet" href="${escapeHtml(base)}assets/theme.css"></head>
<body><a class="szd-skip-link" href="#content">Skip to content</a><div class="szd-shell">
<header class="szd-header"><a class="szd-brand" href="${escapeHtml(base)}">${escapeHtml(title)}</a><nav class="szd-nav" aria-label="Site"><a href="${escapeHtml(base)}"${active === "home" ? ' aria-current="page"' : ""}>Home</a><a href="${escapeHtml(base)}changelog/"${active === "changelog" ? ' aria-current="page"' : ""}>Changelog</a>${docs}${repository}</nav></header>
<main id="content" class="szd-main"><article class="szd-article">${body}</article></main>
<footer class="szd-footer">Built with SubZeroDev.Platform.UI.LandingPage.</footer></div></body></html>`;
}

export async function buildGeneric(options: GenericOptions): Promise<void> {
  const readmePath = resolve(options.root, options.readme);
  const changelogPath = resolve(options.root, options.changelog);
  if (!(await exists(readmePath)))
    throw new Error(`README not found at '${readmePath}'.`);
  if (!(await exists(changelogPath)))
    throw new Error(`CHANGELOG not found at '${changelogPath}'.`);
  await mkdir(options.outDir, { recursive: true });
  const readme = await readDocument(readmePath, options.root, options.outDir);
  const headings = h1s(readme.source);
  if (headings.length !== 1)
    throw new Error(
      `README must contain exactly one level-one heading; found ${headings.length}.`,
    );
  const title = options.title ?? headings[0];
  const description = options.description ?? firstParagraph(readme.source);
  if (!description)
    throw new Error(
      "README needs a non-heading prose paragraph for the site description.",
    );
  const inferred = await inferRepository(options.root).catch(() => undefined);
  const repositoryUrl =
    options.repositoryUrl ??
    (inferred ? `https://github.com/${inferred}` : undefined);
  const resolved = { ...options, repositoryUrl };
  const siteReadmePath = resolve(options.root, options.siteReadme);
  const siteReadme = (await exists(siteReadmePath))
    ? await readDocument(siteReadmePath, options.root, options.outDir)
    : undefined;
  const changelog = await readDocument(
    changelogPath,
    options.root,
    options.outDir,
  );
  await mkdir(join(options.outDir, "assets"), { recursive: true });
  await writeFile(
    join(options.outDir, "assets", "szd-base.css"),
    baseCss,
    "utf8",
  );
  const cssPath = resolve(options.root, options.css);
  await writeFile(
    join(options.outDir, "assets", "theme.css"),
    (await exists(cssPath)) ? await readFile(cssPath, "utf8") : "",
    "utf8",
  );
  const publicPath = resolve(options.root, options.publicDir);
  if (await exists(publicPath))
    await cp(publicPath, options.outDir, { recursive: true });
  await writeFile(
    join(options.outDir, "index.html"),
    documentHtml(
      title,
      description,
      `${readme.html}${siteReadme ? `\n${siteReadme.html}` : ""}`,
      resolved,
      "home",
    ),
    "utf8",
  );
  await mkdir(join(options.outDir, "changelog"), { recursive: true });
  await writeFile(
    join(options.outDir, "changelog", "index.html"),
    documentHtml(
      `Changelog — ${title}`,
      description,
      changelog.html,
      resolved,
      "changelog",
    ),
    "utf8",
  );
}

/** Builds the generic shell from a validated JSON site model. */
export async function buildGenericData(
  root: string,
  outDir: string,
  data: GenericLandingPageData,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const home = await readMarkdown(data.home, root, outDir);
  const headings = h1s(home.source);
  if (headings.length !== 1)
    throw new Error(
      `JSON home Markdown must contain exactly one level-one heading; found ${headings.length}.`,
    );
  const title = data.title ?? headings[0];
  const description = data.description ?? firstParagraph(home.source);
  if (!description)
    throw new Error(
      "JSON home Markdown needs a non-heading prose paragraph for the site description.",
    );
  const inferred = await inferRepository(root).catch(() => undefined);
  const options: GenericOptions = {
    root,
    readme: "",
    siteReadme: "",
    changelog: "",
    css: "",
    publicDir: data.publicDir ?? "site/public",
    outDir,
    title,
    description,
    repositoryUrl:
      data.repositoryUrl ??
      (inferred ? `https://github.com/${inferred}` : undefined),
    canonicalUrl: data.canonicalUrl,
    docsUrl: data.docsUrl,
  };
  const supplemental = data.supplemental
    ? await readMarkdown(data.supplemental, root, outDir)
    : undefined;
  const changelog = await readMarkdown(data.changelog, root, outDir);
  await mkdir(join(outDir, "assets"), { recursive: true });
  await writeFile(join(outDir, "assets", "szd-base.css"), baseCss, "utf8");
  await writeFile(
    join(outDir, "assets", "theme.css"),
    data.themeCss ?? "",
    "utf8",
  );
  const publicPath = resolve(root, options.publicDir);
  if (await exists(publicPath))
    await cp(publicPath, outDir, { recursive: true });
  await writeFile(
    join(outDir, "index.html"),
    documentHtml(
      title,
      description,
      `${home.html}${supplemental ? `\n${supplemental.html}` : ""}`,
      options,
      "home",
    ),
    "utf8",
  );
  await mkdir(join(outDir, "changelog"), { recursive: true });
  await writeFile(
    join(outDir, "changelog", "index.html"),
    documentHtml(
      `Changelog — ${title}`,
      description,
      changelog.html,
      options,
      "changelog",
    ),
    "utf8",
  );
}
