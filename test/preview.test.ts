import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAdapter } from "../src/adapter.js";
import { buildGeneric } from "../src/generic.js";
import { createStaticServer } from "../src/staticServer.js";

const cli = join(process.cwd(), "src", "cli.ts");
// See test/json-source.test.ts for why the loader is resolved here rather than
// passed as the bare specifier "tsx".
const tsxLoader = import.meta.resolve("tsx");

const roots: string[] = [];
const servers: Server[] = [];
const children: Array<{ kill: () => void }> = [];

afterEach(async () => {
  for (const child of children.splice(0)) child.kill();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolveClose) =>
            server.close(() => resolveClose()),
          ),
      ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function listen(outDir: string): Promise<string> {
  const server = createStaticServer(outDir);
  servers.push(server);
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", () => resolveListen()),
  );
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

/**
 * Issues a request by raw path, bypassing the WHATWG URL normalization a
 * string-based `fetch()` call would apply to a `..` segment or a `#` fragment
 * before the request ever leaves the client.
 */
function rawGet(
  base: string,
  path: string,
): Promise<{ status: number; body: string; contentType: string | undefined }> {
  const { hostname, port } = new URL(base);
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest({ hostname, port, path }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolvePromise({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          contentType: response.headers["content-type"],
        }),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "szd-preview-"));
  roots.push(root);
  return root;
}

/** A minimal built tree, laid out by hand rather than through a real build. */
async function plainOutDir(root: string): Promise<string> {
  const outDir = join(root, "dist");
  await mkdir(join(outDir, "roadmap"), { recursive: true });
  await mkdir(join(outDir, "assets"), { recursive: true });
  await writeFile(join(outDir, "index.html"), "<html>home</html>", "utf8");
  await writeFile(
    join(outDir, "roadmap", "index.html"),
    "<html>roadmap</html>",
    "utf8",
  );
  await writeFile(
    join(outDir, "assets", "app.js"),
    "console.log('js')",
    "utf8",
  );
  await writeFile(join(outDir, "weird.xyz"), "unmapped extension", "utf8");
  await writeFile(join(root, "secret.json"), '{"leak":true}', "utf8");
  return outDir;
}

describe("static server: resolution and containment", () => {
  it("serves '/' and a route with and without a trailing slash, and 404s a path naming no file (UI9.1)", async () => {
    const root = await fixtureRoot();
    const outDir = await plainOutDir(root);
    const base = await listen(outDir);

    expect((await rawGet(base, "/")).body).toBe("<html>home</html>");
    expect((await rawGet(base, "/roadmap")).body).toBe("<html>roadmap</html>");
    expect((await rawGet(base, "/roadmap/")).body).toBe("<html>roadmap</html>");
    expect((await rawGet(base, "/nope")).status).toBe(404);
  });

  it("derives Content-Type from the extension, and still carries a header for an unmapped one (UI9.2)", async () => {
    const root = await fixtureRoot();
    const outDir = await plainOutDir(root);
    const base = await listen(outDir);

    expect((await rawGet(base, "/")).contentType).toContain("text/html");
    expect((await rawGet(base, "/assets/app.js")).contentType).toContain(
      "javascript",
    );
    const unmapped = await rawGet(base, "/weird.xyz");
    expect(unmapped.status).toBe(200);
    expect(unmapped.contentType).toBeTruthy();
  });

  it("keeps a literal or percent-encoded '..' outside outDir, 404ing without leaking a filesystem path (UI9.3)", async () => {
    const root = await fixtureRoot();
    const outDir = await plainOutDir(root);
    const base = await listen(outDir);

    const literal = await rawGet(base, "/../secret.json");
    expect(literal.status).toBe(404);
    expect(literal.body).not.toContain(root);
    expect(literal.body).not.toContain("leak");

    const encoded = await rawGet(base, "/%2e%2e/secret.json");
    expect(encoded.status).toBe(404);
    expect(encoded.body).not.toContain(root);
    expect(encoded.body).not.toContain("leak");
  });

  it("resolves '/index.html?v=1' and '/#top' to the home document — the query and fragment never reach the filename (UI9.4)", async () => {
    const root = await fixtureRoot();
    const outDir = await plainOutDir(root);
    const base = await listen(outDir);

    expect((await rawGet(base, "/index.html?v=1")).body).toBe(
      "<html>home</html>",
    );
    expect((await rawGet(base, "/#top")).body).toBe("<html>home</html>");
  });
});

