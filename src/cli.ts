#!/usr/bin/env node
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildAdapter, devAdapter, hasAdapter } from "./adapter.js";
import { generateChangelog } from "./changelog.js";
import { buildGeneric, type GenericOptions } from "./generic.js";
import { mergeLanding } from "./merge.js";

const command = process.argv[2];
const parsed = parseArgs({
  args: process.argv.slice(3),
  options: {
    readme: { type: "string" },
    "site-readme": { type: "string" },
    changelog: { type: "string" },
    css: { type: "string" },
    "public-dir": { type: "string" },
    "out-dir": { type: "string" },
    adapter: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    "repository-url": { type: "string" },
    "canonical-url": { type: "string" },
    "docs-url": { type: "string" },
    ref: { type: "string" },
    repository: { type: "string" },
    output: { type: "string" },
    check: { type: "boolean" },
    "landing-dist": { type: "string" },
    "docs-output": { type: "string" },
    "protected-path": { type: "string" },
    port: { type: "string" },
  },
  allowPositionals: false,
}).values;
const root = process.cwd();
const options: GenericOptions = {
  root,
  readme: parsed.readme ?? "README.md",
  siteReadme: parsed["site-readme"] ?? "site/README.md",
  changelog: parsed.changelog ?? "CHANGELOG.md",
  css: parsed.css ?? "site/theme.css",
  publicDir: parsed["public-dir"] ?? "site/public",
  outDir: resolve(root, parsed["out-dir"] ?? "site/dist"),
  title: parsed.title,
  description: parsed.description,
  repositoryUrl: parsed["repository-url"],
  canonicalUrl: parsed["canonical-url"],
  docsUrl: parsed["docs-url"],
};

async function build(outDir = options.outDir): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  if (await hasAdapter(root, parsed.adapter ?? "site/landing.config.ts"))
    await buildAdapter(
      root,
      parsed.adapter ?? "site/landing.config.ts",
      outDir,
    );
  else await buildGeneric({ ...options, outDir });
}

async function main(): Promise<void> {
  if (command === "build") {
    await build();
    return;
  }
  if (command === "check") {
    const temporary = await mkdtemp(join(tmpdir(), "szd-landing-check-"));
    try {
      await build(join(temporary, "dist"));
      console.log("Landing site check passed.");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return;
  }
  if (command === "generate-changelog") {
    const body = await generateChangelog(
      root,
      parsed.ref ?? "HEAD",
      parsed.repository,
    );
    const output = resolve(root, parsed.output ?? "CHANGELOG.md");
    if (parsed.check) {
      const existing = await readFile(output, "utf8").catch(() => "");
      if (existing.replace(/\r\n/g, "\n") !== body)
        throw new Error(`Generated changelog differs from '${output}'.`);
    } else await writeFile(output, body, "utf8");
    return;
  }
  if (command === "merge") {
    await mergeLanding(
      parsed["landing-dist"] ?? options.outDir,
      parsed["docs-output"] ?? "artifacts/docs",
      parsed["protected-path"] ?? "docs",
    );
    return;
  }
  if (command === "dev") {
    const adapter = parsed.adapter ?? "site/landing.config.ts";
    if (await hasAdapter(root, adapter)) {
      await devAdapter(root, adapter);
      return;
    }
    await build();
    const server = createServer(async (request, response) => {
      const relative =
        request.url === "/"
          ? "index.html"
          : (request.url?.replace(/^\//, "") ?? "index.html");
      const target = join(
        options.outDir,
        relative.endsWith("/") ? `${relative}index.html` : relative,
      );
      const data = await readFile(target).catch(() => undefined);
      response.writeHead(data ? 200 : 404);
      response.end(data ?? "Not found");
    });
    server.listen(Number(parsed.port ?? "4173"), "127.0.0.1", () =>
      console.log(`http://127.0.0.1:${parsed.port ?? "4173"}`),
    );
    return;
  }
  throw new Error(
    "Usage: subzerodev-platform-ui-landing-page <dev|build|check|generate-changelog|merge>",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
