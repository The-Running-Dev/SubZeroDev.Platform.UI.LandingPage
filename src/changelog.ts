import { git, inferRepository } from "./git.js";

const separator = "\u001f";

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export async function generateChangelog(
  root: string,
  ref: string,
  repository?: string,
): Promise<string> {
  const resolvedRepository = repository ?? (await inferRepository(root));
  if (!resolvedRepository) {
    throw new Error(
      "Could not infer a GitHub repository from origin; pass --repository owner/name.",
    );
  }
  const output = await git(root, [
    "log",
    "--first-parent",
    ref,
    `--date=short`,
    `--pretty=format:%ad${separator}%s`,
  ]);
  const lines = output.split("\n").flatMap((line) => {
    const [date, subject] = line.split(separator, 2);
    if (!date || !subject || /update changelog/i.test(subject)) return [];
    const title = escapeMarkdown(subject);
    const pr = subject.match(/\(#(\d+)\)\s*$/);
    return pr
      ? [
          `- **${date}** — [${title}](https://github.com/${resolvedRepository}/pull/${pr[1]})`,
        ]
      : [`- **${date}** — ${title}`];
  });
  return [
    "# Changelog",
    "",
    "One entry per merged pull request, newest first — generated from first-parent Git history.",
    "",
    ...lines,
    "",
  ].join("\n");
}
