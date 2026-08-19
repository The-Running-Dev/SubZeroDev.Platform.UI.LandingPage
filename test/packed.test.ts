import { exec as execCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execCallback);
const roots: string[] = [];

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function run(command: string, args: string[], cwd: string) {
  return exec(`${command} ${args.map(quote).join(" ")}`, { cwd });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("packed artifact", () => {
  it("packs dist/cli.js with the executable bit set", async () => {
    // npm install fixes up bin permissions on the linked copy regardless of
    // what the tarball stores, which masks this from every other test here.
    // `npx pkg@version` extracts straight from the tarball and execs it
    // directly, so the tarball's own stored mode is what actually matters.
    const root = await mkdtemp(join(tmpdir(), "szd-packed-mode-"));
    roots.push(root);
    await run("npm", ["pack", "--pack-destination", root], process.cwd());
    const tarball = join(
      root,
      (await readdir(root)).find((name) => name.endsWith(".tgz"))!,
    );
    const extracted = join(root, "extracted");
    await mkdir(extracted, { recursive: true });
    await run("tar", ["-xzf", tarball, "-C", extracted], root);
    const mode = (await stat(join(extracted, "package", "dist", "cli.js")))
      .mode;
    expect(mode & 0o111).not.toBe(0);
  }, 120000);

  it("runs after npm installs the tarball rather than the source tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-packed-"));
    roots.push(root);
    await run("npm", ["pack", "--pack-destination", root], process.cwd());
    const tarball = join(
      root,
      (await readdir(root)).find((name) => name.endsWith(".tgz"))!,
    );
    const consumer = join(root, "consumer");
    await mkdir(consumer, { recursive: true });
    await writeFile(
      join(consumer, "README.md"),
      "# Packed\n\nThe package is installed.\n",
      "utf8",
    );
    await writeFile(
      join(consumer, "CHANGELOG.md"),
      "# Changelog\n\n- packed\n",
      "utf8",
    );
    await run("npm", ["install", "--no-save", tarball], consumer);
    await run(
      "npx",
      ["--no-install", "subzerodev-platform-ui-landing-page", "build"],
      consumer,
    );
    expect(
      await readFile(join(consumer, "site", "dist", "index.html"), "utf8"),
    ).toContain("Packed");
  }, 120000);

  it("prefers a Data.Json landing model and emits its entry runtime map", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-json-packed-"));
    roots.push(root);
    await run("npm", ["pack", "--pack-destination", root], process.cwd());
    const tarball = join(
      root,
      (await readdir(root)).find((name) => name.endsWith(".tgz"))!,
    );
    const consumer = join(root, "consumer");
    await mkdir(join(consumer, "site", "src"), { recursive: true });
    await writeFile(
      join(consumer, "site", "sources.public.yml"),
      "version: 1\nsources:\n  landing-page:\n    at: build\n    path: site/landing.json\n    cache: manual\n  runtime:\n    at: runtime\n    url: https://example.test/data.json\n    cache: manual\n",
      "utf8",
    );
    await writeFile(
      join(consumer, "site", "landing.json"),
      JSON.stringify({
        version: 1,
        kind: "adapter",
        routes: [
          {
            path: "/",
            entry: "src/main.ts",
            dataSourceIds: ["runtime"],
            metadata: { title: "JSON", description: "Loaded from JSON" },
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      join(consumer, "site", "src", "main.ts"),
      "export {};",
      "utf8",
    );
    await run("npm", ["install", "--no-save", tarball], consumer);
    await run(
      "npx",
      ["--no-install", "subzerodev-platform-ui-landing-page", "build"],
      consumer,
    );
    const html = await readFile(
      join(consumer, "site", "dist", "index.html"),
      "utf8",
    );
    expect(html).toContain('id="szd-json-sources"');
    expect(html).toContain('"runtime"');
    expect(html).not.toContain('"landing-page"');
  }, 120000);

  it("composes a packaged consumer's routes from validated build-time data", async () => {
    const root = await mkdtemp(join(tmpdir(), "szd-data-packed-"));
    roots.push(root);
    await run("npm", ["pack", "--pack-destination", root], process.cwd());
    const tarball = join(
      root,
      (await readdir(root)).find((name) => name.endsWith(".tgz"))!,
    );
    const consumer = join(root, "consumer");
    await mkdir(join(consumer, "site"), { recursive: true });
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        name: "packed-data-consumer",
        private: true,
        type: "module",
      }),
      "utf8",
    );
    await writeFile(
      join(consumer, "site", "sources.public.yml"),
      "version: 1\nsources:\n  projects:\n    at: build\n    path: site/projects.json\n    cache: manual\n",
      "utf8",
    );
    await writeFile(
      join(consumer, "site", "projects.json"),
      JSON.stringify({ projects: [{ name: "Packaged project" }] }),
      "utf8",
    );
    await writeFile(
      join(consumer, "site", "landing.config.ts"),
      `import { defineLandingPage, defineLandingPageData } from "subzerodev-platform-ui-landing-page";
       export default defineLandingPageData(
         {
           projects: {
             id: "projects",
             validate: (raw: unknown) =>
               Array.isArray((raw as { projects?: unknown })?.projects)
                 ? { ok: true as const, value: (raw as { projects: { name: string }[] }).projects }
                 : { ok: false as const, message: "projects must be an array" },
           },
         },
         ({ projects }) =>
           defineLandingPage({
             routes: [{ path: "/", body: "<main>" + projects[0].name + "</main>", metadata: { title: "Data", description: "From JSON" } }],
           }),
       );`,
      "utf8",
    );
    await run("npm", ["install", "--no-save", tarball], consumer);
    await run(
      "npx",
      ["--no-install", "subzerodev-platform-ui-landing-page", "build"],
      consumer,
    );
    expect(
      await readFile(join(consumer, "site", "dist", "index.html"), "utf8"),
    ).toContain("<main>Packaged project</main>");
  }, 120000);
});
