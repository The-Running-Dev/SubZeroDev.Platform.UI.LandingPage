import { exec as execCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
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
});
