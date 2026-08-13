import { exec as execCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execCallback);
const roots: string[] = [];
const servers: Server[] = [];

const cli = join(process.cwd(), "src", "cli.ts");

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
  return exec(`node --import tsx "${cli}" build${args}`, { cwd: root });
}

/** A port nothing listens on, so a declared URL source fails to connect. */
async function deadPort(): Promise<number> {
  const port = await serve({});
  await new Promise<void>((resolve) => servers[0].close(() => resolve()));
  servers.length = 0;
  return port;
}

afterEach(async () => {
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
});
