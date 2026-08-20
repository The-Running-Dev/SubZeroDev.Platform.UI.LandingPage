import { describe, expect, it } from "vitest";
import { repositoryFromRemote } from "../src/git.js";

describe("repositoryFromRemote", () => {
  it("resolves a repo name containing interior dots", () => {
    expect(
      repositoryFromRemote(
        "https://github.com/The-Running-Dev/SubZeroDev.Platform.UI.LandingPage.git",
      ),
    ).toBe("The-Running-Dev/SubZeroDev.Platform.UI.LandingPage");
  });

  it("strips a trailing .git suffix from a dot-free repo name", () => {
    expect(
      repositoryFromRemote("https://github.com/The-Running-Dev/example.git"),
    ).toBe("The-Running-Dev/example");
  });

  it("resolves an SSH remote without a .git suffix", () => {
    expect(repositoryFromRemote("git@github.com:owner/repo")).toBe(
      "owner/repo",
    );
  });
});
