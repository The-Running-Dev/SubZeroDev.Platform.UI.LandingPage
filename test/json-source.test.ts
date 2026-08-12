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

function build(root: string) {
  return exec(`node --import tsx "${cli}" build`, { cwd: root });
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
    const port = await serve(model);
    await new Promise<void>((resolve) => servers[0].close(() => resolve()));
    servers.length = 0;
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

  it("rejects a root source that does not resolve at build time", async () => {
    const root = await fixture(
      "version: 1\nsources:\n  landing-page:\n    at: runtime\n    url: https://example.test/landing.json\n    cache: manual\n",
    );
    await expect(build(root)).rejects.toThrow(/must declare at: build/);
  }, 60000);
});
