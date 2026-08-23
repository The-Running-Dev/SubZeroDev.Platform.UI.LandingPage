import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// No YAML parser is a dependency of this package (design/30-slices.md, UI12
// "Out of scope"), so these read action.yml and deploy-pages.yml as text
// rather than parsing them.

const root = process.cwd();
const actionYml = await readFile(join(root, "action.yml"), "utf8");
const deployYml = await readFile(
  join(root, ".github/workflows/deploy-pages.yml"),
  "utf8",
);

const deploymentScoped = ["base-path", "docs-url", "canonical-url"];

function inputBlock(source: string, name: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === `${name}:`);
  expect(start, `expected an input named ${name}`).toBeGreaterThanOrEqual(0);
  const indent = lines[start].match(/^\s*/)?.[0].length ?? 0;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    if (line.trim() === "") return false;
    const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
    return lineIndent <= indent;
  });
  return rest.slice(0, end === -1 ? rest.length : end).join("\n");
}

describe("action.yml (UI12)", () => {
  for (const name of deploymentScoped) {
    it(`declares an optional ${name} input with no default`, () => {
      const block = inputBlock(actionYml, name);
      expect(block).toContain("required: false");
      expect(block).not.toContain("default:");
    });
  }

  it("gives package-version a latest default", () => {
    const block = inputBlock(actionYml, "package-version");
    expect(block).toContain("default: latest");
  });

  it("does not interpolate any input directly into the run: text", () => {
    const runIndex = actionYml.indexOf("run: |");
    expect(runIndex).toBeGreaterThanOrEqual(0);
    const runText = actionYml.slice(runIndex);
    expect(runText).not.toContain("${{ inputs.");
  });

  it("reaches every deployment-scoped input through env: as a quoted shell variable", () => {
    for (const name of deploymentScoped) {
      const envVar = name.replace(/-/g, "_").toUpperCase();
      expect(actionYml).toContain(`${envVar}: \${{ inputs.${name} }}`);
      expect(actionYml).toContain(`"$${envVar}"`);
    }
  });

  it("forwards each deployment-scoped flag only when the input is set", () => {
    for (const name of deploymentScoped) {
      const envVar = name.replace(/-/g, "_").toUpperCase();
      expect(actionYml).toContain(
        `if [ -n "$${envVar}" ]; then args+=(--${name} "$${envVar}"); fi`,
      );
    }
  });
});

describe("deploy-pages.yml (UI12)", () => {
  for (const name of deploymentScoped) {
    it(`declares an optional ${name} input`, () => {
      const block = inputBlock(deployYml, name);
      expect(block).toContain("required: false");
      expect(block).toContain("type: string");
    });
  }

  it("keeps package-version required with no default", () => {
    const block = inputBlock(deployYml, "package-version");
    expect(block).toContain("required: true");
    expect(block).not.toContain("default:");
  });

  it("passes every deployment-scoped input to the build step only", () => {
    const steps = deployYml.split(/^\s{6}- /m).slice(1);
    const buildStep = steps.find((step) => step.includes("command: build"));
    const mergeStep = steps.find((step) => step.includes("command: merge"));
    expect(buildStep).toBeDefined();
    expect(mergeStep).toBeDefined();
    for (const name of deploymentScoped) {
      expect(buildStep).toContain(`${name}: \${{ inputs.${name} }}`);
      expect(mergeStep).not.toContain(`${name}:`);
    }
  });

  it("pins the action at a SHA whose action.yml declares every input this workflow passes", () => {
    const pins = [
      ...deployYml.matchAll(
        /The-Running-Dev\/SubZeroDev\.Platform\.UI\.LandingPage@([0-9a-f]{40})/g,
      ),
    ].map((match) => match[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins).size, "every pin in this workflow must agree").toBe(1);

    const pinnedActionYml = execFileSync(
      "git",
      ["show", `${pins[0]}:action.yml`],
      { cwd: root, encoding: "utf8" },
    );
    for (const name of [...deploymentScoped, "command", "package-version"]) {
      expect(inputBlock(pinnedActionYml, name)).toBeDefined();
    }
  });
});
