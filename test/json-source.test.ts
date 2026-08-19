import { exec as execCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execCallback);
const roots: string[] = [];
const servers: Server[] = [];
const children: Array<{ kill: () => void }> = [];

const cli = join(process.cwd(), "src", "cli.ts");
// A bare `--import tsx` resolves as a normal module specifier, which Node looks up from the
// spawned process's cwd - the mkdtemp fixture root below, which has no node_modules of its
// own. Resolving it here, from this file's own module context inside the repository, and
// passing the resolved URL instead of the bare specifier sidesteps that lookup entirely.
const tsxLoader = import.meta.resolve("tsx");

const model = {
  version: 1,
  kind: "generic",
  home: { markdown: "# Remote site\n\nThis model was fetched over HTTP." },
  changelog: { markdown: "# Changelog\n\n- remote" },
};

/** Serves one JSON body, so a `url:` source resolves without leaving the host. */
async function serve(body: unknown): Promise<number> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  return (server.address() as { port: number }).port;
}

async function fixture(sourceMap: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "szd-json-source-"));
  roots.push(root);
  await mkdir(join(root, "site"), { recursive: true });
  await writeFile(join(root, "site", "sources.public.yml"), sourceMap, "utf8");
  return root;
}

function build(root: string, args = "") {
  return exec(`node --import "${tsxLoader}" "${cli}" build${args}`, {
    cwd: root,
  });
}

/** A port nothing listens on, so a declared URL source fails to connect. */
async function deadPort(): Promise<number> {
  const port = await serve({});
  await new Promise<void>((resolve) => servers[0].close(() => resolve()));
  servers.length = 0;
  return port;
}

afterEach(async () => {
  for (const child of children.splice(0)) child.kill();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

/**
 * Spawns `dev` and resolves the URL it prints. An adapter site's `dev` is a Vite
 * server, which announces `localhost` rather than the loopback literal the
 * static-server path prints, so this accepts either.
 */
async function spawnDev(
  root: string,
  args: string[] = [],
): Promise<{ kill: () => void; base: string }> {
  const child = spawn(
    process.execPath,
    ["--import", tsxLoader, cli, "dev", ...args],
    { cwd: root },
  );
  children.push(child);
  let output = "";
  const base = await new Promise<string>((resolvePromise, reject) => {
    const scan = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      const match = output.match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+/);
      if (match) resolvePromise(match[0]);
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);
    child.on("exit", (code) =>
      reject(new Error(`'dev' exited (${code}) before listening: ${output}`)),
    );
    child.on("error", reject);
  });
  return { base, kill: () => child.kill() };
}

