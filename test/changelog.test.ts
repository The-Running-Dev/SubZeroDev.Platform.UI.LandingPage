import { describe, expect, it, vi } from "vitest";
import { generateChangelog } from "../src/changelog.js";
import * as gitModule from "../src/git.js";

describe("changelog generation", () => {
  it("links terminal PR subjects, escapes Markdown, and omits regeneration commits", async () => {
    vi.spyOn(gitModule, "git").mockResolvedValue(
      "2026-08-04\u001fA [title] (#12)\n2026-08-03\u001fUpdate changelog\n2026-08-02\u001fOrdinary",
    );
    const content = await generateChangelog(
      ".",
      "HEAD",
      "The-Running-Dev/example",
    );
    expect(content).toContain(
      "[A \\[title\\] (#12)](https://github.com/The-Running-Dev/example/pull/12)",
    );
    expect(content).not.toMatch(/Update changelog/i);
    expect(content).toContain("Ordinary");
  });
});
