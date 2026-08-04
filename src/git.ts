import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", root, ...args], {
      encoding: "utf8",
    });
    return stdout.trim();
  } catch {
    throw new Error(
      "git history is unavailable; use a full Git checkout or supply the required override.",
    );
  }
}

export function repositoryFromRemote(remote: string): string | undefined {
  const match = remote.match(/(?:github\.com[:/])([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match?.[1];
}

export async function inferRepository(
  root: string,
): Promise<string | undefined> {
  return repositoryFromRemote(
    await git(root, ["config", "--get", "remote.origin.url"]),
  );
}
