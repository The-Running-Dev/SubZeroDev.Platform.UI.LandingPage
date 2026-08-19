#!/usr/bin/env node
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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
import type { LandingPageConfig, LandingPageDataConfig } from "./index.js";
import { generateChangelog } from "./changelog.js";
import {
  buildGeneric,
  buildGenericData,
  type GenericOptions,
} from "./generic.js";
import { mergeLanding } from "./merge.js";
import { createStaticServer } from "./staticServer.js";
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
    "base-path": { type: "string" },
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
  basePath: parsed["base-path"],
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
          ...(data.styles ? { styles: data.styles } : {}),
        },
        outDir,
        prefetched.runtimeMap,
      );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Resolves a data-backed adapter's declared sources and hands the composed
 * configuration to `use`, which runs while the prefetch directory still exists.
 * Each declared source resolves through its own validator, so a payload that does
 * not match the consumer's type ends the build here rather than reaching
 * composition. The root-model fallback does not apply: there is no root model to
 * replace.
 *
 * Each diagnostic carries the declaration index it came from and the list is
 * sorted by it before being reported (design/20-contract.md, "Routes composed
 * from build-time data"). Collecting failures rather than failing fast exists so
 * one correction cycle addresses every malformed input; emitting them grouped by
 * failure class instead would order the list by something the consumer never
 * wrote, and a missing id would always precede a validator failure declared
 * above it.
 */
async function withDataBackedConfig<R>(
  sourceMapPath: string,
  declaration: LandingPageDataConfig<unknown>,
  use: (config: LandingPageConfig, runtimeMap: SourceMap) => Promise<R>,
): Promise<R> {
  const map = await readSourceMap(sourceMapPath);
  validatePublicSources(map);
  const temporary = await mkdtemp(join(tmpdir(), "szd-landing-data-"));
  try {
    const entries = Object.entries(declaration.sources).map(
      ([key, source], index) => ({
        key,
        index,
        source: source as { id: string; validate: (raw: unknown) => unknown },
      }),
    );
    const failures: { index: number; message: string }[] = [];
    const report = (): string =>
      failures
        .sort((left, right) => left.index - right.index)
        .map((failure) => failure.message)
        .join("\n");
    const declared = entries.filter(({ key, index, source }) => {
      const mapSource = map.sources[source.id];
      if (!mapSource) {
        failures.push({
          index,
          message: `Adapter source '${key}' names JSON source '${source.id}', which is not declared in '${sourceMapPath}'.`,
        });
        return false;
      }
      if (mapSource.at !== "build") {
        failures.push({
          index,
          message: `Adapter source '${key}' ('${source.id}') must declare at: build.`,
        });
        return false;
      }
      return true;
    });

    let prefetched: PrefetchOutput;
    try {
      prefetched = await prefetch(map, temporary, nodePorts());
    } catch (error) {
      if (error instanceof JsonError && error.code === "build.failed") {
        for (const { key, index, source } of declared) {
          const failure = error.failures.find((item) => item.id === source.id);
          if (failure)
            failures.push({
              index,
              message: `Adapter source '${key}' ('${source.id}') failed: ${failure.message}`,
            });
        }
      }
      if (failures.length > 0) throw new Error(report());
      throw error;
    }

    const loader = createJsonLoader(prefetched.runtimeMap, nodePorts());
    const data: Record<string, unknown> = {};
    for (const { key, index, source } of declared) {
      const result = await loader.load({
        id: source.id,
        validate: source.validate as never,
      });
      if (!result.ok)
        failures.push({
          index,
          message: `Adapter source '${key}' ('${source.id}') failed: ${result.message}`,
        });
      else data[key] = result.data;
    }
    if (failures.length > 0) throw new Error(report());
    return await use(declaration.config(data), prefetched.runtimeMap);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Builds a site whose routes are composed from validated build-time data. */
async function buildAdapterData(
  outDir: string,
  sourceMapPath: string,
  adapterPath: string,
  declaration: LandingPageDataConfig<unknown>,
): Promise<void> {
  await withDataBackedConfig(sourceMapPath, declaration, (config, runtimeMap) =>
    buildAdapterConfig(root, dirname(adapterPath), config, outDir, runtimeMap),
  );
}

/**
 * Resolves a data-backed adapter's configuration for the dev server to hold. The
 * prefetch directory is gone by the time this returns, so the caller receives the
 * composed configuration and not the runtime map — which is why the dev server
 * emits no `#szd-json-sources` (design/20-contract.md, "JSON-backed site data").
 */
async function resolveDataBackedConfig(
  sourceMapPath: string,
  declaration: LandingPageDataConfig<unknown>,
): Promise<LandingPageConfig> {
  return withDataBackedConfig(sourceMapPath, declaration, (config) =>
    Promise.resolve(config),
  );
}

/** Whether a source map is present, which is what selects the JSON input path. */
async function hasSourceMap(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * `flags` defaults to the parsed CLI flags so `build`, `check` and `dev` behave
 * as before. `preview` passes its own object, omitting `adapter` and
 * `sourceMap`, so it always runs the same build the site's mode already uses
 * regardless of what `--adapter` or `--source-map` name (design/20-contract.md,
 * "Serving built output"). It is one parameter rather than three because a
 * parameter default fires on an explicit `undefined` too — suppressing a flag
 * by passing `undefined` positionally would silently restore it.
 */
interface BuildFlags {
  adapter?: string;
  sourceMap?: string;
  sourceMapWasGiven: boolean;
}

async function build(
  outDir = options.outDir,
  flags: BuildFlags = {
    adapter: parsed.adapter,
    sourceMap: parsed["source-map"],
    sourceMapWasGiven: sourceMapArgument,
  },
): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  const sourceMapPath = resolve(
    root,
    flags.sourceMap ?? "site/sources.public.yml",
  );
  const adapter = flags.adapter ?? "site/landing.config.ts";
  const adapterExists = await hasAdapter(root, adapter);
  if (await hasSourceMap(sourceMapPath)) {
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
  } else if (flags.sourceMapWasGiven)
    throw new Error(`JSON source map not found at '${sourceMapPath}'.`);
  else if (adapterExists) await buildAdapter(root, adapter, outDir);
  else await buildGeneric({ ...options, outDir });
}

/**
 * Serves `outDir` on `--port`, reporting a bind failure the way every other
 * path in this file reports one. `listen` fails asynchronously, after `main`'s
 * promise has already settled, so an unhandled `'error'` event would escape
 * `main().catch` and end the process on a stack trace instead — and `dev` and
 * `preview` share a default port, so running both is the collision that
 * reaches it.
 */
function serve(outDir: string): void {
  const requested = Number(parsed.port ?? "4173");
  const server = createStaticServer(outDir);
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${requested} is already in use.`
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(requested, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    console.log(`http://127.0.0.1:${port}`);
  });
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
      const adapterPath = resolve(root, adapter);
      const declaration = await loadAdapterExport(adapterPath);
      if (isDataBacked(declaration)) {
        const sourceMapPath = resolve(
          root,
          parsed["source-map"] ?? "site/sources.public.yml",
        );
        if (!(await hasSourceMap(sourceMapPath)))
          throw new Error(
            `Adapter '${adapterPath}' declares build-time data sources, which need a JSON source map.`,
          );
        // Resolved once, here, rather than by the route middleware per request:
        // re-resolving would refetch every declared source on every navigation.
        // The middleware holds this configuration and reloads nothing, so an
        // edit to a data-backed adapter needs a restart — the same trade generic
        // `dev` already makes, and the reason it is stated rather than silent.
        await devAdapter(
          root,
          adapter,
          await resolveDataBackedConfig(sourceMapPath, declaration),
        );
        return;
      }
      await devAdapter(root, adapter);
      return;
    }
    await build();
    serve(options.outDir);
    return;
  }
  if (command === "preview") {
    await build(options.outDir, { sourceMapWasGiven: false });
    serve(options.outDir);
    return;
  }
  throw new Error(
    "Usage: subzerodev-platform-ui-landing-page <dev|build|preview|check|generate-changelog|merge>",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