describe("static server: real built trees", () => {
  it("serves a custom-adapter build's routes with a Content-Type its module script executes under (UI9.1, UI9.2)", async () => {
    const root = await fixtureRoot();
    const site = join(root, "site");
    await mkdir(join(site, "src"), { recursive: true });
    await writeFile(
      join(site, "landing.config.ts"),
      `export default { routes: [ { path: "/", entry: "src/main.ts", metadata: { title: "Home", description: "Home page" } }, { path: "/roadmap/", body: "<main>Roadmap</main>", metadata: { title: "Roadmap", description: "Roadmap page" } } ] };`,
      "utf8",
    );
    await writeFile(
      join(site, "src", "main.ts"),
      "document.querySelector('#root')!.textContent = 'home';",
      "utf8",
    );
    const outDir = join(site, "dist");
    await buildAdapter(root, "site/landing.config.ts", outDir);
    const base = await listen(outDir);

    const homeResponse = await rawGet(base, "/");
    expect(homeResponse.contentType).toContain("text/html");
    expect(homeResponse.body).toContain("<title>Home</title>");
    const scriptMatch = homeResponse.body.match(
      /<script type="module"[^>]* src="([^"]+)">/,
    );
    if (!scriptMatch) throw new Error("home document has no module script");
    const scriptResponse = await rawGet(base, scriptMatch[1]);
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.contentType).toContain("javascript");

    expect((await rawGet(base, "/roadmap")).body).toContain(
      "<title>Roadmap</title>",
    );
    expect((await rawGet(base, "/roadmap/")).body).toContain(
      "<title>Roadmap</title>",
    );
  });

  it("serves a generic-mode build by the same rules — resolution, containment and Content-Type (UI9.6)", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(join(root, "README.md"), "# Example\n\nBody.\n", "utf8");
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n- one\n",
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
    const base = await listen(outDir);

    expect((await rawGet(base, "/")).contentType).toContain("text/html");
    expect((await rawGet(base, "/changelog")).body).toContain("Changelog");
    expect((await rawGet(base, "/changelog/")).body).toContain("Changelog");
    expect((await rawGet(base, "/assets/szd-base.css")).contentType).toContain(
      "text/css",
    );
    expect((await rawGet(base, "/../README.md")).status).toBe(404);
  });
});

/** Spawns the CLI so `command` and any `args` stay alive until `kill()`d, resolving once the listening URL is logged. */
async function spawnServer(
  root: string,
  command: string,
  args: string[] = [],
): Promise<{ base: string; kill: () => void }> {
  const child = spawn(
    process.execPath,
    ["--import", tsxLoader, cli, command, ...args],
    { cwd: root },
  );
  children.push(child);
  let output = "";
  const base = await new Promise<string>((resolvePromise, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolvePromise(match[0]);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("exit", (code) =>
      reject(
        new Error(`'${command}' exited (${code}) before listening: ${output}`),
      ),
    );
    child.on("error", reject);
  });
  return { base, kill: () => child.kill() };
}

describe("preview command", () => {
  it("builds first, then serves --out-dir on --port, ignoring an --adapter naming a module that does not exist (UI9.5, UI9.8)", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(
      join(root, "README.md"),
      "# Example\n\nOriginal body.\n",
      "utf8",
    );
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n- one\n",
      "utf8",
    );
    const outDir = join(root, "custom-out");

    const first = await spawnServer(root, "preview", [
      "--out-dir",
      "custom-out",
      "--port",
      "0",
      "--adapter",
      "site/does-not-exist.ts",
    ]);
    expect(first.base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await rawGet(first.base, "/")).body).toContain("Original body");
    first.kill();
    await readFile(join(outDir, "index.html"), "utf8");

    // outDir missing beforehand, and a source edit since the last build: preview
    // rebuilds rather than serving what is (or isn't) already on disk (UI9.8).
    await rm(outDir, { recursive: true, force: true });
    await writeFile(
      join(root, "README.md"),
      "# Example\n\nEdited body.\n",
      "utf8",
    );
    const second = await spawnServer(root, "preview", [
      "--out-dir",
      "custom-out",
      "--port",
      "0",
    ]);
    expect((await rawGet(second.base, "/")).body).toContain("Edited body");
    second.kill();
  }, 20_000);
});

describe("generic dev", () => {
  it("serves through the shared static server: no-trailing-slash resolves, a query no longer 404s, and every 200 carries a Content-Type (UI9.7)", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(join(root, "README.md"), "# Example\n\nBody.\n", "utf8");
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n- one\n",
      "utf8",
    );

    const dev = await spawnServer(root, "dev", ["--port", "0"]);
    const withoutSlash = await rawGet(dev.base, "/changelog");
    expect(withoutSlash.status).toBe(200);
    expect(withoutSlash.contentType).toContain("text/html");
    expect(withoutSlash.body).toContain("Changelog");

    const withQuery = await rawGet(dev.base, "/index.html?v=1");
    expect(withQuery.status).toBe(200);
    expect(withQuery.contentType).toContain("text/html");
    dev.kill();
  }, 20_000);
});
