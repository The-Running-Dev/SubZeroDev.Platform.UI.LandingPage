#!/usr/bin/env node
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildAdapter,
  buildAdapterConfig,
  devAdapter,
  hasAdapter,
  isDataBacked,
  loadAdapterExport,
} from "./adapter.js";
import type { LandingPageDataConfig } from "./index.js";
import { assertRoute, assertUniquePaths } from "./route.js";
import { generateChangelog } from "./changelog.js";
import {
  buildGeneric,
  buildGenericData,
  type GenericOptions,
} from "./generic.js";
import { mergeLanding } from "./merge.js";
import { validateLandingPageData } from "./data.js";
import {
  createJsonLoader,
  JsonError,
  type JsonPorts,
  type SourceMap,
} from "subzerodev-data-json";
import { prefetch, type PrefetchOutput } from "subzerodev-data-json/build";
import { nodePorts, readSourceMap } from "subzerodev-data-json/node";

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
    "source-map": { type: "string" },
    "source-id": { type: "string" },
    "fallback-source-id": { type: "string" },
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

const sourceMapArgument = process.argv
  .slice(3)
  .some(
    (argument) =>
      argument === "--source-map" || argument.startsWith("--source-map="),
  );

function validatePublicSources(map: SourceMap): void {
  for (const [id, source] of Object.entries(map.sources)) {
    if ("headers" in source && source.headers !== undefined)
      throw new Error(`Public JSON source '${id}' must not declare headers.`);
    if (source.at === "runtime" && "path" in source)
      throw new Error(
        `Public JSON source '${id}' must not declare a runtime file source.`,
      );
  }
}

/**
 * Prefetches the map, substituting a declared fallback source for the root model
 * when — and only when — the root is the single source that failed. `prefetch`
 * resolves every `at: build` entry before writing anything and throws
 * `build.failed` naming each failure, so this is the only point at which a
 * failed root can still be recovered. The substitution is announced: a landing
 * site that quietly served stale content would be the failure this guards
 * against, not the one it prevents.
 */
async function prefetchWithFallback(
  map: SourceMap,
  outDir: string,
  ports: JsonPorts,
  sourceId: string,
  fallbackId: string | undefined,
): Promise<PrefetchOutput> {
  try {
    return await prefetch(map, outDir, ports);
  } catch (error) {
    if (fallbackId === undefined) throw error;
    if (!(error instanceof JsonError) || error.code !== "build.failed")
      throw error;
    const failures = error.failures;
    if (failures.length !== 1 || failures[0].id !== sourceId) throw error;
    const fallback = map.sources[fallbackId];
    if (!fallback)
      throw new Error(
        `JSON fallback source '${fallbackId}' is not declared in the source map.`,
      );
    if (fallback.at !== "build")
      throw new Error(
        `JSON fallback source '${fallbackId}' must declare at: build.`,
      );
    console.warn(
      `JSON source '${sourceId}' failed (${failures[0].reason}): ${failures[0].message}. Falling back to '${fallbackId}'.`,
    );
    return prefetch(
      {
        version: map.version,
        sources: { ...map.sources, [sourceId]: fallback },
      },
      outDir,
      ports,
    );
  }
}

async function buildJsonData(
  outDir: string,
  sourceMapPath: string,
): Promise<void> {
  const map = await readSourceMap(sourceMapPath);
  validatePublicSources(map);
  const sourceId = parsed["source-id"] ?? "landing-page";
  const rootSource = map.sources[sourceId];
  if (!rootSource)
    throw new Error(
      `JSON source '${sourceId}' is not declared in '${sourceMapPath}'.`,
    );
  if (rootSource.at !== "build")
    throw new Error(`JSON source '${sourceId}' must declare at: build.`);
  const temporary = await mkdtemp(join(tmpdir(), "szd-landing-json-"));
  try {
    const prefetched = await prefetchWithFallback(
      map,
      temporary,
      nodePorts(),
      sourceId,
      parsed["fallback-source-id"],
    );
    const loader = createJsonLoader(prefetched.runtimeMap, nodePorts());
    const result = await loader.load({
      id: sourceId,
      validate: (raw) => {
        try {
          return { ok: true as const, value: validateLandingPageData(raw) };
        } catch (error) {
          return {
            ok: false as const,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
    if (!result.ok)
      throw new Error(`JSON source '${sourceId}' failed: ${result.message}`);
    const data = result.data;
    if (data.kind === "generic") await buildGenericData(root, outDir, data);
    else
      await buildAdapterConfig(
        root,
        dirname(sourceMapPath),
        {
          routes: data.routes,
          ...(data.allow ? { allow: data.allow } : {}),
          ...(data.publicDir ? { publicDir: data.publicDir } : {}),
        },
        outDir,
        prefetched.runtimeMap,
      );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Builds a site whose routes are composed from validated build-time data. Each
 * declared source resolves through its own validator, so a payload that does not
 * match the consumer's type ends the build here rather than reaching composition.
 * The root-model fallback does not apply: there is no root model to replace.
 */
async function buildAdapterData(
  outDir: string,
  sourceMapPath: string,
  adapterPath: string,
  declaration: LandingPageDataConfig<unknown>,
): Promise<void> {
  const map = await readSourceMap(sourceMapPath);
  validatePublicSources(map);
  const temporary = await mkdtemp(join(tmpdir(), "szd-landing-data-"));
  try {
    const prefetched = await prefetch(map, temporary, nodePorts());
    const loader = createJsonLoader(prefetched.runtimeMap, nodePorts());
    const entries = Object.entries(declaration.sources) as [
      string,
      { id: string; validate: (raw: unknown) => unknown },
    ][];
    const data: Record<string, unknown> = {};
    for (const [key, source] of entries) {
      if (!map.sources[source.id])
        throw new Error(
          `Adapter source '${key}' names JSON source '${source.id}', which is not declared in '${sourceMapPath}'.`,
        );
      const result = await loader.load({
        id: source.id,
        validate: source.validate as never,
      });
      if (!result.ok)
        throw new Error(
          `Adapter source '${key}' ('${source.id}') failed: ${result.message}`,
        );
      data[key] = result.data;
    }
    const config = declaration.config(data);
    for (const route of config.routes) assertRoute(route);
    assertUniquePaths(config.routes);
    await buildAdapterConfig(root, dirname(adapterPath), config, outDir);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function build(outDir = options.outDir): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  const sourceMapPath = resolve(
    root,
    parsed["source-map"] ?? "site/sources.public.yml",
  );
  const adapter = parsed.adapter ?? "site/landing.config.ts";
  const adapterExists = await hasAdapter(root, adapter);
  if (
    await (async () => {
      try {
        await readFile(sourceMapPath, "utf8");
        return true;
      } catch {
        return false;
      }
    })()
  ) {
    // An adapter declaring build-time sources is that data's consumer, so it
    // outranks the root model. An adapter that declares none falls through, and
    // a consumer holding both files therefore builds exactly as it did before.
    if (adapterExists) {
      const adapterPath = resolve(root, adapter);
      const declaration = await loadAdapterExport(adapterPath);
      if (isDataBacked(declaration)) {
        await buildAdapterData(outDir, sourceMapPath, adapterPath, declaration);
        return;
      }
    }
    await buildJsonData(outDir, sourceMapPath);
  } else if (sourceMapArgument)
    throw new Error(`JSON source map not found at '${sourceMapPath}'.`);
  else if (adapterExists) await buildAdapter(root, adapter, outDir);
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
