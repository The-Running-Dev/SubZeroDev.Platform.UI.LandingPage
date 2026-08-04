import { describe, expect, it } from "vitest";
import { baseCss } from "../src/baseCss.js";

describe("generic CSS contract", () => {
  it("contains every documented token and selector", () => {
    for (const token of [
      "bg",
      "surface",
      "text",
      "muted",
      "accent",
      "border",
      "measure",
    ]) {
      expect(baseCss).toContain(`--szd-${token}`);
    }
    for (const selector of [
      "shell",
      "header",
      "brand",
      "nav",
      "main",
      "article",
      "footer",
      "skip-link",
    ]) {
      expect(baseCss).toContain(`.szd-${selector}`);
    }
  });
});