describe("JSON source resolution", () => {
  it("builds one model identically from a local file and from a URL", async () => {
    const port = await serve(model);
    const remote = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    url: http://127.0.0.1:${port}/landing.json\n    cache: manual\n`,
    );
    const local = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n",
    );
    await writeFile(
      join(local, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    await build(remote);
    await build(local);
    const fromUrl = await readFile(
      join(remote, "site", "dist", "index.html"),
      "utf8",
    );
    expect(fromUrl).toContain("<h1>Remote site</h1>");
    expect(fromUrl).not.toContain("szd-json-sources");
    expect(fromUrl).toBe(
      await readFile(join(local, "site", "dist", "index.html"), "utf8"),
    );
  }, 60000);

  it("fails the build when a declared URL source cannot be reached", async () => {
    const port = await deadPort();
    const root = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    url: http://127.0.0.1:${port}/landing.json\n    cache: manual\n`,
    );
    await expect(build(root)).rejects.toThrow();
    await expect(
      readFile(join(root, "site", "dist", "index.html"), "utf8"),
    ).rejects.toThrow();
  }, 60000);

  it("rejects a public source map that declares headers", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    url: https://example.test/landing.json\n    cache: manual\n    headers:\n      authorization: token\n",
    );
    await expect(build(root)).rejects.toThrow(/must not declare headers/);
  }, 60000);

  it("falls back to a declared bundled source, loudly, when the root fails", async () => {
    const port = await deadPort();
    const root = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    url: http://127.0.0.1:${port}/landing.json\n    cache: manual\n  landing-page-bundled:\n    at: build\n    path: site/landing.json\n    cache: manual\n`,
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify({
        ...model,
        home: { markdown: "# Bundled site\n\nThe fallback was used." },
      }),
      "utf8",
    );
    const { stderr } = await build(
      root,
      " --fallback-source-id landing-page-bundled",
    );
    expect(stderr).toContain("Falling back to 'landing-page-bundled'");
    expect(
      await readFile(join(root, "site", "dist", "index.html"), "utf8"),
    ).toContain("<h1>Bundled site</h1>");
  }, 60000);

  it("does not fall back when a source other than the root is what failed", async () => {
    const port = await deadPort();
    const root = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n  auxiliary:\n    at: build\n    url: http://127.0.0.1:${port}/aux.json\n    cache: manual\n  landing-page-bundled:\n    at: build\n    path: site/landing.json\n    cache: manual\n`,
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    await expect(
      build(root, " --fallback-source-id landing-page-bundled"),
    ).rejects.toThrow(/auxiliary/);
  }, 60000);

  it("rejects a fallback source that is not declared in the map", async () => {
    const port = await deadPort();
    const root = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    url: http://127.0.0.1:${port}/landing.json\n    cache: manual\n`,
    );
    await expect(build(root, " --fallback-source-id absent")).rejects.toThrow(
      /fallback source 'absent' is not declared/,
    );
  }, 60000);

  it("composes routes from validated build-time data, file and URL alike", async () => {
    const port = await serve({ items: [{ name: "Remote project" }] });
    const root = await fixture(
      `version: 1\nsources:\n  projects:\n    at: build\n    url: http://127.0.0.1:${port}/projects.json\n    cache: manual\n  testimonials:\n    at: build\n    path: site/testimonials.json\n    cache: manual\n`,
    );
    await writeFile(
      join(root, "site", "testimonials.json"),
      JSON.stringify({ items: [{ quote: "It built." }] }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `const list = (raw: any) =>
         Array.isArray(raw?.items)
           ? { ok: true as const, value: raw.items }
           : { ok: false as const, message: "expected an items array" };
       export default {
         sources: {
           projects: { id: "projects", validate: list },
           testimonials: { id: "testimonials", validate: list },
         },
         config: (data: any) => ({
           routes: [
             {
               path: "/",
               body: "<main><h1>" + data.projects[0].name + "</h1><p>" + data.testimonials[0].quote + "</p></main>",
               metadata: { title: "Composed", description: "From build-time data" },
             },
           ],
         }),
       };`,
      "utf8",
    );
    await build(root);
    const home = await readFile(
      join(root, "site", "dist", "index.html"),
      "utf8",
    );
    expect(home).toContain("<h1>Remote project</h1>");
    expect(home).toContain("<p>It built.</p>");
    expect(home).not.toContain("<script");
  }, 60000);

  it("fails the build when declared data does not satisfy its validator", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "projects.json"),
      JSON.stringify({ wrong: true }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: {
           projects: {
             id: "projects",
             validate: (raw: any) =>
               Array.isArray(raw?.items)
                 ? { ok: true as const, value: raw.items }
                 : { ok: false as const, message: "expected an items array" },
           },
         },
         config: () => ({ routes: [] }),
       };`,
      "utf8",
    );
    await expect(build(root)).rejects.toThrow(/expected an items array/);
  }, 60000);

  it("reports every declared adapter-source failure before invoking composition", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n  testimonials:\n    at: build\n    path: site/testimonials.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "projects.json"),
      JSON.stringify({}),
      "utf8",
    );
    await writeFile(
      join(root, "site", "testimonials.json"),
      JSON.stringify({}),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: {
           projects: { id: "projects", validate: () => ({ ok: false as const, message: "projects invalid" }) },
           testimonials: { id: "testimonials", validate: () => ({ ok: false as const, message: "testimonials invalid" }) },
         },
         config: () => { throw new Error("composition invoked"); },
       };`,
      "utf8",
    );

    await expect(build(root)).rejects.toThrow(
      /projects invalid[\s\S]*testimonials invalid/,
    );
    await expect(build(root)).rejects.not.toThrow(/composition invoked/);
    await expect(
      readFile(join(root, "site", "dist", "index.html"), "utf8"),
    ).rejects.toThrow();
  }, 60000);

  it("rejects an adapter source naming an id the map does not declare", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "projects.json"),
      JSON.stringify({ items: [] }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { projects: { id: "absent", validate: (raw: any) => ({ ok: true as const, value: raw }) } },
         config: () => ({ routes: [] }),
       };`,
      "utf8",
    );
    await expect(build(root)).rejects.toThrow(/is not declared/);
  }, 60000);

  it("rejects an adapter source that is not resolved at build time", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  projects:\n    at: runtime\n    url: https://example.test/projects.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { projects: { id: "projects", validate: (raw: unknown) => ({ ok: true as const, value: raw }) } },
         config: () => ({ routes: [] }),
       };`,
      "utf8",
    );
    await expect(build(root)).rejects.toThrow(/must declare at: build/);
  }, 60000);

  it("leaves an adapter declaring no sources on the root-model path", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default { routes: [{ path: "/", body: "<main>ignored</main>", metadata: { title: "I", description: "I" } }] };`,
      "utf8",
    );
    const home = await readFile(
      (await build(root), join(root, "site", "dist", "index.html")),
      "utf8",
    );
    expect(home).toContain("<h1>Remote site</h1>");
    expect(home).not.toContain("ignored");
  }, 60000);

  it("rejects a root source that does not resolve at build time", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: runtime\n    url: https://example.test/landing.json\n    cache: manual\n",
    );
    await expect(build(root)).rejects.toThrow(/must declare at: build/);
  }, 60000);

  it("emits a defineLandingPageData route's declared runtime data sources instead of failing (UI5.3)", async () => {
    const port = await serve({ headline: "Hello" });
    const root = await fixture(
      `version: 1\nsources:\n  content:\n    at: build\n    url: http://127.0.0.1:${port}/content.json\n    cache: manual\n  x:\n    at: runtime\n    url: https://example.test/x.json\n    cache: manual\n`,
    );
    await mkdir(join(root, "site", "src"), { recursive: true });
    await writeFile(join(root, "site", "src", "main.ts"), "export {};", "utf8");
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { content: { id: "content", validate: (raw: unknown) => ({ ok: true as const, value: raw }) } },
         config: () => ({
           routes: [
             {
               path: "/",
               entry: "src/main.ts",
               dataSourceIds: ["x"],
               metadata: { title: "Home", description: "Home page" },
             },
           ],
         }),
       };`,
      "utf8",
    );
    await build(root);
    const home = await readFile(
      join(root, "site", "dist", "index.html"),
      "utf8",
    );
    expect(home).toContain(
      '<script type="application/json" id="szd-json-sources">',
    );
    expect(home).toContain('"x"');
    expect(home).not.toContain('"content"');
  }, 60000);

  it("reports declared adapter-source failures in declaration order, not grouped by failure class", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  alpha:\n    at: build\n    path: site/alpha.json\n    cache: manual\n",
    );
    await writeFile(join(root, "site", "alpha.json"), "{}", "utf8");
    // 'a' is declared first and fails its validator; 'b' is declared second and
    // names an id the map does not hold. Collecting by failure class would put
    // the missing id first, against the order the consumer wrote.
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: {
           a: { id: "alpha", validate: () => ({ ok: false as const, message: "alpha invalid" }) },
           b: { id: "beta", validate: (raw: unknown) => ({ ok: true as const, value: raw }) },
         },
         config: () => ({ routes: [] }),
       };`,
      "utf8",
    );
    await expect(build(root)).rejects.toThrow(
      /alpha invalid[\s\S]*'beta', which is not declared/,
    );
  }, 60000);

  it("serves a data-backed adapter over the dev server instead of claiming its source map is absent", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "projects.json"),
      JSON.stringify({ headline: "Composed in dev" }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { projects: { id: "projects", validate: (raw: any) => ({ ok: true as const, value: raw }) } },
         config: ({ projects }: any) => ({
           routes: [
             {
               path: "/",
               body: "<main>" + projects.headline + "</main>",
               metadata: { title: "Home", description: "Home page" },
             },
           ],
         }),
       };`,
      "utf8",
    );
    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      expect(home).toContain("<main>Composed in dev</main>");
      expect(home).toContain("<title>Home</title>");
    } finally {
      dev.kill();
    }
  }, 60000);

  it("serves a plain adapter's routes through the dev server via the CLI's mode ladder when no source map is present (UI10.5)", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-json-source-"));
    roots.push(root);
    await mkdir(join(root, "site", "src"), { recursive: true });
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default { routes: [{ path: "/", entry: "src/main.ts", metadata: { title: "Plain adapter", description: "Adapter page" } }] };`,
      "utf8",
    );
    await writeFile(
      join(root, "site", "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      expect(home).toContain("<title>Plain adapter</title>");
      expect(home).toContain('<script type="module" src="/src/main.ts">');
    } finally {
      dev.kill();
    }
  }, 60000);

  it("serves a map-selected adapter-family site's own routes through the dev server, not an adapter module's (UI10.1, UI10.2)", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n",
    );
    await mkdir(join(root, "site", "src"), { recursive: true });
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify({
        version: 1,
        kind: "adapter",
        routes: [
          {
            path: "/",
            entry: "src/main.ts",
            metadata: { title: "From model", description: "Model page" },
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "src", "main.ts"),
      "const label: string = 'model';\ndocument.querySelector('#root')!.textContent = label;",
      "utf8",
    );
    // Declares no build-time sources, so it falls through to the root model
    // (design/20-contract.md, "the one inversion").
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default { routes: [{ path: "/", body: "<main>adapter file routes</main>", metadata: { title: "From adapter file", description: "Adapter page" } }] };`,
      "utf8",
    );
    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      expect(home).toContain("<title>From model</title>");
      expect(home).not.toContain("adapter file routes");
      expect(home).toContain('<script type="module" src="/src/main.ts">');

      // Vite-transformed, not the module's own source bytes: the type
      // annotation only a transform strips is gone from the response.
      const entry = await (await fetch(`${dev.base}/src/main.ts`)).text();
      expect(entry).not.toContain(": string");
    } finally {
      dev.kill();
    }
  }, 60000);

  it("builds and serves a map-selected generic-family site statically under dev, where a route path without a trailing slash still resolves (UI10.3)", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      expect(home).toContain("<h1>Remote site</h1>");
      const withoutSlash = await fetch(`${dev.base}/changelog`);
      expect(withoutSlash.status).toBe(200);
      expect(await withoutSlash.text()).toContain("Changelog");
    } finally {
      dev.kill();
    }
  }, 60000);

  it("keeps a data-backed adapter's declared sources outranking a map-selected root model under dev, as it already does under build (UI10.4)", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    await writeFile(
      join(root, "site", "projects.json"),
      JSON.stringify({ headline: "Composed in dev" }),
      "utf8",
    );
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { projects: { id: "projects", validate: (raw: any) => ({ ok: true as const, value: raw }) } },
         config: ({ projects }: any) => ({
           routes: [
             {
               path: "/",
               body: "<main>" + projects.headline + "</main>",
               metadata: { title: "Home", description: "Home page" },
             },
           ],
         }),
       };`,
      "utf8",
    );
    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      expect(home).toContain("<main>Composed in dev</main>");
      expect(home).not.toContain("Remote site");
    } finally {
      dev.kill();
    }
  }, 60000);

  it("emits #szd-json-sources under dev for a data-backed adapter's dataSourceIds route, byte-identical to built output (UI10.7)", async () => {
    const port = await serve({ headline: "Hello" });
    const root = await fixture(
      `version: 1\nsources:\n  content:\n    at: build\n    url: http://127.0.0.1:${port}/content.json\n    cache: manual\n  x:\n    at: runtime\n    url: https://example.test/x.json\n    cache: manual\n`,
    );
    await mkdir(join(root, "site", "src"), { recursive: true });
    await writeFile(join(root, "site", "src", "main.ts"), "export {};", "utf8");
    await writeFile(
      join(root, "site", "landing.config.ts"),
      `export default {
         sources: { content: { id: "content", validate: (raw: unknown) => ({ ok: true as const, value: raw }) } },
         config: () => ({
           routes: [
             {
               path: "/",
               entry: "src/main.ts",
               dataSourceIds: ["x"],
               metadata: { title: "Home", description: "Home page" },
             },
           ],
         }),
       };`,
      "utf8",
    );
    await build(root);
    const built = await readFile(
      join(root, "site", "dist", "index.html"),
      "utf8",
    );
    const scriptTag =
      /<script type="application\/json" id="szd-json-sources">([^<]*)<\/script>/;
    const builtMatch = built.match(scriptTag);
    if (!builtMatch) throw new Error("build did not emit #szd-json-sources");

    const dev = await spawnDev(root);
    try {
      const home = await (await fetch(dev.base)).text();
      const devMatch = home.match(scriptTag);
      if (!devMatch) throw new Error("dev did not emit #szd-json-sources");
      expect(devMatch[1]).toBe(builtMatch[1]);
    } finally {
      dev.kill();
    }
  }, 60000);

  it("ends dev before listening when a map-selected root source cannot be fetched (UI10.8)", async () => {
    const port = await deadPort();
    const root = await fixture(
      `version: 1\nsources:\n  landing-page:\n    at: build\n    url: http://127.0.0.1:${port}/landing.json\n    cache: manual\n`,
    );
    await expect(spawnDev(root)).rejects.toThrow(/before listening/);
  }, 60000);

  it("--source-map naming a file that does not exist ends dev with the same message build raises for the same flag (UI10.9)", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n",
    );
    await writeFile(
      join(root, "site", "landing.json"),
      JSON.stringify(model),
      "utf8",
    );
    await expect(build(root, " --source-map site/absent.yml")).rejects.toThrow(
      /JSON source map not found at/,
    );
    await expect(
      spawnDev(root, ["--source-map", "site/absent.yml"]),
    ).rejects.toThrow(/JSON source map not found at/);
  }, 60000);
});
